import { describe, expect, it } from 'vitest';
import { isSafeSelect } from '../src/copilot.js';

describe('isSafeSelect', () => {
  it('accepts a plain single SELECT statement', () => {
    expect(isSafeSelect('SELECT date, net_profit FROM financial_snapshots ORDER BY date DESC LIMIT 30')).toBe(true);
  });

  it('accepts a SELECT statement with a single trailing semicolon', () => {
    expect(isSafeSelect('SELECT cohort_month FROM ltv_cohorts;')).toBe(true);
  });

  it('is case-insensitive on the leading SELECT keyword', () => {
    expect(isSafeSelect('select date from financial_snapshots')).toBe(true);
  });

  it('rejects a bare DELETE statement', () => {
    expect(isSafeSelect('DELETE FROM financial_snapshots')).toBe(false);
  });

  it('rejects a bare UPDATE statement', () => {
    expect(isSafeSelect("UPDATE financial_snapshots SET net_profit = 0")).toBe(false);
  });

  it('rejects a bare DROP TABLE statement', () => {
    expect(isSafeSelect('DROP TABLE financial_snapshots')).toBe(false);
  });

  it('rejects a multi-statement injection stacked after a SELECT', () => {
    expect(isSafeSelect('SELECT 1; DELETE FROM financial_snapshots')).toBe(false);
  });

  it('rejects a SELECT ... INTO that would create a new table', () => {
    expect(isSafeSelect('SELECT * INTO stolen_data FROM financial_snapshots')).toBe(false);
  });

  it('rejects a SELECT with a trailing SQL comment smuggling attempt', () => {
    expect(isSafeSelect("SELECT * FROM financial_snapshots -- ; DROP TABLE financial_snapshots")).toBe(false);
  });

  it('rejects a SELECT with a block-comment smuggling attempt', () => {
    expect(isSafeSelect('SELECT * FROM financial_snapshots /* sneaky */ WHERE 1=1')).toBe(false);
  });

  it('rejects text that is not SQL at all', () => {
    expect(isSafeSelect('please delete all my financial snapshots')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isSafeSelect('')).toBe(false);
  });
});
