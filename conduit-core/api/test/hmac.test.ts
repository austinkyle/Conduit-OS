import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyShopifyHmac } from '../src/hmac.js';

describe('verifyShopifyHmac', () => {
  const secret = 'shopify_webhook_secret';
  const body = Buffer.from(JSON.stringify({ id: 100001, topic: 'orders/create' }));
  const signature = createHmac('sha256', secret).update(body).digest('base64');

  it('verifies a body signed with the correct secret', () => {
    expect(verifyShopifyHmac(body, secret, signature)).toBe(true);
  });

  it('rejects a signature checked with the wrong secret', () => {
    expect(verifyShopifyHmac(body, 'wrong_secret', signature)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const tampered = Buffer.from(JSON.stringify({ id: 100002, topic: 'orders/create' }));
    expect(verifyShopifyHmac(tampered, secret, signature)).toBe(false);
  });

  it.each(['not-base64!', 'c2hvcnQ=', '', 'A'])(
    'returns false without throwing for malformed or short headers',
    (header) => {
      expect(() => verifyShopifyHmac(body, secret, header)).not.toThrow();
      expect(verifyShopifyHmac(body, secret, header)).toBe(false);
    },
  );
});
