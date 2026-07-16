const BASE_URL = (process.env.OPS_API_URL || 'http://localhost:4002').replace(/\/$/, '');
const AUTH_HEADERS = { Authorization: 'Bearer tok_admin_demo' };
// Seeded in 006_ops_seed.sql, deliberately below its safety_stock_limit (42 on hand vs 150 limit)
// to drive a demo alert without waiting on live Shopify order volume.
const LOW_STOCK_SKU = 'TUM-24-STL';

interface InventoryAlert {
  productId: string;
  sku: string;
  inventoryQty: number;
  safetyStockLimit: number;
  suggestedReorderQty: number;
  confidenceScore: number;
}
interface PurchaseOrderItem { productId: string; sku: string; title: string; quantity: number; unitCost: number }
interface PurchaseOrder { id: string; supplierId: string; status: string; items: PurchaseOrderItem[]; totalAmount: number }
interface ScenarioResult { name: string; passed: boolean; detail: string }

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...AUTH_HEADERS,
      ...(init?.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${path} returned ${response.status}: ${text}`);
  return JSON.parse(text) as T;
}

async function pollUntil<T>(fetcher: () => Promise<T>, predicate: (value: T) => boolean, attempts = 20, delayMs = 1000): Promise<T> {
  let last: T | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await fetcher();
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return last as T;
}

async function runScenario(name: string, scenario: () => Promise<string>): Promise<ScenarioResult> {
  try {
    return { name, passed: true, detail: await scenario() };
  } catch (error) {
    return { name, passed: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  if (process.env.ANTHROPIC_API_KEY) {
    console.warn('WARNING: This eval targets the zero-API-key deterministic invoice-parse path; results may differ when ANTHROPIC_API_KEY is set.');
  }

  const results: ScenarioResult[] = [];

  // The nightly forecast BullMQ repeatable job fires its first iteration immediately on worker
  // boot, so alerts should appear within a few seconds of `docker compose up` without any manual
  // trigger. Scenarios 1 and 2 poll for that scan to land.
  const alert = await pollUntil(
    async () => {
      const result = await requestJson<{ alerts: InventoryAlert[] }>('/api/v1/erp/inventory/alerts');
      return result.alerts.find((a) => a.sku === LOW_STOCK_SKU) ?? null;
    },
    (found) => found !== null,
  );

  results.push(await runScenario('Low-stock SKU triggers an alert', async () => {
    assert(alert !== null, `expected an alert for seeded low-stock SKU ${LOW_STOCK_SKU}, none appeared after polling`);
    assert(alert!.inventoryQty <= alert!.safetyStockLimit, `expected inventoryQty (${alert!.inventoryQty}) <= safetyStockLimit (${alert!.safetyStockLimit})`);
    assert(alert!.suggestedReorderQty > 0, 'expected a positive suggested reorder quantity');
    return `${LOW_STOCK_SKU} alerted at ${alert!.inventoryQty}/${alert!.safetyStockLimit} units, suggested reorder ${alert!.suggestedReorderQty}`;
  }));

  results.push(await runScenario('Purchase order auto-drafts with a total matching quantity x unit cost', async () => {
    assert(alert !== null, 'cannot verify PO drafting without a prior low-stock alert');
    const purchaseOrder = await pollUntil(
      async () => {
        const result = await requestJson<{ purchaseOrders: PurchaseOrder[] }>('/api/v1/erp/purchase-orders');
        return result.purchaseOrders.find((po) => po.status === 'Draft' && po.items.some((item) => item.sku === LOW_STOCK_SKU)) ?? null;
      },
      (found) => found !== null,
    );
    assert(purchaseOrder !== null, `expected an auto-drafted Draft PO containing ${LOW_STOCK_SKU}`);
    const expectedTotal = purchaseOrder!.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    assert(Math.abs(purchaseOrder!.totalAmount - expectedTotal) < 0.01, `PO totalAmount ${purchaseOrder!.totalAmount} did not match sum(quantity x unitCost) ${expectedTotal}`);
    const lowStockItem = purchaseOrder!.items.find((item) => item.sku === LOW_STOCK_SKU)!;
    assert(lowStockItem.quantity >= 500, `expected ${LOW_STOCK_SKU}'s reorder quantity (${lowStockItem.quantity}) to respect the supplier MOQ of 500`);
    return `PO ${purchaseOrder!.id} drafted with ${purchaseOrder!.items.length} item(s), total $${purchaseOrder!.totalAmount.toFixed(2)} matches quantity x unit cost`;
  }));

  results.push(await runScenario('Returns scan is well-formed and idempotent', async () => {
    // conduit-core's seed data has no refund/cancel orders, so this asserts the scan endpoint's
    // shape and idempotency rather than an actual inventory change (see returns.ts's documented
    // proxy-signal caveat).
    const first = await requestJson<{ scanned: number; logged: number }>('/api/v1/erp/returns/scan', { method: 'POST' });
    assert(typeof first.scanned === 'number' && typeof first.logged === 'number', 'returns scan response missing scanned/logged counts');
    const second = await requestJson<{ scanned: number; logged: number }>('/api/v1/erp/returns/scan', { method: 'POST' });
    assert(second.logged === 0, `second scan should log 0 new returns (dedup via NOT EXISTS), got ${second.logged}`);
    return `first scan: ${first.scanned} scanned / ${first.logged} logged; second scan logged 0 (dedup confirmed)`;
  }));

  results.push(await runScenario('Invoice parse falls back to the deterministic template with zero API keys', async () => {
    const invoiceText = `${LOW_STOCK_SKU} Insulated Steel Tumbler 24oz 100 x $6.75\n`;
    const form = new FormData();
    form.append('file', new Blob([invoiceText], { type: 'text/plain' }), 'invoice.txt');
    const result = await requestJson<{ status: string; source: string; lineItems: Array<{ sku: string; quantity: number; unitCost: number }> }>(
      '/api/v1/erp/invoices/parse',
      { method: 'POST', body: form },
    );
    assert(result.source === 'template', `expected source template, received ${result.source}`);
    assert(result.status === 'Parsed', `expected status Parsed, received ${result.status}`);
    const lineItem = result.lineItems.find((item) => item.sku === LOW_STOCK_SKU);
    assert(lineItem !== undefined, `expected a parsed line item for ${LOW_STOCK_SKU}`);
    assert(lineItem!.quantity === 100 && lineItem!.unitCost === 6.75, `expected qty 100 / unitCost 6.75, received qty ${lineItem!.quantity} / unitCost ${lineItem!.unitCost}`);
    return `invoice parsed via template fallback: ${result.lineItems.length} line item(s)`;
  }));

  console.log('\n========== OPS SCENARIO EVAL ==========');
  for (const result of results) console.log(`${result.passed ? 'PASS' : 'FAIL'}  ${result.name}: ${result.detail}`);
  const passed = results.filter((result) => result.passed).length;
  console.log(`Summary: ${passed}/${results.length} scenarios passed`);
  console.log('========================================');
  process.exitCode = passed === results.length ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error('Scenario eval failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
