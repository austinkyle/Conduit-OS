import { withTenant } from './db.js';
import { getSalesVelocity } from './velocity.js';

export interface ForecastSignal {
  rule: string;
  weight: number;
  detail: string;
}

export interface ForecastInput {
  inventoryQty: number;
  unitsSold: number;
  windowDays: number;
  leadTimeDays: number;
  safetyStockLimit: number;
  moq: number;
  projectedWeeklySpendUsd: number;
}

export interface ForecastResult {
  predictedDepletionDate: Date | null;
  suggestedReorderQty: number;
  confidenceScore: number;
  adjustedDailyVelocity: number;
  signals: ForecastSignal[];
}

// Deterministic weighted-signal forecast, mirroring conduit-core's fraud scorer style: every
// input contributes an explicit, logged signal rather than a black-box regression. Ad spend is
// read from `ad_spend_projections` — a seeded synthetic stand-in until conduit-cfo exists to
// feed real marketing velocity (see 005_ops_init.sql).
export function computeForecast(input: ForecastInput, now: Date = new Date()): ForecastResult {
  const baseVelocity = input.windowDays > 0 ? input.unitsSold / input.windowDays : 0;
  const adSpendMultiplier = 1 + Math.min(1.5, Math.max(0, input.projectedWeeklySpendUsd) / 5000);
  const adjustedDailyVelocity = baseVelocity * adSpendMultiplier;

  const signals: ForecastSignal[] = [];
  let confidence = 0;

  if (input.unitsSold > 0) {
    confidence += 0.5;
    signals.push({
      rule: 'has_sales_history',
      weight: 0.5,
      detail: `${input.unitsSold} units sold over ${input.windowDays} days`,
    });
  } else {
    confidence += 0.15;
    signals.push({
      rule: 'no_sales_history',
      weight: 0.15,
      detail: 'No orders found in window; falling back to safety-stock threshold only',
    });
  }

  if (baseVelocity >= 1) {
    confidence += 0.25;
    signals.push({
      rule: 'strong_sample_size',
      weight: 0.25,
      detail: `Average velocity ${baseVelocity.toFixed(2)} units/day`,
    });
  }

  if (input.projectedWeeklySpendUsd > 0) {
    confidence += 0.05;
    signals.push({
      rule: 'ad_spend_volatility',
      weight: 0.05,
      detail: `Projected spend $${input.projectedWeeklySpendUsd.toFixed(2)} adds demand uncertainty`,
    });
  } else {
    confidence += 0.1;
    signals.push({
      rule: 'no_ad_spend_volatility',
      weight: 0.1,
      detail: 'No upcoming ad spend projected',
    });
  }

  confidence = Math.min(1, Number(confidence.toFixed(4)));

  if (adjustedDailyVelocity <= 0) {
    const deficit = input.safetyStockLimit - input.inventoryQty;
    const suggestedReorderQty = deficit > 0 ? Math.max(deficit, input.moq) : 0;
    return {
      predictedDepletionDate: null,
      suggestedReorderQty,
      confidenceScore: confidence,
      adjustedDailyVelocity,
      signals,
    };
  }

  const daysOfStockLeft = input.inventoryQty / adjustedDailyVelocity;
  const predictedDepletionDate = new Date(now.getTime() + daysOfStockLeft * 86_400_000);

  const reorderCoverageDays = input.leadTimeDays + 14;
  const targetCoverageUnits = adjustedDailyVelocity * reorderCoverageDays;
  const rawReorderQty = Math.ceil(targetCoverageUnits - input.inventoryQty);
  const suggestedReorderQty = rawReorderQty > 0 ? Math.max(rawReorderQty, input.moq) : 0;

  return {
    predictedDepletionDate,
    suggestedReorderQty,
    confidenceScore: confidence,
    adjustedDailyVelocity,
    signals,
  };
}

export interface ProductForecastRow {
  productId: string;
  sku: string;
  title: string;
  supplierId: string | null;
  inventoryQty: number;
  safetyStockLimit: number;
  leadTimeDays: number;
  moq: number;
  forecast: ForecastResult;
}

export async function runForecastScan(tenantId: string): Promise<ProductForecastRow[]> {
  const velocities = await getSalesVelocity(tenantId, 30);
  const rows: ProductForecastRow[] = [];

  try {
    await withTenant(tenantId, async (client) => {
      const products = await client.query<{
        id: string;
        sku: string;
        title: string;
        supplier_id: string | null;
        inventory_qty: number;
        safety_stock_limit: number;
        lead_time_days: number | null;
        moq: number | null;
      }>(
        `SELECT p.id, p.sku, p.title, p.supplier_id, p.inventory_qty, p.safety_stock_limit,
                s.lead_time_days, s.moq
           FROM products p
           LEFT JOIN suppliers s ON s.id = p.supplier_id
          WHERE p.tenant_id = $1`,
        [tenantId],
      );

      const nextWeekStart = new Date();
      nextWeekStart.setUTCHours(0, 0, 0, 0);

      for (const product of products.rows) {
        const adSpendResult = await client.query<{ projected_spend_usd: string | number }>(
          `SELECT projected_spend_usd
             FROM ad_spend_projections
            WHERE tenant_id = $1 AND product_id = $2 AND week_start >= now() - interval '7 days'
            ORDER BY week_start ASC
            LIMIT 1`,
          [tenantId, product.id],
        );
        const projectedWeeklySpendUsd = Number(adSpendResult.rows[0]?.projected_spend_usd ?? 0);
        const velocity = velocities.get(product.sku);
        const leadTimeDays = product.lead_time_days ?? 14;
        const moq = product.moq ?? 1;

        const forecast = computeForecast({
          inventoryQty: product.inventory_qty,
          unitsSold: velocity?.unitsSold ?? 0,
          windowDays: velocity?.windowDays ?? 30,
          leadTimeDays,
          safetyStockLimit: product.safety_stock_limit,
          moq,
          projectedWeeklySpendUsd,
        });

        await client.query(
          `INSERT INTO demand_forecasts
             (tenant_id, product_id, predicted_depletion_date, suggested_reorder_qty, confidence_score)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            tenantId,
            product.id,
            forecast.predictedDepletionDate,
            forecast.suggestedReorderQty,
            forecast.confidenceScore,
          ],
        );

        rows.push({
          productId: product.id,
          sku: product.sku,
          title: product.title,
          supplierId: product.supplier_id,
          inventoryQty: product.inventory_qty,
          safetyStockLimit: product.safety_stock_limit,
          leadTimeDays,
          moq,
          forecast,
        });
      }
    });
  } catch (error) {
    console.warn('forecast scan failed', error);
  }

  return rows;
}
