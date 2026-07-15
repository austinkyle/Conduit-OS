import { describe, expect, it } from 'vitest';
import { scoreOrder, type ShopifyOrderLike } from '../src/fraud/scorer.js';

const normalOrder: ShopifyOrderLike = {
  total_price: '80.00',
  currency: 'USD',
  email: 'maya.chen@example.com',
  customer: { first_name: 'Maya', last_name: 'Chen' },
  billing_address: { country_code: 'US', zip: '94107' },
  shipping_address: { country_code: 'US', zip: '94107' },
};

describe('scoreOrder', () => {
  it('does not flag a clean normal order', () => {
    const result = scoreOrder(normalOrder, {
      avgOrderValue: 75,
      recentOrdersFromCustomer: 0,
    });
    expect(result.flagged).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual([]);
  });

  it('flags high-value, address-mismatched orders using disposable email', () => {
    const result = scoreOrder(
      {
        ...normalOrder,
        total_price: 500,
        email: 'buyer@mailinator.com',
        billing_address: { country_code: 'US', zip: '94107' },
        shipping_address: { country_code: 'CA', zip: 'M5V 2T6' },
      },
      { avgOrderValue: 100 },
    );

    expect(result.flagged).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.reasons.map(({ rule }) => rule)).toEqual(
      expect.arrayContaining([
        'abnormal_cart_value',
        'address_mismatch',
        'suspicious_email_domain',
      ]),
    );
  });

  it('adds the rapid-fire rule for recent repeat orders', () => {
    const result = scoreOrder(normalOrder, {
      avgOrderValue: 75,
      recentOrdersFromCustomer: 4,
    });
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'rapid_fire_orders', weight: 25 }),
      ]),
    );
    expect(result.score).toBe(25);
  });

  it('caps the score at 100', () => {
    const result = scoreOrder(
      {
        total_price: 5000,
        email: 'test@mailinator.com',
        customer: { first_name: 'test' },
        billing_address: { country_code: 'US', zip: '10001' },
        shipping_address: { country_code: 'GB', zip: 'SW1A 1AA' },
      },
      { avgOrderValue: 100, recentOrdersFromCustomer: 4 },
    );

    expect(result.reasons.reduce((sum, reason) => sum + reason.weight, 0)).toBeGreaterThan(100);
    expect(result.score).toBe(100);
  });
});
