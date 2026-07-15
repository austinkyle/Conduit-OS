import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyShopifyHmac(
  rawBody: Buffer,
  secret: string,
  hmacHeader: string,
): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  let received: Buffer;

  try {
    received = Buffer.from(hmacHeader, 'base64');
  } catch {
    return false;
  }

  return received.length === expected.length && timingSafeEqual(received, expected);
}
