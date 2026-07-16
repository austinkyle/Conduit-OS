import { Worker, type Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { pool, withTenant } from './db.js';
import type { WebhookJobData } from './queue.js';
import { scoreOrder, type FraudSignal, type ShopifyOrderLike } from './fraud/scorer.js';
import { escalateWithLLM } from './fraud/llm.js';
import { publishProcessedEvent, sendSlackAlert } from './notify.js';
import { recordUsage } from './usage.js';

interface OrderPayload extends ShopifyOrderLike {
  id?: string | number | null;
  customer?: (NonNullable<ShopifyOrderLike['customer']> & { id?: string | number | null }) | null;
  financial_status?: string | null;
  fulfillment_status?: string | null;
  line_items?: unknown[] | null;
  [key: string]: unknown;
}

interface LedgerRow {
  id: string;
  tenant_id: string;
  topic: string;
  payload: OrderPayload;
  status: 'Pending' | 'Processed' | 'Failed';
}

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const worker = new Worker<WebhookJobData>(
  'webhook-processing',
  async (job) => {
    const { ledgerId, tenantId } = job.data;

    await withTenant(tenantId, async (client) => {
      const ledgerResult = await client.query<LedgerRow>(
        `SELECT id, tenant_id, topic, payload, status
         FROM webhook_ledger
         WHERE id = $1 AND tenant_id = $2
         FOR UPDATE`,
        [ledgerId, tenantId],
      );
      const ledger = ledgerResult.rows[0];
      if (!ledger) {
        console.warn('Webhook ledger entry not found', { ledgerId, tenantId });
        return;
      }
      if (ledger.status === 'Processed') return;

      await client.query(
        'UPDATE webhook_ledger SET attempts = attempts + 1 WHERE id = $1',
        [ledgerId],
      );

      let orderId: string | undefined;
      if (ledger.topic.startsWith('orders/')) {
        const payload = ledger.payload;
        if (payload.id === undefined || payload.id === null) {
          throw new Error('Order webhook payload is missing id');
        }

        const customerId = String(payload.customer?.id ?? payload.email ?? '');
        const [averageResult, recentResult] = await Promise.all([
          client.query<{ average: string }>(
            'SELECT COALESCE(AVG(total_price), 0)::text AS average FROM orders WHERE tenant_id = $1',
            [tenantId],
          ),
          client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
             FROM orders
             WHERE tenant_id = $1
               AND customer_id = $2
               AND created_at >= now() - interval '10 minutes'`,
            [tenantId, customerId],
          ),
        ]);
        const heuristic = scoreOrder(payload, {
          avgOrderValue: Number(averageResult.rows[0]?.average ?? 0),
          recentOrdersFromCustomer: Number(recentResult.rows[0]?.count ?? 0),
        });
        const reasons: Array<FraudSignal | { rule: string; weight: number; detail: string }> = [
          ...heuristic.reasons,
        ];
        if (heuristic.flagged) {
          const llm = await escalateWithLLM(payload, heuristic);
          if (llm) {
            reasons.push({
              rule: 'llm_escalation',
              weight: 0,
              detail: `${llm.verdict}: ${llm.rationale}`,
            });
          }
          await recordUsage(tenantId, 'fraud_screen', llm
            ? { metadata: { source: 'llm', verdict: llm.verdict } }
            : { costUsd: 0, metadata: { source: 'heuristic' } });
        }

        const orderResult = await client.query<{ id: string }>(
          `INSERT INTO orders (
             tenant_id, external_order_id, customer_id, total_price, currency,
             payment_status, shipping_status, fraud_score, fraud_flagged,
             fraud_reasons, raw_data
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)
           ON CONFLICT (tenant_id, external_order_id) DO UPDATE SET
             payment_status = EXCLUDED.payment_status,
             shipping_status = EXCLUDED.shipping_status,
             raw_data = EXCLUDED.raw_data,
             fraud_score = EXCLUDED.fraud_score,
             fraud_flagged = EXCLUDED.fraud_flagged,
             fraud_reasons = EXCLUDED.fraud_reasons
           RETURNING id`,
          [
            tenantId,
            String(payload.id),
            customerId,
            Number(payload.total_price ?? 0),
            payload.currency ?? '',
            payload.financial_status ?? null,
            payload.fulfillment_status ?? null,
            heuristic.score,
            heuristic.flagged,
            JSON.stringify(reasons),
            JSON.stringify(payload),
          ],
        );
        orderId = orderResult.rows[0]?.id;
      }

      await client.query(
        `UPDATE webhook_ledger
         SET status = 'Processed', processed_at = now(), last_error = NULL
         WHERE id = $1`,
        [ledgerId],
      );
      await publishProcessedEvent(client, {
        ledgerId,
        tenantId,
        topic: ledger.topic,
        ...(orderId ? { orderId } : {}),
      });
    });
  },
  {
    connection,
    concurrency: Number(process.env.WORKER_CONCURRENCY || 10),
  },
);

async function recordFailure(job: Job<WebhookJobData>, error: Error): Promise<void> {
  const { ledgerId, tenantId } = job.data;
  try {
    const topic = await withTenant(tenantId, async (client) => {
      const result = await client.query<{ topic: string }>(
        `UPDATE webhook_ledger
         SET status = 'Failed', last_error = $2, attempts = GREATEST(attempts, $4)
         WHERE id = $1 AND tenant_id = $3
         RETURNING topic`,
        [ledgerId, error.message, tenantId, job.attemptsMade],
      );
      return result.rows[0]?.topic;
    });

    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await sendSlackAlert(
        `conduit-core webhook failed permanently: tenant=${tenantId} ledgerId=${ledgerId} topic=${topic ?? 'unknown'} error=${error.message}`,
      );
    }
  } catch (failureError) {
    console.error('Failed to record webhook failure', failureError);
  }
}

worker.on('failed', (job, error) => {
  if (job) void recordFailure(job, error);
});

worker.on('error', (error) => {
  console.error('conduit-core worker error', error);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`conduit-core worker shutting down (${signal})`);
  try {
    await worker.close();
    await connection.quit();
    await pool.end();
  } catch (error) {
    console.error('conduit-core worker shutdown failed', error);
    process.exitCode = 1;
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

console.log('conduit-core worker listening');
