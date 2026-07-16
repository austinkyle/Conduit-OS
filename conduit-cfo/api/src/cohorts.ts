import { withTenant } from './db.js';
import { getCustomerFirstOrderMonths, getCohortRevenueThroughMonth } from './revenue.js';

export type PaybackBucket = '30' | '60' | '90' | '90+';

export interface CohortComputation {
  cohortMonth: string;
  cohortSize: number;
  revenueM0: number;
  revenueM1: number;
  revenueM2: number;
  cac: number;
  paybackBucket: PaybackBucket;
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

function addMonths(month: string, count: number): string {
  const d = new Date(`${month}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + count);
  return d.toISOString().slice(0, 10);
}

export function derivePaybackBucket(cac: number, m0: number, m1: number, m2: number): PaybackBucket {
  if (m0 >= cac) return '30';
  if (m1 >= cac) return '60';
  if (m2 >= cac) return '90';
  return '90+';
}

async function getMonthlyAdSpend(tenantId: string, month: string): Promise<number> {
  return withTenant(tenantId, async (client) => {
    const result = await client.query<{ spend: string | number | null }>(
      `SELECT COALESCE(SUM(spend), 0) AS spend
         FROM ad_spend_daily
        WHERE tenant_id = $1 AND date >= $2::date AND date < ($2::date + INTERVAL '1 month')`,
      [tenantId, month],
    );
    return Number(result.rows[0]?.spend ?? 0);
  });
}

// Only cohorts whose M2 (60-day) window has fully closed are (re)computed, so a stored row always
// satisfies revenue_m0 <= revenue_m1 <= revenue_m2 — the still-accruing current cohort is simply
// left unwritten rather than fabricated with a false zero, the same "no signal yet" convention
// ops's forecast.ts uses for products with no sales history.
export async function computeLtvCohorts(tenantId: string): Promise<CohortComputation[]> {
  const customers = await getCustomerFirstOrderMonths(tenantId);
  const byMonth = new Map<string, string[]>();
  for (const customer of customers) {
    const list = byMonth.get(customer.firstOrderMonth) ?? [];
    list.push(customer.customerId);
    byMonth.set(customer.firstOrderMonth, list);
  }

  const now = new Date();
  const results: CohortComputation[] = [];

  for (const [cohortMonth, customerIds] of byMonth) {
    if (monthsBetween(new Date(`${cohortMonth}T00:00:00Z`), now) < 3) continue;

    const cohortSize = customerIds.length;
    const [revenueM0, revenueM1, revenueM2, monthlyAdSpend] = await Promise.all([
      getCohortRevenueThroughMonth(tenantId, customerIds, cohortMonth),
      getCohortRevenueThroughMonth(tenantId, customerIds, addMonths(cohortMonth, 1)),
      getCohortRevenueThroughMonth(tenantId, customerIds, addMonths(cohortMonth, 2)),
      getMonthlyAdSpend(tenantId, cohortMonth),
    ]);

    const cac = cohortSize > 0 ? Number((monthlyAdSpend / cohortSize).toFixed(2)) : 0;
    const perCustomerM0 = cohortSize > 0 ? revenueM0 / cohortSize : 0;
    const perCustomerM1 = cohortSize > 0 ? revenueM1 / cohortSize : 0;
    const perCustomerM2 = cohortSize > 0 ? revenueM2 / cohortSize : 0;

    const computation: CohortComputation = {
      cohortMonth,
      cohortSize,
      revenueM0,
      revenueM1,
      revenueM2,
      cac,
      paybackBucket: derivePaybackBucket(cac, perCustomerM0, perCustomerM1, perCustomerM2),
    };
    results.push(computation);

    await withTenant(tenantId, async (client) => {
      await client.query(
        `INSERT INTO ltv_cohorts (tenant_id, cohort_month, cohort_size, revenue_m0, revenue_m1, revenue_m2, cac, payback_bucket)
         VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (tenant_id, cohort_month) DO UPDATE SET
           cohort_size = EXCLUDED.cohort_size,
           revenue_m0 = EXCLUDED.revenue_m0,
           revenue_m1 = EXCLUDED.revenue_m1,
           revenue_m2 = EXCLUDED.revenue_m2,
           cac = EXCLUDED.cac,
           payback_bucket = EXCLUDED.payback_bucket`,
        [
          tenantId,
          computation.cohortMonth,
          computation.cohortSize,
          computation.revenueM0,
          computation.revenueM1,
          computation.revenueM2,
          computation.cac,
          computation.paybackBucket,
        ],
      );
    });
  }

  return results;
}
