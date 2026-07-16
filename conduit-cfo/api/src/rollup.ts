import { withTenant } from './db.js';
import { getDailyRevenue } from './revenue.js';
import { getDailyCogs } from './cogs.js';
import { getDailyProcessingFees } from './fees.js';
import { getDailyAdSpend, syncAdSpendForDate } from './adspend.js';

export interface FinancialSnapshot {
  date: string;
  grossRevenue: number;
  cogs: number;
  adSpend: number;
  shippingCosts: number;
  processingFees: number;
  netProfit: number;
  blendedMer: number | null;
  grossMarginPct: number | null;
}

// Shipping cost has no dedicated ledger anywhere in the monorepo — core's `orders` carries a
// shipping_status, not a cost. 6% of gross revenue is a deterministic, documented estimate, the
// same shape ops used for its own synthetic ad-spend projections before a real feed existed.
const SHIPPING_COST_RATE = 0.06;

export interface RollupInputs {
  grossRevenue: number;
  cogs: number;
  adSpend: number;
  processingFees: number;
}

export interface FinancialMetrics {
  shippingCosts: number;
  netProfit: number;
  blendedMer: number | null;
  grossMarginPct: number | null;
}

// Pure calculation, isolated from I/O so it's directly unit-testable — mirrors how ops's
// computeForecast is kept separate from runForecastScan's database reads/writes.
export function computeFinancialMetrics(inputs: RollupInputs): FinancialMetrics {
  const shippingCosts = Number((inputs.grossRevenue * SHIPPING_COST_RATE).toFixed(2));
  const netProfit = Number(
    (inputs.grossRevenue - inputs.cogs - inputs.adSpend - shippingCosts - inputs.processingFees).toFixed(2),
  );
  const blendedMer = inputs.adSpend > 0 ? Number((inputs.grossRevenue / inputs.adSpend).toFixed(4)) : null;
  const grossMarginPct = inputs.grossRevenue > 0
    ? Number(((inputs.grossRevenue - inputs.cogs) / inputs.grossRevenue).toFixed(4))
    : null;
  return { shippingCosts, netProfit, blendedMer, grossMarginPct };
}

// Blends revenue (core), COGS (ops), ad spend (this module's own ledger, optionally live-synced
// from Meta), shipping estimate, and processing fees into one daily snapshot row — the Financial
// Rollup Engine at the center of the spec.
export async function runFinancialRollup(tenantId: string, date: string): Promise<FinancialSnapshot> {
  await syncAdSpendForDate(tenantId, date);

  const [{ grossRevenue }, cogs, adSpend, { processingFees }] = await Promise.all([
    getDailyRevenue(tenantId, date),
    getDailyCogs(tenantId, date),
    getDailyAdSpend(tenantId, date),
    getDailyProcessingFees(tenantId, date),
  ]);

  const { shippingCosts, netProfit, blendedMer, grossMarginPct } = computeFinancialMetrics({
    grossRevenue,
    cogs,
    adSpend,
    processingFees,
  });

  await withTenant(tenantId, async (client) => {
    await client.query(
      `INSERT INTO financial_snapshots
         (tenant_id, date, gross_revenue, cogs, ad_spend, shipping_costs, processing_fees, net_profit, blended_mer, gross_margin_pct, updated_at)
       VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, now())
       ON CONFLICT (tenant_id, date) DO UPDATE SET
         gross_revenue = EXCLUDED.gross_revenue,
         cogs = EXCLUDED.cogs,
         ad_spend = EXCLUDED.ad_spend,
         shipping_costs = EXCLUDED.shipping_costs,
         processing_fees = EXCLUDED.processing_fees,
         net_profit = EXCLUDED.net_profit,
         blended_mer = EXCLUDED.blended_mer,
         gross_margin_pct = EXCLUDED.gross_margin_pct,
         updated_at = now()`,
      [tenantId, date, grossRevenue, cogs, adSpend, shippingCosts, processingFees, netProfit, blendedMer, grossMarginPct],
    );
  });

  return {
    date,
    grossRevenue,
    cogs,
    adSpend,
    shippingCosts,
    processingFees,
    netProfit,
    blendedMer,
    grossMarginPct,
  };
}
