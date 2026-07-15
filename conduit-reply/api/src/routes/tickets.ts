import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth.js';
import { withTenant } from '../db.js';
import { ticketQueue } from '../queue.js';

function boundedInteger(value: string | undefined, fallback: number, maximum?: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return maximum === undefined ? parsed : Math.min(parsed, maximum);
}

interface TicketRow {
  id: string;
  customer_id: string | null;
  channel: 'Email' | 'SMS';
  status: 'Open' | 'Pending_Human' | 'Closed';
  sentiment: string | null;
  category: string | null;
  summary: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface MessageRow {
  id: string;
  ticket_id: string;
  sender_type: 'Customer' | 'Human_Agent' | 'AI_Agent';
  body: string;
  created_at: Date | string;
}

function mapTicket(row: TicketRow) {
  return {
    id: row.id,
    customerId: row.customer_id,
    channel: row.channel,
    status: row.status,
    sentiment: row.sentiment,
    category: row.category,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    senderType: row.sender_type,
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function ticketRoutes(server: FastifyInstance): Promise<void> {
  server.post<{ Body: { customerId?: string; channel: 'Email' | 'SMS'; body: string } }>(
    '/api/v1/crm/tickets',
    { preHandler: authenticate },
    async (request, reply) => {
      const { customerId, channel, body } = request.body ?? {};
      if (channel !== 'Email' && channel !== 'SMS') {
        return reply.code(400).send({ error: 'Channel must be Email or SMS' });
      }
      if (typeof body !== 'string' || body.trim().length === 0) {
        return reply.code(400).send({ error: 'Body must be a non-empty string' });
      }

      const tenantId = request.user.tenantId;
      const ticket = await withTenant(tenantId, async (client) => {
        const result = await client.query<Pick<TicketRow, 'id' | 'status' | 'created_at'>>(
          `INSERT INTO tickets (tenant_id, customer_id, channel)
           VALUES ($1, $2, $3)
           RETURNING id, status, created_at`,
          [tenantId, customerId ?? null, channel],
        );
        const created = result.rows[0];
        await client.query(
          `INSERT INTO messages (ticket_id, tenant_id, sender_type, body)
           VALUES ($1, $2, 'Customer', $3)`,
          [created.id, tenantId, body],
        );
        return created;
      });

      await ticketQueue.add('classify-ticket', { ticketId: ticket.id, tenantId });
      return reply.code(201).send({ id: ticket.id, status: 'Open', createdAt: ticket.created_at });
    },
  );

  server.get<{ Querystring: { status?: string; channel?: string; limit?: string; offset?: string } }>(
    '/api/v1/crm/tickets',
    { preHandler: authenticate },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const limit = boundedInteger(request.query.limit, 50, 200);
      const offset = boundedInteger(request.query.offset, 0);

      const result = await withTenant(tenantId, async (client) => {
        const conditions = ['tenant_id = $1'];
        const parameters: unknown[] = [tenantId];
        if (request.query.status !== undefined) {
          parameters.push(request.query.status);
          conditions.push(`status = $${parameters.length}`);
        }
        if (request.query.channel !== undefined) {
          parameters.push(request.query.channel);
          conditions.push(`channel = $${parameters.length}`);
        }

        const where = conditions.join(' AND ');
        const countResult = await client.query<{ total: string }>(
          `SELECT count(*) AS total FROM tickets WHERE ${where}`,
          parameters,
        );
        const pageParameters = [...parameters, limit, offset];
        const ticketsResult = await client.query<TicketRow>(
          `SELECT id, customer_id, channel, status, sentiment, category, summary,
                  created_at, updated_at
             FROM tickets
            WHERE ${where}
            ORDER BY created_at DESC
            LIMIT $${pageParameters.length - 1} OFFSET $${pageParameters.length}`,
          pageParameters,
        );
        const countsResult = await client.query<{ open: string; pending_human: string; closed: string }>(
          `SELECT count(*) FILTER (WHERE status = 'Open') AS open,
                  count(*) FILTER (WHERE status = 'Pending_Human') AS pending_human,
                  count(*) FILTER (WHERE status = 'Closed') AS closed
             FROM tickets
            WHERE tenant_id = $1`,
          [tenantId],
        );

        return {
          tickets: ticketsResult.rows.map(mapTicket),
          total: Number(countResult.rows[0].total),
          counts: {
            open: Number(countsResult.rows[0].open),
            pendingHuman: Number(countsResult.rows[0].pending_human),
            closed: Number(countsResult.rows[0].closed),
          },
        };
      });

      return reply.send(result);
    },
  );

  server.post<{ Params: { id: string }; Body: { body: string } }>(
    '/api/v1/crm/tickets/:id/messages',
    { preHandler: authenticate },
    async (request, reply) => {
      const { body } = request.body ?? {};
      if (typeof body !== 'string' || body.trim().length === 0) {
        return reply.code(400).send({ error: 'Body must be a non-empty string' });
      }

      const tenantId = request.user.tenantId;
      const message = await withTenant(tenantId, async (client) => {
        const ticketResult = await client.query<{ id: string }>(
          'SELECT id FROM tickets WHERE id = $1 AND tenant_id = $2',
          [request.params.id, tenantId],
        );
        if (!ticketResult.rows[0]) return null;

        const messageResult = await client.query<MessageRow>(
          `INSERT INTO messages (ticket_id, tenant_id, sender_type, body)
           VALUES ($1, $2, 'Human_Agent', $3)
           RETURNING id, ticket_id, sender_type, body, created_at`,
          [request.params.id, tenantId, body.trim()],
        );
        await client.query(
          'UPDATE tickets SET updated_at = now() WHERE id = $1 AND tenant_id = $2',
          [request.params.id, tenantId],
        );
        return mapMessage(messageResult.rows[0]);
      });

      if (!message) return reply.code(404).send({ error: 'Ticket not found' });
      return reply.code(201).send(message);
    },
  );

  server.get<{ Params: { id: string } }>(
    '/api/v1/crm/tickets/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const result = await withTenant(tenantId, async (client) => {
        const ticketResult = await client.query<TicketRow>(
          `SELECT id, customer_id, channel, status, sentiment, category, summary,
                  created_at, updated_at
             FROM tickets
            WHERE id = $1 AND tenant_id = $2`,
          [request.params.id, tenantId],
        );
        const ticket = ticketResult.rows[0];
        if (!ticket) return null;

        const messagesResult = await client.query<MessageRow>(
          `SELECT id, ticket_id, sender_type, body, created_at
             FROM messages
            WHERE ticket_id = $1 AND tenant_id = $2
            ORDER BY created_at ASC`,
          [request.params.id, tenantId],
        );
        return { ticket: mapTicket(ticket), messages: messagesResult.rows.map(mapMessage) };
      });

      if (!result) return reply.code(404).send({ error: 'Ticket not found' });
      return reply.send(result);
    },
  );
}
