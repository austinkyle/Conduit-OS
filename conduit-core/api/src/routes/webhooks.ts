import type { FastifyInstance, FastifyRequest } from 'fastify';
import { pool, withTenant } from '../db.js';
import { verifyShopifyHmac } from '../hmac.js';
import { webhookQueue } from '../queue.js';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

interface TenantRow {
  id: string;
  webhook_secret: string;
}

const TENANT_CACHE_TTL_MS = 60_000;
const tenantCache = new Map<string, { tenant: TenantRow; expiresAt: number }>();

async function getTenant(shopDomain: string): Promise<TenantRow | undefined> {
  const cached = tenantCache.get(shopDomain);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.tenant;
  }
  if (cached) {
    tenantCache.delete(shopDomain);
  }

  const result = await pool.query<TenantRow>(
    'SELECT id, webhook_secret FROM tenants WHERE shopify_domain = $1',
    [shopDomain],
  );
  const tenant = result.rows[0];
  if (tenant) {
    tenantCache.set(shopDomain, { tenant, expiresAt: now + TENANT_CACHE_TTL_MS });
  }
  return tenant;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function registerWebhookRawBodyParser(server: FastifyInstance): void {
  server.removeContentTypeParser('application/json');
  server.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (request, body, done) => {
      const rawBody = body as Buffer;
      request.rawBody = rawBody;
      try {
        done(null, JSON.parse(rawBody.toString('utf8')) as unknown);
      } catch (error) {
        done(error as Error, undefined);
      }
    },
  );
}

export async function webhookRoutes(server: FastifyInstance): Promise<void> {
  server.post('/api/v1/webhooks/shopify', async (request: FastifyRequest, reply) => {
    const shopDomain = headerValue(request.headers['x-shopify-shop-domain']);
    if (!shopDomain) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const tenant = await getTenant(shopDomain);
    if (!tenant) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const tenantId = tenant.id;

    const hmac = headerValue(request.headers['x-shopify-hmac-sha256']);
    if (!tenant || !hmac || !request.rawBody ||
        !verifyShopifyHmac(request.rawBody, tenant.webhook_secret, hmac)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    if (typeof request.body !== 'object' || request.body === null || Array.isArray(request.body)) {
      return reply.code(400).send({ error: 'Invalid webhook payload' });
    }
    const payload = request.body as Record<string, unknown>;
    const eventId = headerValue(request.headers['x-shopify-webhook-id'])
      ?? headerValue(request.headers['x-shopify-event-id'])
      ?? (payload.id == null ? undefined : String(payload.id));
    if (!eventId) {
      return reply.code(400).send({ error: 'Missing Shopify event id' });
    }
    const topic = headerValue(request.headers['x-shopify-topic']) ?? 'unknown';

    const ledgerId = await withTenant(tenantId, async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO webhook_ledger (tenant_id, shopify_event_id, topic, payload)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, shopify_event_id) DO NOTHING
         RETURNING id`,
        [tenantId, eventId, topic, payload],
      );
      return result.rows[0]?.id;
    });

    if (!ledgerId) {
      return reply.code(200).send({ ok: true, duplicate: true });
    }

    await webhookQueue.add('process-webhook', { ledgerId, tenantId });
    return reply.code(200).send({ ok: true, duplicate: false, ledgerId });
  });
}
