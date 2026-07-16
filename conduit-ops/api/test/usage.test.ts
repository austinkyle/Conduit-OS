import { describe, expect, it } from 'vitest';
import { recordUsage, resolveCost } from '../src/usage.js';

describe('resolveCost', () => {
  it('uses an explicit costUsd when the caller provides one, ignoring tokens and flat estimates', () => {
    expect(resolveCost('invoice_ocr', { costUsd: 0.25, tokensIn: 1_000_000, tokensOut: 1_000_000 })).toBe(0.25);
  });

  it('computes cost from Haiku token pricing ($1/$5 per MTok in/out) when tokens are given', () => {
    expect(resolveCost('invoice_ocr', { tokensIn: 1_000_000, tokensOut: 200_000 })).toBeCloseTo(2, 6);
  });

  it('treats a tokensOut-only call as having zero input tokens rather than throwing', () => {
    expect(resolveCost('invoice_ocr', { tokensOut: 1_000_000 })).toBeCloseTo(5, 6);
  });

  it('falls back to the flat per-task-type estimate for invoice_ocr when neither cost nor tokens are given', () => {
    expect(resolveCost('invoice_ocr', {})).toBe(0.01);
  });

  it('falls back to the flat per-task-type estimate for supplier_email when neither cost nor tokens are given', () => {
    expect(resolveCost('supplier_email', {})).toBe(0.004);
  });

  it('falls back to zero for an unrecognized task type with no cost or tokens', () => {
    expect(resolveCost('unknown_task_type', {})).toBe(0);
  });
});

describe('recordUsage', () => {
  it('never throws even when the database is unreachable', async () => {
    await expect(recordUsage('00000000-0000-0000-0000-000000000000', 'invoice_ocr', { costUsd: 0 })).resolves.toBeUndefined();
  });
});
