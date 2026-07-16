import 'dotenv/config';
import { Worker } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { pool } from './db.js';
import { startCoreEventListener } from './events.js';
import { runForecastScan } from './forecast.js';
import { draftPurchaseOrdersFromForecast } from './po.js';
import { forecastQueue, type ForecastJobData } from './queue.js';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

async function scanTenant(tenantId: string): Promise<void> {
  const rows = await runForecastScan(tenantId);
  const drafted = await draftPurchaseOrdersFromForecast(tenantId, rows);
  if (drafted.length > 0) {
    console.log(`conduit-ops auto-drafted ${drafted.length} purchase order(s) for tenant ${tenantId}`);
  }
}

const forecastWorker = new Worker<ForecastJobData>(
  'demand-forecast',
  async (job) => {
    if (job.data.tenantId === '__all__') {
      const tenants = await pool.query<{ id: string }>('SELECT id FROM tenants');
      for (const tenant of tenants.rows) {
        try {
          await scanTenant(tenant.id);
        } catch (error) {
          console.error('conduit-ops forecast scan tenant failed', tenant.id, error);
        }
      }
      return;
    }
    await scanTenant(job.data.tenantId);
  },
  { connection, concurrency: 1 },
);

forecastWorker.on('failed', (job, error) =>
  console.error('conduit-ops forecast scan job failed', job?.id, error));
forecastWorker.on('error', (error) => console.error('conduit-ops forecast worker error', error));

// BullMQ's `repeat: { every }` schedules its first run one interval out, not immediately — so
// without this extra one-off job, a fresh `docker compose up` would show zero inventory alerts
// for a full 24h until the repeatable job's first tick.
void forecastQueue.add('scan-all-tenants-initial', { tenantId: '__all__' })
  .catch((error) => console.error('conduit-ops initial forecast scan registration failed', error));

void forecastQueue.add(
  'scan-all-tenants',
  { tenantId: '__all__' },
  { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: 'forecast-scan-repeatable' },
).catch((error) => console.error('conduit-ops forecast repeatable registration failed', error));

// Debounce bursts of order events into one forecast scan per tenant per 5-minute bucket — the
// deterministic jobId makes a repeat `add` within the same bucket a no-op in BullMQ.
startCoreEventListener((event) => {
  if (!event.topic.startsWith('orders/')) return;
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
  void forecastQueue.add(
    'forecast-on-event',
    { tenantId: event.tenantId },
    { jobId: `evt-forecast:${event.tenantId}:${bucket}`, delay: 30_000 },
  ).catch((error) => console.error('conduit-ops event-driven forecast enqueue failed', error));
});

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await forecastWorker.close();
  await forecastQueue.close();
  await connection.quit();
  await pool.end();
}

process.on('SIGTERM', () => {
  void shutdown().then(() => process.exit(0)).catch((error) => {
    console.error('conduit-ops worker shutdown failed', error);
    process.exit(1);
  });
});
process.on('SIGINT', () => {
  void shutdown().then(() => process.exit(0)).catch((error) => {
    console.error('conduit-ops worker shutdown failed', error);
    process.exit(1);
  });
});

console.log('conduit-ops forecast worker listening');
