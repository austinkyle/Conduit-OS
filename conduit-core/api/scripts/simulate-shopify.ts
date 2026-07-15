import { createHmac, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const API_URL = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const SHOP_DOMAIN = process.env.SHOP_DOMAIN ?? 'aurora-apparel.myshopify.com';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? 'demo_webhook_secret_change_me';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? 'tok_admin_demo';
const COUNT = Number(process.env.COUNT ?? 25);
const CONCURRENCY = 10;

interface SimulatedEvent {
  webhookId: string;
  rawBody: string;
}

interface LedgerCounts {
  pending: number;
  processed: number;
  failed: number;
}

interface WebhookResponse {
  duplicate?: boolean;
  [key: string]: unknown;
}

const people = [
  ['Maya', 'Chen'],
  ['Jordan', 'Williams'],
  ['Sofia', 'Martinez'],
  ['Liam', 'O’Brien'],
  ['Ava', 'Patel'],
  ['Noah', 'Kim'],
  ['Emma', 'Thompson'],
  ['Ethan', 'Nguyen'],
  ['Isabella', 'Garcia'],
  ['Lucas', 'Anderson'],
] as const;

const addresses = [
  { address1: '2140 Market Street', city: 'San Francisco', province: 'California', province_code: 'CA', country: 'United States', country_code: 'US', zip: '94114' },
  { address1: '88 King Street West', city: 'Toronto', province: 'Ontario', province_code: 'ON', country: 'Canada', country_code: 'CA', zip: 'M5H 1J9' },
  { address1: '42 George Street', city: 'Sydney', province: 'New South Wales', province_code: 'NSW', country: 'Australia', country_code: 'AU', zip: '2000' },
] as const;

const products = [
  ['Aurora Cloud Hoodie', 'Midnight / M', 8901, 9901, '89.00'],
  ['Alpine Puffer Vest', 'Sage / L', 8902, 9902, '128.00'],
  ['Everyday Rib Tee', 'Ivory / S', 8903, 9903, '38.00'],
  ['Trailhead Cargo Pant', 'Slate / 32', 8904, 9904, '112.00'],
  ['Meridian Knit Scarf', 'Rust', 8905, 9905, '44.00'],
] as const;

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  }
  return copy;
}

function makeEvents(): SimulatedEvent[] {
  return Array.from({ length: COUNT }, (_, index) => {
    const [firstName, lastName] = people[index % people.length]!;
    const address = addresses[index % addresses.length]!;
    const product = products[index % products.length]!;
    const normalTotal = (20 + Math.random() * 380).toFixed(2);
    const isHighValueFraud = index === 0;
    const isDisposableFraud = index === 1;
    const shippingAddress = isHighValueFraud ? addresses[1]! : address;
    const billingAddress = isHighValueFraud ? addresses[0]! : address;
    const effectiveFirstName = isDisposableFraud ? 'test' : firstName;
    const email = isDisposableFraud
      ? 'bfcm-buyer@mailinator.com'
      : `${firstName}.${lastName.replace(/[^a-z]/gi, '')}${index}@example.com`.toLowerCase();
    const totalPrice = isHighValueFraud ? '5000.00' : normalTotal;

    const payload = {
      id: 100001 + index,
      admin_graphql_api_id: `gid://shopify/Order/${100001 + index}`,
      created_at: new Date(Date.now() - index * 15_000).toISOString(),
      currency: 'USD',
      total_price: totalPrice,
      subtotal_price: totalPrice,
      financial_status: 'paid',
      fulfillment_status: null,
      email,
      customer: {
        id: 700001 + index,
        first_name: effectiveFirstName,
        last_name: lastName,
        email,
      },
      billing_address: { ...billingAddress, first_name: effectiveFirstName, last_name: lastName },
      shipping_address: { ...shippingAddress, first_name: effectiveFirstName, last_name: lastName },
      line_items: [{
        id: 800001 + index,
        title: product[0],
        variant_title: product[1],
        product_id: product[2],
        variant_id: product[3],
        quantity: 1,
        price: isHighValueFraud ? '5000.00' : product[4],
        sku: `AUR-${product[2]}-${index + 1}`,
      }],
      tags: 'BFCM, simulator',
    };

    return { webhookId: randomUUID(), rawBody: JSON.stringify(payload) };
  });
}

