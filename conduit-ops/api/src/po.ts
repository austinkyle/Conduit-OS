import { withTenant } from './db.js';
import type { ProductForecastRow } from './forecast.js';

export interface DraftedPurchaseOrder {
  purchaseOrderId: string;
  supplierId: string;
  totalAmount: number;
}

// Auto-draft trigger: called by the forecast worker for every product whose forecast crossed
// its safety-stock threshold. Groups all such products by supplier into one Draft PO per
// supplier per scan, since suppliers typically ship a combined order rather than one PO per SKU.
export async function draftPurchaseOrdersFromForecast(
  tenantId: string,
  rows: ProductForecastRow[],
): Promise<DraftedPurchaseOrder[]> {
  const needsReorder = rows.filter(
    (row) => row.forecast.suggestedReorderQty > 0 && row.supplierId,
  );
  if (needsReorder.length === 0) return [];

  const bySupplier = new Map<string, ProductForecastRow[]>();
  for (const row of needsReorder) {
    const supplierId = row.supplierId!;
    const existing = bySupplier.get(supplierId) ?? [];
    existing.push(row);
    bySupplier.set(supplierId, existing);
  }

  const drafted: DraftedPurchaseOrder[] = [];

  await withTenant(tenantId, async (client) => {
    for (const [supplierId, products] of bySupplier) {
      const unitCosts = await client.query<{ id: string; unit_cost: string | number }>(
        `SELECT id, unit_cost FROM products WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenantId, products.map((p) => p.productId)],
      );
      const unitCostById = new Map(unitCosts.rows.map((row) => [row.id, Number(row.unit_cost)]));

      const items = products.map((product) => ({
        productId: product.productId,
        sku: product.sku,
        title: product.title,
        quantity: product.forecast.suggestedReorderQty,
        unitCost: unitCostById.get(product.productId) ?? 0,
      }));
      const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

      const result = await client.query<{ id: string }>(
        `INSERT INTO purchase_orders (tenant_id, supplier_id, status, items, total_amount)
         VALUES ($1, $2, 'Draft', $3::jsonb, $4)
         RETURNING id`,
        [tenantId, supplierId, JSON.stringify(items), totalAmount],
      );
      const purchaseOrderId = result.rows[0].id;

      await client.query(
        `INSERT INTO po_events (tenant_id, purchase_order_id, event_type, detail)
         VALUES ($1, $2, 'Drafted', $3::jsonb)`,
        [tenantId, purchaseOrderId, JSON.stringify({ itemCount: items.length, totalAmount })],
      );

      drafted.push({ purchaseOrderId, supplierId, totalAmount });
    }
  });

  return drafted;
}
