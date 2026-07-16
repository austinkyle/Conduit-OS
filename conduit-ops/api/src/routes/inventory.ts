import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth.js';
import { withTenant } from '../db.js';

interface AlertRow {
  id: string;
  sku: string;
  title: string;
  supplier_id: string | null;
  inventory_qty: number;
  safety_stock_limit: number;
  predicted_depletion_date: Date | string | null;
  suggested_reorder_qty: number;
  confidence_score: string | number;
  forecast_date: Date | string;
}

export async function inventoryRoutes(server: FastifyInstance): Promise<void> {
  server.get('/api/v1/erp/inventory/alerts', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    const alerts = await withTenant(tenantId, async (client) => {
      const result = await client.query<AlertRow>(
        `SELECT DISTINCT ON (p.id)
                p.id, p.sku, p.title, p.supplier_id, p.inventory_qty, p.safety_stock_limit,
                f.predicted_depletion_date, f.suggested_reorder_qty, f.confidence_score, f.forecast_date
           FROM products p
           JOIN demand_forecasts f ON f.product_id = p.id AND f.tenant_id = p.tenant_id
          WHERE p.tenant_id = $1
            AND (
              p.inventory_qty <= p.safety_stock_limit
              OR f.predicted_depletion_date <= now() + interval '14 days'
            )
          ORDER BY p.id, f.forecast_date DESC`,
        [tenantId],
      );
      return result.rows.map((row) => ({
        productId: row.id,
        sku: row.sku,
        title: row.title,
        supplierId: row.supplier_id,
        inventoryQty: row.inventory_qty,
        safetyStockLimit: row.safety_stock_limit,
        predictedDepletionDate: row.predicted_depletion_date,
        suggestedReorderQty: row.suggested_reorder_qty,
        confidenceScore: Number(row.confidence_score),
        forecastDate: row.forecast_date,
      }));
    });
    return reply.send({ alerts });
  });

  server.get('/api/v1/erp/products', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    const products = await withTenant(tenantId, async (client) => {
      const result = await client.query(
        `SELECT id, sku, title, inventory_qty, safety_stock_limit, unit_cost, supplier_id
           FROM products
          WHERE tenant_id = $1
          ORDER BY title ASC`,
        [tenantId],
      );
      return result.rows;
    });
    return reply.send({ products });
  });

  server.get('/api/v1/erp/suppliers', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    const suppliers = await withTenant(tenantId, async (client) => {
      const result = await client.query(
        `SELECT id, name, email, lead_time_days, moq
           FROM suppliers
          WHERE tenant_id = $1
          ORDER BY name ASC`,
        [tenantId],
      );
      return result.rows;
    });
    return reply.send({ suppliers });
  });
}
