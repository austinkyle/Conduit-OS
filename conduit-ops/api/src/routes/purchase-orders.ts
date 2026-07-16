import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../auth.js';
import { withTenant } from '../db.js';
import { sendPurchaseOrderToSupplier } from '../supplier-agent.js';

interface PoRow {
  id: string;
  supplier_id: string;
  status: 'Draft' | 'Sent' | 'Received' | 'Closed';
  items: unknown;
  total_amount: string | number;
  tracking_url: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapPo(row: PoRow) {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    status: row.status,
    items: row.items,
    totalAmount: Number(row.total_amount),
    trackingUrl: row.tracking_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function purchaseOrderRoutes(server: FastifyInstance): Promise<void> {
  server.post<{ Body: { supplierId: string; items: Array<{ productId: string; sku: string; title: string; quantity: number; unitCost: number }> } }>(
    '/api/v1/erp/purchase-orders',
    { preHandler: [authenticate, requireRole('Owner', 'Admin')] },
    async (request, reply) => {
      const { supplierId, items } = request.body ?? {};
      if (typeof supplierId !== 'string' || !Array.isArray(items) || items.length === 0) {
        return reply.code(400).send({ error: 'supplierId and a non-empty items array are required' });
      }
      const tenantId = request.user.tenantId;
      const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

      const purchaseOrder = await withTenant(tenantId, async (client) => {
        const result = await client.query<PoRow>(
          `INSERT INTO purchase_orders (tenant_id, supplier_id, status, items, total_amount)
           VALUES ($1, $2, 'Draft', $3::jsonb, $4)
           RETURNING id, supplier_id, status, items, total_amount, tracking_url, created_at, updated_at`,
          [tenantId, supplierId, JSON.stringify(items), totalAmount],
        );
        const created = result.rows[0];
        await client.query(
          `INSERT INTO po_events (tenant_id, purchase_order_id, event_type, detail)
           VALUES ($1, $2, 'Drafted', $3::jsonb)`,
          [tenantId, created.id, JSON.stringify({ itemCount: items.length, totalAmount, manual: true })],
        );
        return created;
      });

      return reply.code(201).send(mapPo(purchaseOrder));
    },
  );

  server.get('/api/v1/erp/purchase-orders', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    const purchaseOrders = await withTenant(tenantId, async (client) => {
      const result = await client.query<PoRow>(
        `SELECT id, supplier_id, status, items, total_amount, tracking_url, created_at, updated_at
           FROM purchase_orders
          WHERE tenant_id = $1
          ORDER BY created_at DESC`,
        [tenantId],
      );
      return result.rows.map(mapPo);
    });
    return reply.send({ purchaseOrders });
  });

  server.get<{ Params: { id: string } }>(
    '/api/v1/erp/purchase-orders/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const result = await withTenant(tenantId, async (client) => {
        const poResult = await client.query<PoRow>(
          `SELECT id, supplier_id, status, items, total_amount, tracking_url, created_at, updated_at
             FROM purchase_orders
            WHERE id = $1 AND tenant_id = $2`,
          [request.params.id, tenantId],
        );
        const purchaseOrder = poResult.rows[0];
        if (!purchaseOrder) return null;

        const eventsResult = await client.query(
          `SELECT id, event_type, detail, created_at
             FROM po_events
            WHERE purchase_order_id = $1 AND tenant_id = $2
            ORDER BY created_at ASC`,
          [request.params.id, tenantId],
        );
        return { purchaseOrder: mapPo(purchaseOrder), events: eventsResult.rows };
      });

      if (!result) return reply.code(404).send({ error: 'Purchase order not found' });
      return reply.send(result);
    },
  );

  server.patch<{ Params: { id: string }; Body: { status: 'Sent' | 'Received' | 'Closed'; trackingUrl?: string } }>(
    '/api/v1/erp/purchase-orders/:id',
    { preHandler: [authenticate, requireRole('Owner', 'Admin')] },
    async (request, reply) => {
      const { status, trackingUrl } = request.body ?? {};
      if (!['Sent', 'Received', 'Closed'].includes(status)) {
        return reply.code(400).send({ error: 'status must be Sent, Received, or Closed' });
      }
      const tenantId = request.user.tenantId;

      const exists = await withTenant(tenantId, async (client) => {
        const result = await client.query<{ id: string; status: string }>(
          'SELECT id, status FROM purchase_orders WHERE id = $1 AND tenant_id = $2',
          [request.params.id, tenantId],
        );
        return result.rows[0] ?? null;
      });
      if (!exists) return reply.code(404).send({ error: 'Purchase order not found' });

      if (status === 'Sent') {
        const sendResult = await sendPurchaseOrderToSupplier(tenantId, request.params.id);
        return reply.send({ status: 'Sent', ...sendResult });
      }

      const updated = await withTenant(tenantId, async (client) => {
        if (status === 'Received') {
          const poResult = await client.query<{ items: Array<{ productId: string; quantity: number }> }>(
            'SELECT items FROM purchase_orders WHERE id = $1 AND tenant_id = $2',
            [request.params.id, tenantId],
          );
          const items = poResult.rows[0]?.items ?? [];
          for (const item of items) {
            await client.query(
              `UPDATE products SET inventory_qty = inventory_qty + $1
                WHERE id = $2 AND tenant_id = $3`,
              [item.quantity, item.productId, tenantId],
            );
          }
        }

        await client.query(
          `UPDATE purchase_orders
              SET status = $1, tracking_url = COALESCE($2, tracking_url), updated_at = now()
            WHERE id = $3 AND tenant_id = $4`,
          [status, trackingUrl ?? null, request.params.id, tenantId],
        );
        await client.query(
          `INSERT INTO po_events (tenant_id, purchase_order_id, event_type, detail)
           VALUES ($1, $2, $3, $4::jsonb)`,
          [
            tenantId,
            request.params.id,
            status === 'Received' ? 'Received' : 'Closed',
            JSON.stringify({ trackingUrl: trackingUrl ?? null }),
          ],
        );

        const result = await client.query<PoRow>(
          `SELECT id, supplier_id, status, items, total_amount, tracking_url, created_at, updated_at
             FROM purchase_orders
            WHERE id = $1 AND tenant_id = $2`,
          [request.params.id, tenantId],
        );
        return result.rows[0];
      });

      return reply.send(mapPo(updated));
    },
  );
}
