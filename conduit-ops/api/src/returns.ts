import { withTenant } from './db.js';

export interface ReturnSignal {
  externalOrderId: string;
  sku: string;
  quantity: number;
  reason: string;
}

// Core has no dedicated returns/refund webhook topic (confirmed against
// conduit-core/api/src/routes/webhooks.ts), so a "return" is proxied from order rows whose
// payment_status/shipping_status indicate a refund or cancellation. This is a documented proxy
// signal, not a real returns feed — read-only against core's `orders` table, never written to.
export async function scanForReturnSignals(tenantId: string): Promise<ReturnSignal[]> {
  try {
    return await withTenant(tenantId, async (client) => {
      const result = await client.query<{
        external_order_id: string;
        sku: string;
        quantity: string | number;
        payment_status: string | null;
        shipping_status: string | null;
      }>(
        `SELECT external_order_id, item->>'sku' AS sku,
                COALESCE((item->>'quantity')::int, 0) AS quantity,
                payment_status, shipping_status
           FROM orders,
                jsonb_array_elements(COALESCE(raw_data->'line_items', '[]'::jsonb)) AS item
          WHERE tenant_id = $1
            AND (payment_status ILIKE 'refund%' OR shipping_status ILIKE 'cancel%')
            AND item->>'sku' IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM returns_log r
               WHERE r.tenant_id = $1 AND r.source_order_id = orders.external_order_id
            )`,
        [tenantId],
      );
      return result.rows.map((row) => ({
        externalOrderId: row.external_order_id,
        sku: row.sku,
        quantity: Number(row.quantity),
        reason: row.payment_status?.toLowerCase().startsWith('refund') ? 'refund' : 'cancelled',
      }));
    });
  } catch (error) {
    console.warn('returns signal scan failed', error);
    return [];
  }
}

export async function runReturnsScan(tenantId: string): Promise<{ scanned: number; logged: number }> {
  const signals = await scanForReturnSignals(tenantId);
  let logged = 0;

  try {
    await withTenant(tenantId, async (client) => {
      for (const signal of signals) {
        const productResult = await client.query<{ id: string }>(
          'SELECT id FROM products WHERE tenant_id = $1 AND sku = $2',
          [tenantId, signal.sku],
        );
        const productId = productResult.rows[0]?.id ?? null;

        await client.query(
          `INSERT INTO returns_log (tenant_id, product_id, source_order_id, qty, reason, defective)
           VALUES ($1, $2, $3, $4, $5, false)`,
          [tenantId, productId, signal.externalOrderId, signal.quantity, signal.reason],
        );

        if (productId) {
          await client.query(
            `UPDATE products SET inventory_qty = inventory_qty + $1
              WHERE id = $2 AND tenant_id = $3`,
            [signal.quantity, productId, tenantId],
          );
        }
        logged += 1;
      }
    });
  } catch (error) {
    console.warn('returns scan logging failed', error);
  }

  return { scanned: signals.length, logged };
}
