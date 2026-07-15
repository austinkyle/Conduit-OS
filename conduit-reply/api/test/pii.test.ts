import { describe, expect, it } from 'vitest';
import { scrubPii } from '../src/pii.js';

describe('scrubPii', () => {
  it('redacts a Luhn-valid credit card number', () => {
    const result = scrubPii('Card: 4111111111111111');
    expect(result).toContain('[REDACTED_CARD]');
    expect(result).not.toContain('4111111111111111');
  });

  it('redacts an SSN', () => {
    expect(scrubPii('SSN 123-45-6789')).toContain('[REDACTED_SSN]');
  });

  it('redacts a CVV value', () => {
    const result = scrubPii('CVV: 123');
    expect(result).toContain('[REDACTED_CVV]');
    expect(result).not.toContain('123');
  });

  it('redacts a password value', () => {
    const result = scrubPii('password: hunter2');
    expect(result).toContain('[REDACTED_PASSWORD]');
    expect(result).not.toContain('hunter2');
  });

  it('preserves order and tracking numbers', () => {
    const input = 'Hi, where is order #1054? Tracking is 1Z999AA10123456784.';
    const result = scrubPii(input);
    expect(result).toContain('1054');
    expect(result).toContain('1Z999AA10123456784');
    expect(result).toBe(input);
  });

  it('preserves a 15-digit number that fails Luhn', () => {
    const input = 'Reference 123456789012345';
    expect(scrubPii(input)).toBe(input);
  });
});
