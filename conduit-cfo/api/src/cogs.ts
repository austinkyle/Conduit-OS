import { withTenant } from './db.js';

// Read-only cross-module join: unnests core's `orders.raw_data` line items for a given day, then
// matches each SKU against ops's `products.unit_cost`. Mirrors conduit-ops's velocity.ts read
// boundary exactly — never writes to core's or ops's tables. Orders whose SKUs aren't in ops's
// product catalog (e.g. demo data generated independently by each module's simulator) simply
// contribute $0 COGS rather than failing the join.
export async function getDailyCogs(tenantId: string, date: string): Promise<number> {
  try {
    return await withTenant(tenantId, async (client) => {
      const result = await client.query<{ cogs: string | number | null }>(
        `SELECT COALESCE(SUM(COALESCE((item->>'quantity')::int, 0) * COALESCE(p.unit_cost, 0)), 0) AS cogs
           FROM orders o
           CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.raw_data->'line_items', '[]'::jsonb)) AS item
           LEFT JOIN products p
             ON p.tenant_id = o.tenant_id AND p.sku = item->>'sku'
          WHERE o.tenant_id = $1
            AND o.created_at::date = $2::date`,
        [tenantId, date],
      );
      return Number(result.rows[0]?.cogs ?? 0);
    });
  } catch (error) {
    console.warn('conduit-cfo cogs lookup failed', error);
    return 0;
  }
}
