import { withTenant } from './db.js';

export interface SkuVelocity {
  sku: string;
  unitsSold: number;
  windowDays: number;
  unitsPerDay: number;
}

// Read-only against core's `orders` table. Core has no dedicated SKU/line-item table — Shopify
// order payloads land in `orders.raw_data` (JSONB), so velocity is derived by unnesting
// `raw_data->'line_items'`. This is a read, never a write, across the core/ops boundary.
export async function getSalesVelocity(tenantId: string, windowDays = 30): Promise<Map<string, SkuVelocity>> {
  const velocities = new Map<string, SkuVelocity>();
  try {
    await withTenant(tenantId, async (client) => {
      const result = await client.query<{ sku: string; units_sold: string | number }>(
        `SELECT item->>'sku' AS sku, SUM(COALESCE((item->>'quantity')::int, 0)) AS units_sold
           FROM orders,
                jsonb_array_elements(COALESCE(raw_data->'line_items', '[]'::jsonb)) AS item
          WHERE tenant_id = $1
            AND created_at > now() - ($2 || ' days')::interval
            AND item->>'sku' IS NOT NULL
          GROUP BY item->>'sku'`,
        [tenantId, windowDays],
      );
      for (const row of result.rows) {
        const unitsSold = Number(row.units_sold);
        velocities.set(row.sku, {
          sku: row.sku,
          unitsSold,
          windowDays,
          unitsPerDay: unitsSold / windowDays,
        });
      }
    });
  } catch (error) {
    console.warn('sales velocity lookup failed', error);
  }
  return velocities;
}
