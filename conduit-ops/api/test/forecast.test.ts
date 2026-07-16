import { describe, expect, it } from 'vitest';
import { computeForecast, type ForecastInput } from '../src/forecast.js';

const NOW = new Date('2026-07-15T00:00:00.000Z');

const baseInput: ForecastInput = {
  inventoryQty: 100,
  unitsSold: 60,
  windowDays: 30,
  leadTimeDays: 14,
  safetyStockLimit: 50,
  moq: 20,
  projectedWeeklySpendUsd: 0,
};

describe('computeForecast', () => {
  it('predicts a depletion date and reorder qty when there is sales velocity', () => {
    const result = computeForecast(baseInput, NOW);
    expect(result.adjustedDailyVelocity).toBeCloseTo(2, 5);
    expect(result.predictedDepletionDate).not.toBeNull();
    expect(result.predictedDepletionDate!.getTime()).toBeGreaterThan(NOW.getTime());
    // targetCoverageUnits = 2 * (14 + 14) = 56; reorder = ceil(56 - 100) < 0 -> 0
    expect(result.suggestedReorderQty).toBe(0);
  });

  it('increases suggested reorder qty as velocity rises relative to inventory', () => {
    const low = computeForecast({ ...baseInput, inventoryQty: 20 }, NOW);
    const lower = computeForecast({ ...baseInput, inventoryQty: 5 }, NOW);
    expect(lower.suggestedReorderQty).toBeGreaterThan(low.suggestedReorderQty);
  });

  it('enforces the supplier MOQ floor when a reorder is needed', () => {
    const result = computeForecast({ ...baseInput, inventoryQty: 10, moq: 500 }, NOW);
    expect(result.suggestedReorderQty).toBeGreaterThanOrEqual(500);
  });

  it('increases suggested reorder qty as lead time grows', () => {
    const shortLead = computeForecast({ ...baseInput, inventoryQty: 10, leadTimeDays: 7 }, NOW);
    const longLead = computeForecast({ ...baseInput, inventoryQty: 10, leadTimeDays: 45 }, NOW);
    expect(longLead.suggestedReorderQty).toBeGreaterThan(shortLead.suggestedReorderQty);
  });

  it('falls back to a safety-stock deficit reorder when there is no sales velocity', () => {
    const result = computeForecast({ ...baseInput, unitsSold: 0, inventoryQty: 30, safetyStockLimit: 150, moq: 40 }, NOW);
    expect(result.adjustedDailyVelocity).toBe(0);
    expect(result.predictedDepletionDate).toBeNull();
    // deficit = 150 - 30 = 120, which exceeds moq of 40
    expect(result.suggestedReorderQty).toBe(120);
    expect(result.signals.map((s) => s.rule)).toContain('no_sales_history');
  });

  it('returns zero reorder qty when there is no velocity and inventory already meets safety stock', () => {
    const result = computeForecast({ ...baseInput, unitsSold: 0, inventoryQty: 200, safetyStockLimit: 150 }, NOW);
    expect(result.suggestedReorderQty).toBe(0);
  });

  it('raises adjusted daily velocity and pulls the depletion date closer as projected ad spend rises', () => {
    const noSpend = computeForecast({ ...baseInput, projectedWeeklySpendUsd: 0 }, NOW);
    const heavySpend = computeForecast({ ...baseInput, projectedWeeklySpendUsd: 5000 }, NOW);
    expect(heavySpend.adjustedDailyVelocity).toBeGreaterThan(noSpend.adjustedDailyVelocity);
    expect(heavySpend.predictedDepletionDate!.getTime()).toBeLessThan(noSpend.predictedDepletionDate!.getTime());
  });

  it('caps the ad-spend multiplier so runaway projected spend cannot dominate the forecast', () => {
    // multiplier = 1 + min(1.5, spend/5000), so it saturates at spend=$7500 (multiplier 2.5x)
    const atCap = computeForecast({ ...baseInput, projectedWeeklySpendUsd: 7500 }, NOW);
    const overCap = computeForecast({ ...baseInput, projectedWeeklySpendUsd: 50000 }, NOW);
    expect(overCap.adjustedDailyVelocity).toBeCloseTo(atCap.adjustedDailyVelocity, 5);
  });

  it('scores higher confidence with sales history and strong sample size than with none', () => {
    const withHistory = computeForecast(baseInput, NOW);
    const noHistory = computeForecast({ ...baseInput, unitsSold: 0 }, NOW);
    expect(withHistory.confidenceScore).toBeGreaterThan(noHistory.confidenceScore);
    expect(withHistory.confidenceScore).toBeLessThanOrEqual(1);
    expect(noHistory.confidenceScore).toBeLessThanOrEqual(1);
  });

  it('logs an explicit signal for every rule that fired, mirroring the fraud scorer style', () => {
    const result = computeForecast(baseInput, NOW);
    const rules = result.signals.map((s) => s.rule);
    expect(rules).toContain('has_sales_history');
    expect(rules).toContain('strong_sample_size');
    expect(rules).toContain('no_ad_spend_volatility');
    for (const signal of result.signals) {
      expect(signal.detail.length).toBeGreaterThan(0);
    }
  });
});
