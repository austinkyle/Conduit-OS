import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth.js';
import { withTenant } from '../db.js';

interface StatsRow {
  total_tickets: string;
  closed_tickets: string;
  auto_resolved_tickets: string;
  pending_human_tickets: string;
  avg_latency_ms: string | null;
  total_llm_cost_usd: string | null;
}

export async function statsRoutes(server: FastifyInstance): Promise<void> {
  server.get('/api/v1/crm/stats', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    const stats = await withTenant(tenantId, async (client) => {
      const result = await client.query<StatsRow>(
        `SELECT
           (SELECT count(*) FROM tickets WHERE tenant_id = $1) AS total_tickets,
           (SELECT count(*) FROM tickets WHERE tenant_id = $1 AND status = 'Closed') AS closed_tickets,
           (SELECT count(*) FROM tickets t WHERE t.tenant_id = $1 AND t.status = 'Closed'
             AND EXISTS (SELECT 1 FROM ticket_events e WHERE e.ticket_id = t.id AND e.tenant_id = $1 AND e.event_type = 'Action_Executed')
             AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.ticket_id = t.id AND m.tenant_id = $1 AND m.sender_type = 'Human_Agent')) AS auto_resolved_tickets,
           (SELECT count(*) FROM tickets WHERE tenant_id = $1 AND status = 'Pending_Human') AS pending_human_tickets,
           (SELECT avg(latency_ms) FROM ticket_events WHERE tenant_id = $1 AND latency_ms IS NOT NULL) AS avg_latency_ms,
           (SELECT sum(llm_cost_usd) FROM ticket_events WHERE tenant_id = $1) AS total_llm_cost_usd`,
        [tenantId],
      );
      const row = result.rows[0];
      const totalTickets = Number(row.total_tickets);
      const closedTickets = Number(row.closed_tickets);
      return {
        totalTickets,
        autoResolutionRate: closedTickets === 0 ? 0 : Number(row.auto_resolved_tickets) / closedTickets,
        handoffRatio: totalTickets === 0 ? 0 : Number(row.pending_human_tickets) / totalTickets,
        avgLatencyMs: row.avg_latency_ms === null ? 0 : Math.round(Number(row.avg_latency_ms)),
        totalLlmCostUsd: row.total_llm_cost_usd === null ? 0 : Number(row.total_llm_cost_usd),
      };
    });
    return reply.send(stats);
  });
}
