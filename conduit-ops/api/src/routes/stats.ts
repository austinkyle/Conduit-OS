import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth.js';
import { withTenant } from '../db.js';

interface StatsRow {
  open_purchase_orders: string;
  active_alerts: string;
  avg_confidence: string | number | null;
  total_forecasted_reorder_value: string | number | null;
}

export async function statsRoutes(server: FastifyInstance): Promise<void> {
  server.get('/api/v1/erp/stats', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    const stats = await withTenant(tenantId, async (client) => {
      const result = await client.query<StatsRow>(
        `SELECT
           (SELECT count(*) FROM purchase_orders WHERE tenant_id = $1 AND status IN ('Draft', 'Sent')) AS open_purchase_orders,
           (SELECT count(DISTINCT p.id)
              FROM products p
              JOIN demand_forecasts f ON f.product_id = p.id AND f.tenant_id = p.tenant_id
             WHERE p.tenant_id = $1
               AND (p.inventory_qty <= p.safety_stock_limit OR f.predicted_depletion_date <= now() + interval '14 days')
           ) AS active_alerts,
           (SELECT avg(confidence_score) FROM demand_forecasts WHERE tenant_id = $1) AS avg_confidence,
           (SELECT sum((item->>'quantity')::int * (item->>'unitCost')::numeric)
              FROM purchase_orders, jsonb_array_elements(items) AS item
             WHERE tenant_id = $1 AND status = 'Draft'
           ) AS total_forecasted_reorder_value`,
        [tenantId],
      );
      const row = result.rows[0];
      return {
        openPurchaseOrders: Number(row.open_purchase_orders),
        activeAlerts: Number(row.active_alerts),
        avgConfidence: row.avg_confidence === null ? 0 : Number(row.avg_confidence),
        totalForecastedReorderValue: row.total_forecasted_reorder_value === null ? 0 : Number(row.total_forecasted_reorder_value),
      };
    });
    return reply.send(stats);
  });
}
