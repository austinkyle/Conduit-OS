import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../auth.js';
import { withTenant } from '../db.js';
import { webhookQueue } from '../queue.js';

type EventStatus = 'Pending' | 'Processed' | 'Failed';

interface LedgerQuery {
  status?: string;
  topic?: string;
  q?: string;
  limit?: string;
  offset?: string;
}

interface ReplayParams {
  id: string;
}

interface CountRow {
  pending: string;
  processed: string;
  failed: string;
}

const VALID_STATUSES = new Set<EventStatus>(['Pending', 'Processed', 'Failed']);

function boundedInteger(value: string | undefined, fallback: number, maximum?: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return maximum === undefined ? parsed : Math.min(parsed, maximum);
}

export async function ledgerRoutes(server: FastifyInstance): Promise<void> {
  server.get<{ Querystring: LedgerQuery }>(
    '/api/v1/ledger/events',
    { preHandler: authenticate },
    async (request, reply) => {
      const { status, topic, q } = request.query;
      if (status && !VALID_STATUSES.has(status as EventStatus)) {
        return reply.code(400).send({ error: 'Invalid status' });
      }

      const limit = boundedInteger(request.query.limit, 50, 200);
      const offset = boundedInteger(request.query.offset, 0);
      const tenantId = request.user.tenantId;

      const result = await withTenant(tenantId, async (client) => {
        const filterValues: unknown[] = [tenantId];
        const baseConditions = ['tenant_id = $1'];

        if (topic) {
          filterValues.push(topic);
          baseConditions.push(`topic = $${filterValues.length}`);
        }
        if (q) {
          filterValues.push(`%${q}%`);
          baseConditions.push(
            `(shopify_event_id ILIKE $${filterValues.length} OR topic ILIKE $${filterValues.length})`,
          );
        }

        const eventConditions = [...baseConditions];
        const eventValues = [...filterValues];
        if (status) {
          eventValues.push(status);
          eventConditions.push(`status = $${eventValues.length}`);
        }

        const totalResult = await client.query<{ total: string }>(
          `SELECT count(*)::text AS total
             FROM webhook_ledger
            WHERE ${eventConditions.join(' AND ')}`,
          eventValues,
        );

        const pageValues = [...eventValues, limit, offset];
        const eventsResult = await client.query(
          `SELECT id, tenant_id, shopify_event_id, topic, payload, status,
                  attempts, last_error, received_at, processed_at
             FROM webhook_ledger
            WHERE ${eventConditions.join(' AND ')}
            ORDER BY received_at DESC
            LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
          pageValues,
        );

        const countsResult = await client.query<CountRow>(
          `SELECT count(*) FILTER (WHERE status = 'Pending')::text AS pending,
                  count(*) FILTER (WHERE status = 'Processed')::text AS processed,
                  count(*) FILTER (WHERE status = 'Failed')::text AS failed
             FROM webhook_ledger
            WHERE ${baseConditions.join(' AND ')}`,
          filterValues,
        );

        const counts = countsResult.rows[0] ?? { pending: '0', processed: '0', failed: '0' };
        return {
          events: eventsResult.rows,
          total: Number(totalResult.rows[0]?.total ?? 0),
          counts: {
            pending: Number(counts.pending),
            processed: Number(counts.processed),
            failed: Number(counts.failed),
          },
        };
      });

      return reply.send(result);
    },
  );

  server.post<{ Params: ReplayParams }>(
    '/api/v1/ledger/events/:id/replay',
    { preHandler: [authenticate, requireRole('Owner', 'Admin')] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const ledgerId = request.params.id;

      const found = await withTenant(tenantId, async (client) => {
        const existing = await client.query<{ id: string }>(
          'SELECT id FROM webhook_ledger WHERE id = $1 AND tenant_id = $2',
          [ledgerId, tenantId],
        );
        if (!existing.rows[0]) return false;

        await client.query(
          `UPDATE webhook_ledger
              SET status = 'Pending', last_error = NULL
            WHERE id = $1 AND tenant_id = $2`,
          [ledgerId, tenantId],
        );
        return true;
      });

      if (!found) {
        return reply.code(404).send({ error: 'Ledger event not found' });
      }

      await webhookQueue.add('process-webhook', { ledgerId, tenantId });
      return reply.send({ ok: true });
    },
  );
}
