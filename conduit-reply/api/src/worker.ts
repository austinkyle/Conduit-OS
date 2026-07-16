import 'dotenv/config';
import { Worker } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { classifyTicketBody } from './classifier.js';
import { pool, withTenant } from './db.js';
import { startCoreEventListener } from './events.js';
import { runChurnScan } from './churn.js';
import { churnQueue } from './queue.js';
import { recordUsage } from './usage.js';

interface TicketJobData {
  ticketId: string;
  tenantId: string;
}

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const worker = new Worker<TicketJobData>(
  'ticket-classification',
  async (job) => {
    const { ticketId, tenantId } = job.data;
    const body = await withTenant(tenantId, async (client) => {
      const result = await client.query<{ body: string }>(
        `SELECT body
           FROM messages
          WHERE ticket_id = $1 AND tenant_id = $2 AND sender_type = 'Customer'
          ORDER BY created_at DESC
          LIMIT 1`,
        [ticketId, tenantId],
      );
      return result.rows[0]?.body ?? '';
    });

    const classification = await classifyTicketBody(body);
    await withTenant(tenantId, async (client) => {
      await client.query(
        `UPDATE tickets
            SET category = $1, sentiment = $2, summary = $3, updated_at = now()
          WHERE id = $4 AND tenant_id = $5`,
        [classification.category, classification.sentiment, classification.summary, ticketId, tenantId],
      );
      await client.query(
        `INSERT INTO ticket_events
           (tenant_id, ticket_id, event_type, detail, llm_cost_usd, latency_ms)
         VALUES ($1, $2, 'Classified', $3::jsonb, 0, NULL)`,
        [
          tenantId,
          ticketId,
          JSON.stringify({
            category: classification.category,
            sentiment: classification.sentiment,
            source: classification.source,
          }),
        ],
      );
    });

    await recordUsage(tenantId, 'ticket_classification', classification.source === 'llm'
      ? { tokensIn: classification.usage?.inputTokens, tokensOut: classification.usage?.outputTokens, metadata: { source: 'llm' } }
      : { costUsd: 0, metadata: { source: 'heuristic' } });
  },
  { connection, concurrency: Number(process.env.WORKER_CONCURRENCY || 10) },
);

worker.on('failed', (job, error) =>
  console.error('conduit-reply ticket classification job failed', job?.id, error));
worker.on('error', (error) => console.error('conduit-reply worker error', error));

const churnWorker = new Worker<{ tenantId: string }>(
  'churn-scan',
  async (job) => {
    if (job.data.tenantId === '__all__') {
      const tenants = await pool.query<{ id: string }>('SELECT id FROM tenants');
      for (const tenant of tenants.rows) {
        try {
          await runChurnScan(tenant.id);
        } catch (error) {
          console.error('conduit-reply churn scan tenant failed', tenant.id, error);
        }
      }
      return;
    }
    await runChurnScan(job.data.tenantId);
  },
  { connection, concurrency: 1 },
);

churnWorker.on('failed', (job, error) =>
  console.error('conduit-reply churn scan job failed', job?.id, error));
churnWorker.on('error', (error) => console.error('conduit-reply churn worker error', error));

void churnQueue.add(
  'scan-all-tenants',
  { tenantId: '__all__' },
  { repeat: { every: 6 * 60 * 60 * 1000 }, jobId: 'churn-scan-repeatable' },
).catch((error) => console.error('conduit-reply churn repeatable registration failed', error));

// Debounce bursts of order events into one churn scan per tenant per 5-minute bucket — the
// deterministic jobId makes a repeat `add` within the same bucket a no-op in BullMQ.
startCoreEventListener((event) => {
  if (!event.topic.startsWith('orders/')) return;
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
  void churnQueue.add(
    'churn-scan-on-event',
    { tenantId: event.tenantId },
    { jobId: `evt-churn:${event.tenantId}:${bucket}`, delay: 60_000 },
  ).catch((error) => console.error('conduit-reply event-driven churn scan enqueue failed', error));
});

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await worker.close();
  await churnWorker.close();
  await churnQueue.close();
  await connection.quit();
  await pool.end();
}

process.on('SIGTERM', () => {
  void shutdown().then(() => process.exit(0)).catch((error) => {
    console.error('conduit-reply worker shutdown failed', error);
    process.exit(1);
  });
});
process.on('SIGINT', () => {
  void shutdown().then(() => process.exit(0)).catch((error) => {
    console.error('conduit-reply worker shutdown failed', error);
    process.exit(1);
  });
});

console.log('conduit-reply worker listening');
console.log('conduit-reply churn worker listening');
