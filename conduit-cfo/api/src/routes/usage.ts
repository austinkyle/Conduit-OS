import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth.js';
import { withTenant } from '../db.js';

interface UsageByModuleRow {
  module: string;
  task_type: string;
  task_count: string;
  total_cost_usd: string;
  tokens_in: string;
  tokens_out: string;
}

interface UsageTotalsRow {
  total_cost_usd: string;
  total_tasks: string;
  unreported_count: string;
}

export async function usageRoutes(server: FastifyInstance): Promise<void> {
  server.get<{ Querystring: { days?: string } }>(
    '/api/v1/usage/summary',
    { preHandler: authenticate },
    async (request, reply) => {
      const days = Math.min(365, Math.max(1, Number(request.query.days ?? 30)));
      const tenantId = request.user.tenantId;

      const summary = await withTenant(tenantId, async (client) => {
        const byModule = await client.query<UsageByModuleRow>(
          `SELECT module, task_type,
                  COUNT(*)::text AS task_count,
                  COALESCE(SUM(cost_usd), 0)::text AS total_cost_usd,
                  COALESCE(SUM(tokens_in), 0)::text AS tokens_in,
                  COALESCE(SUM(tokens_out), 0)::text AS tokens_out
             FROM usage_ledger
            WHERE tenant_id = $1 AND created_at >= now() - ($2 || ' days')::interval
            GROUP BY module, task_type
            ORDER BY total_cost_usd DESC`,
          [tenantId, days],
        );
        const totals = await client.query<UsageTotalsRow>(
          `SELECT
             COALESCE(SUM(cost_usd), 0)::text AS total_cost_usd,
             COUNT(*)::text AS total_tasks,
             COUNT(*) FILTER (WHERE stripe_reported_at IS NULL)::text AS unreported_count
           FROM usage_ledger
          WHERE tenant_id = $1 AND created_at >= now() - ($2 || ' days')::interval`,
          [tenantId, days],
        );
        return { byModule: byModule.rows, totals: totals.rows[0] };
      });

      return reply.send({
        byModule: summary.byModule.map((row) => ({
          module: row.module,
          taskType: row.task_type,
          taskCount: Number(row.task_count),
          totalCostUsd: Number(row.total_cost_usd),
          tokensIn: Number(row.tokens_in),
          tokensOut: Number(row.tokens_out),
        })),
        totalCostUsd: Number(summary.totals.total_cost_usd),
        totalTasks: Number(summary.totals.total_tasks),
        unreportedCount: Number(summary.totals.unreported_count),
      });
    },
  );
}