async function sendEvent(event: SimulatedEvent): Promise<{ latency: number; body: WebhookResponse }> {
  const signature = createHmac('sha256', WEBHOOK_SECRET)
    .update(Buffer.from(event.rawBody))
    .digest('base64');
  const started = performance.now();
  const response = await fetch(`${API_URL}/api/v1/webhooks/shopify`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Shopify-Hmac-SHA256': signature,
      'X-Shopify-Shop-Domain': SHOP_DOMAIN,
      'X-Shopify-Topic': 'orders/create',
      'X-Shopify-Webhook-Id': event.webhookId,
    },
    body: event.rawBody,
  });
  const latency = performance.now() - started;
  const text = await response.text();
  let body: WebhookResponse = {};
  try {
    body = JSON.parse(text) as WebhookResponse;
  } catch {
    body = { response: text };
  }
  if (!response.ok) {
    throw new Error(`Webhook ${event.webhookId} returned ${response.status}: ${text}`);
  }
  return { latency, body };
}

async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function getLedgerCounts(): Promise<LedgerCounts> {
  const response = await fetch(`${API_URL}/api/v1/ledger/events?limit=1`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Ledger poll returned ${response.status}: ${text}`);
  const payload = JSON.parse(text) as { counts?: LedgerCounts };
  if (!payload.counts) throw new Error('Ledger response did not include counts');
  return payload.counts;
}

async function pollUntilSettled(): Promise<LedgerCounts> {
  const deadline = Date.now() + 60_000;
  let counts = await getLedgerCounts();
  while (counts.pending !== 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    counts = await getLedgerCounts();
  }
  return counts;
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

async function main(): Promise<void> {
  if (!Number.isInteger(COUNT) || COUNT < 5) {
    throw new Error('COUNT must be an integer of at least 5');
  }

  const baselineCounts = await getLedgerCounts();
  await Promise.allSettled(Array.from({ length: 3 }, async () => {
    const response = await fetch(`${API_URL}/healthz`);
    await response.arrayBuffer();
  }));

  console.log(`Firing ${COUNT} shuffled Shopify orders/create events at ${API_URL}...`);
  const events = makeEvents();
  const deliveries = await mapConcurrent(shuffled(events), CONCURRENCY, sendEvent);
  const duplicateEvents = shuffled(events).slice(0, 5);
  const duplicateDeliveries = await mapConcurrent(duplicateEvents, 5, sendEvent);
  const duplicatesAcked = duplicateDeliveries.filter(({ body }) => body.duplicate === true).length;
  const counts = await pollUntilSettled();
  const ledgerCounts = {
    pending: counts.pending,
    processed: counts.processed - baselineCounts.processed,
    failed: counts.failed - baselineCounts.failed,
  };
  const latencies = deliveries.map(({ latency }) => latency);
  const p50 = percentile(latencies, 0.5);
  const p95 = percentile(latencies, 0.95);
  const max = Math.max(...latencies);
  const passed = duplicatesAcked === 5
    && ledgerCounts.processed === COUNT
    && ledgerCounts.failed === 0
    && ledgerCounts.pending === 0
    && p95 < 100;

  console.log('\n========== BFCM SIMULATION REPORT ==========');
  console.log(`Events fired:                         ${COUNT}`);
  console.log(`Duplicates re-sent:                  ${duplicateEvents.length}`);
  console.log(`Duplicates acknowledged as duplicate: ${duplicatesAcked}`);
  console.log(`Ledger counts:                       ${JSON.stringify(ledgerCounts)}`);
  console.log(`Ack latency p50/p95/max ms:          ${p50.toFixed(1)} / ${p95.toFixed(1)} / ${max.toFixed(1)}`);
  console.log(`Verdict:                             ${passed ? 'PASS' : 'FAIL'}`);
  console.log('============================================');

  process.exitCode = passed ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error('Simulation failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
