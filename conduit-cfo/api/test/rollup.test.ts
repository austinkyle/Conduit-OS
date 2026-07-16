import { describe, expect, it } from 'vitest';
import { computeFinancialMetrics } from '../src/rollup.js';
import { derivePaybackBucket } from '../src/cohorts.js';

describe('computeFinancialMetrics', () => {
  it('reconciles net profit as revenue minus every cost line, including the 6% shipping estimate', () => {
    const result = computeFinancialMetrics({ grossRevenue: 10000, cogs: 3200, adSpend: 2380.95, processingFees: 320 });
    expect(result.shippingCosts).toBeCloseTo(600, 2);
    // 10000 - 3200 - 2380.95 - 600 - 320 = 3499.05
    expect(result.netProfit).toBeCloseTo(3499.05, 2);
  });

  it('computes blended MER as gross revenue divided by ad spend', () => {
    const result = computeFinancialMetrics({ grossRevenue: 10000, cogs: 0, adSpend: 2500, processingFees: 0 });
    expect(result.blendedMer).toBeCloseTo(4, 4);
  });

  it('returns a null MER when there was no ad spend, rather than dividing by zero', () => {
    const result = computeFinancialMetrics({ grossRevenue: 10000, cogs: 0, adSpend: 0, processingFees: 0 });
    expect(result.blendedMer).toBeNull();
  });

  it('computes gross margin percentage as (revenue - cogs) / revenue', () => {
    const result = computeFinancialMetrics({ grossRevenue: 10000, cogs: 3500, adSpend: 100, processingFees: 0 });
    expect(result.grossMarginPct).toBeCloseTo(0.65, 4);
  });

  it('returns a null gross margin when there was no revenue, rather than dividing by zero', () => {
    const result = computeFinancialMetrics({ grossRevenue: 0, cogs: 0, adSpend: 0, processingFees: 0 });
    expect(result.grossMarginPct).toBeNull();
  });

  it('can produce a negative net profit when costs exceed revenue', () => {
    const result = computeFinancialMetrics({ grossRevenue: 1000, cogs: 800, adSpend: 500, processingFees: 50 });
    expect(result.netProfit).toBeLessThan(0);
  });
});

describe('derivePaybackBucket', () => {
  it('buckets a cohort into 30 days when M0 revenue alone covers CAC', () => {
    expect(derivePaybackBucket(50, 60, 90, 120)).toBe('30');
  });

  it('buckets a cohort into 60 days when only cumulative M1 revenue covers CAC', () => {
    expect(derivePaybackBucket(50, 30, 55, 90)).toBe('60');
  });

  it('buckets a cohort into 90 days when only cumulative M2 revenue covers CAC', () => {
    expect(derivePaybackBucket(50, 10, 30, 55)).toBe('90');
  });

  it('buckets a cohort into 90+ when cumulative M2 revenue still has not covered CAC', () => {
    expect(derivePaybackBucket(500, 10, 30, 55)).toBe('90+');
  });
});
