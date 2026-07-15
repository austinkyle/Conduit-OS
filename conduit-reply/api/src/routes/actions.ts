import type { FastifyInstance } from 'fastify';
import { updateShippingAddress, cancelOrder } from '../actions/shopify.js';
import { authenticate, requireRole } from '../auth.js';
import { withTenant } from '../db.js';

type ActionName = 'update_shipping_address' | 'cancel_order';
interface ActionBody {
  action: ActionName;
  externalOrderId: string;
  newAddress?: Record<string, string>;
}

export async function actionRoutes(server: FastifyInstance): Promise<void> {
  server.post<{ Params: { id: string }; Body: ActionBody }>(
    '/api/v1/crm/tickets/:id/execute-action',
    { preHandler: [authenticate, requireRole('Owner', 'Admin', 'Manager')] },
    async (request, reply) => {
      const { action, externalOrderId, newAddress } = request.body ?? {} as ActionBody;
      if (!['update_shipping_address', 'cancel_order'].includes(action)
        || typeof externalOrderId !== 'string' || externalOrderId.trim().length === 0) {
        return reply.code(400).send({ error: 'Invalid action or externalOrderId' });
      }
      const tenantId = request.user.tenantId;
      const ticketExists = await withTenant(tenantId, async (client) => {
        const result = await client.query<{ id: string }>(
          'SELECT id FROM tickets WHERE id = $1 AND tenant_id = $2',
          [request.params.id, tenantId],
        );
        return Boolean(result.rows[0]);
      });
      if (!ticketExists) return reply.code(404).send({ error: 'Ticket not found' });

      const result = action === 'update_shipping_address'
        ? await updateShippingAddress(externalOrderId, newAddress ?? {})
        : await cancelOrder(externalOrderId);

      await withTenant(tenantId, async (client) => {
        await client.query(
          `INSERT INTO ticket_events
             (tenant_id, ticket_id, event_type, detail, llm_cost_usd, latency_ms)
           VALUES ($1, $2, 'Action_Executed', $3::jsonb, 0, NULL)`,
          [tenantId, request.params.id, JSON.stringify({ action, externalOrderId, result })],
        );
        await client.query(
          `UPDATE tickets SET status = 'Closed', updated_at = now()
            WHERE id = $1 AND tenant_id = $2`,
          [request.params.id, tenantId],
        );
      });
      return reply.send({ result, ticketClosed: true });
    },
  );
}
