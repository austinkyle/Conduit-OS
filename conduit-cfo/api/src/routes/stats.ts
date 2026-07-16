import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth.js';
import { withTenant } from '../db.js';

interface StatsRow {
  net_profit: string | number | null;
  gross_margin_pct: string | number | null;
  blended_mer: string | number | null;
  blended_cac: string | number | null;
  snapshot_date: string | null;
}

export async function statsRoutes(server: FastifyInstance): Promise<void> {
  server.get('/api/v1/analytics/stats', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    const stats = await withTenant(tenantId, async (client) => {
      const result = await client.query<StatsRow>(
        `SELECT
           (SELECT net_profit FROM financial_snapshots WHERE tenant_id = $1 ORDER BY date DESC LIMIT 1) AS net_profit,
           (SELECT gross_margin_pct FROM financial_snapshots WHERE tenant_id = $1 ORDER BY date DESC LIMIT 1) AS gross_margin_pct,
           (SELECT blended_mer FROM financial_snapshots WHERE tenant_id = $1 ORDER BY date DESC LIMIT 1) AS blended_mer,
           (SELECT date FROM financial_snapshots WHERE tenant_id = $1 ORDER BY date DESC LIMIT 1) AS snapshot_date,
           (SELECT avg(cac) FROM ltv_cohorts WHERE tenant_id = $1) AS blended_cac`,
        [tenantId],
      );
      const row = result.rows[0];
      return {
        netProfit: row.net_profit === null ? 0 : Number(row.net_profit),
        grossMarginPct: row.gross_margin_pct === null ? 0 : Number(row.gross_margin_pct),
        blendedMer: row.blended_mer === null ? 0 : Number(row.blended_mer),
        blendedCac: row.blended_cac === null ? 0 : Number(row.blended_cac),
        snapshotDate: row.snapshot_date,
      };
    });
    return reply.send(stats);
  });
}
