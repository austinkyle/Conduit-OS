import { describe, expect, it } from 'vitest';
import { recordUsage, resolveCost } from '../src/usage.js';

describe('resolveCost', () => {
  it('uses an explicit costUsd when the caller provides one, ignoring tokens and flat estimates', () => {
    expect(resolveCost('fraud_screen', { costUsd: 0.25, tokensIn: 1_000_000, tokensOut: 1_000_000 })).toBe(0.25);
  });

  it('computes cost from Haiku token pricing ($1/$5 per MTok in/out) when tokens are given', () => {
    expect(resolveCost('fraud_screen', { tokensIn: 1_000_000, tokensOut: 200_000 })).toBeCloseTo(2, 6);
  });

  it('treats a tokensOut-only call as having zero input tokens rather than throwing', () => {
    expect(resolveCost('fraud_screen', { tokensOut: 1_000_000 })).toBeCloseTo(5, 6);
  });

  it('falls back to the flat per-task-type estimate when neither cost nor tokens are given', () => {
    expect(resolveCost('fraud_screen', {})).toBe(0.001);
  });

  it('falls back to zero for an unrecognized task type with no cost or tokens', () => {
    expect(resolveCost('unknown_task_type', {})).toBe(0);
  });
});

describe('recordUsage', () => {
  it('never throws even when the database is unreachable', async () => {
    await expect(recordUsage('00000000-0000-0000-0000-000000000000', 'fraud_screen', { costUsd: 0 })).resolves.toBeUndefined();
  });
});
