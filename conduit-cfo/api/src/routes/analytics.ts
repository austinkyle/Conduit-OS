import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../auth.js';
import { withTenant } from '../db.js';
import { runFinancialRollup } from '../rollup.js';

interface SnapshotRow {
  date: string;
  gross_revenue: string | number;
  cogs: string | number;
  ad_spend: string | number;
  shipping_costs: string | number;
  processing_fees: string | number;
  net_profit: string | number;
  blended_mer: string | number | null;
  gross_margin_pct: string | number | null;
}

function mapSnapshot(row: SnapshotRow) {
  return {
    date: row.date,
    grossRevenue: Number(row.gross_revenue),
    cogs: Number(row.cogs),
    adSpend: Number(row.ad_spend),
    shippingCosts: Number(row.shipping_costs),
    processingFees: Number(row.processing_fees),
    netProfit: Number(row.net_profit),
    blendedMer: row.blended_mer === null ? null : Number(row.blended_mer),
    grossMarginPct: row.gross_margin_pct === null ? null : Number(row.gross_margin_pct),
  };
}

interface CohortRow {
  cohort_month: string;
  cohort_size: number;
  revenue_m0: string | number;
  revenue_m1: string | number;
  revenue_m2: string | number;
  cac: string | number;
  payback_bucket: string | null;
}

function mapCohort(row: CohortRow) {
  return {
    cohortMonth: row.cohort_month,
    cohortSize: row.cohort_size,
    revenueM0: Number(row.revenue_m0),
    revenueM1: Number(row.revenue_m1),
    revenueM2: Number(row.revenue_m2),
    cac: Number(row.cac),
    paybackBucket: row.payback_bucket,
  };
}

export async function analyticsRoutes(server: FastifyInstance): Promise<void> {
  server.get<{ Querystring: { days?: string } }>(
    '/api/v1/analytics/snapshots',
    { preHandler: authenticate },
    async (request, reply) => {
      const days = Math.min(365, Math.max(1, Number(request.query.days ?? 60)));
      const tenantId = request.user.tenantId;
      const snapshots = await withTenant(tenantId, async (client) => {
        const result = await client.query<SnapshotRow>(
          `SELECT date, gross_revenue, cogs, ad_spend, shipping_costs, processing_fees, net_profit, blended_mer, gross_margin_pct
             FROM financial_snapshots
            WHERE tenant_id = $1
            ORDER BY date DESC
            LIMIT $2`,
          [tenantId, days],
        );
        return result.rows.map(mapSnapshot).reverse();
      });
      return reply.send({ snapshots });
    },
  );

  server.get('/api/v1/analytics/cohorts', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    const cohorts = await withTenant(tenantId, async (client) => {
      const result = await client.query<CohortRow>(
        `SELECT cohort_month, cohort_size, revenue_m0, revenue_m1, revenue_m2, cac, payback_bucket
           FROM ltv_cohorts
          WHERE tenant_id = $1
          ORDER BY cohort_month ASC`,
        [tenantId],
      );
      return result.rows.map(mapCohort);
    });
    return reply.send({ cohorts });
  });

  server.post(
    '/api/v1/analytics/sync',
    { preHandler: [authenticate, requireRole('Owner', 'Admin')] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const date = new Date().toISOString().slice(0, 10);
      const snapshot = await runFinancialRollup(tenantId, date);
      return reply.send({ snapshot: mapSnapshot({
        date: snapshot.date,
        gross_revenue: snapshot.grossRevenue,
        cogs: snapshot.cogs,
        ad_spend: snapshot.adSpend,
        shipping_costs: snapshot.shippingCosts,
        processing_fees: snapshot.processingFees,
        net_profit: snapshot.netProfit,
        blended_mer: snapshot.blendedMer,
        gross_margin_pct: snapshot.grossMarginPct,
      }) });
    },
  );
}
