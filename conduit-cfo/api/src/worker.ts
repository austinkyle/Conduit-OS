import 'dotenv/config';
import { Worker } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { pool } from './db.js';
import { startCoreEventListener } from './events.js';
import { runFinancialRollup } from './rollup.js';
import { computeLtvCohorts } from './cohorts.js';
import { syncUsageToStripe } from './billing.js';
import {
  rollupQueue,
  cohortQueue,
  billingSyncQueue,
  type RollupJobData,
  type CohortJobData,
  type BillingSyncJobData,
} from './queue.js';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function rollupTenant(tenantId: string, date: string): Promise<void> {
  const snapshot = await runFinancialRollup(tenantId, date);
  console.log(`conduit-cfo rolled up ${tenantId} ${date}: net profit $${snapshot.netProfit}`);
}

const rollupWorker = new Worker<RollupJobData>(
  'financial-rollup',
  async (job) => {
    const date = job.data.date ?? todayIso();
    if (job.data.tenantId === '__all__') {
      const tenants = await pool.query<{ id: string }>('SELECT id FROM tenants');
      for (const tenant of tenants.rows) {
        try {
          await rollupTenant(tenant.id, date);
        } catch (error) {
          console.error('conduit-cfo rollup tenant failed', tenant.id, error);
        }
      }
      return;
    }
    await rollupTenant(job.data.tenantId, date);
  },
  { connection, concurrency: 1 },
);

const cohortWorker = new Worker<CohortJobData>(
  'cohort-recompute',
  async (job) => {
    if (job.data.tenantId === '__all__') {
      const tenants = await pool.query<{ id: string }>('SELECT id FROM tenants');
      for (const tenant of tenants.rows) {
        try {
          await computeLtvCohorts(tenant.id);
        } catch (error) {
          console.error('conduit-cfo cohort recompute tenant failed', tenant.id, error);
        }
      }
      return;
    }
    await computeLtvCohorts(job.data.tenantId);
  },
  { connection, concurrency: 1 },
);

const billingSyncWorker = new Worker<BillingSyncJobData>(
  'billing-sync',
  async (job) => {
    if (job.data.tenantId === '__all__') {
      const tenants = await pool.query<{ id: string }>('SELECT id FROM tenants');
      for (const tenant of tenants.rows) {
        try {
          const { reported } = await syncUsageToStripe(tenant.id);
          if (reported > 0) {
            console.log(`conduit-cfo billing sync reported ${reported} usage row(s) for tenant ${tenant.id}`);
          }
        } catch (error) {
          console.error('conduit-cfo billing sync tenant failed', tenant.id, error);
        }
      }
      return;
    }
    await syncUsageToStripe(job.data.tenantId);
  },
  { connection, concurrency: 1 },
);

rollupWorker.on('failed', (job, error) => console.error('conduit-cfo rollup job failed', job?.id, error));
rollupWorker.on('error', (error) => console.error('conduit-cfo rollup worker error', error));
cohortWorker.on('failed', (job, error) => console.error('conduit-cfo cohort job failed', job?.id, error));
cohortWorker.on('error', (error) => console.error('conduit-cfo cohort worker error', error));
billingSyncWorker.on('failed', (job, error) => console.error('conduit-cfo billing sync job failed', job?.id, error));
billingSyncWorker.on('error', (error) => console.error('conduit-cfo billing sync worker error', error));

// Same immediate-one-off + repeatable trick conduit-ops's worker.ts uses — without it, a fresh
// `docker compose up` would show zero snapshot history for today until the first 24h tick.
void rollupQueue.add('rollup-all-tenants-initial', { tenantId: '__all__' })
  .catch((error) => console.error('conduit-cfo initial rollup registration failed', error));
void rollupQueue.add(
  'rollup-all-tenants',
  { tenantId: '__all__' },
  { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: 'rollup-repeatable' },
).catch((error) => console.error('conduit-cfo rollup repeatable registration failed', error));

void cohortQueue.add('cohort-recompute-all-initial', { tenantId: '__all__' })
  .catch((error) => console.error('conduit-cfo initial cohort recompute registration failed', error));
void cohortQueue.add(
  'cohort-recompute-all',
  { tenantId: '__all__' },
  { repeat: { every: 30 * 24 * 60 * 60 * 1000 }, jobId: 'cohort-recompute-repeatable' },
).catch((error) => console.error('conduit-cfo cohort recompute repeatable registration failed', error));

void billingSyncQueue.add('billing-sync-all-initial', { tenantId: '__all__' })
  .catch((error) => console.error('conduit-cfo initial billing sync registration failed', error));
void billingSyncQueue.add(
  'billing-sync-all',
  { tenantId: '__all__' },
  { repeat: { every: 60 * 60 * 1000 }, jobId: 'billing-sync-repeatable' },
).catch((error) => console.error('conduit-cfo billing sync repeatable registration failed', error));

// Debounce bursts of order events (e.g. a BFCM spike) into one rollup per tenant per 5-minute
// bucket — the deterministic jobId makes a repeat `add` within the same bucket a no-op in BullMQ.
startCoreEventListener((event) => {
  if (!event.topic.startsWith('orders/')) return;
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
  void rollupQueue.add(
    'rollup-on-event',
    { tenantId: event.tenantId },
    { jobId: `evt-rollup:${event.tenantId}:${bucket}`, delay: 30_000 },
  ).catch((error) => console.error('conduit-cfo event-driven rollup enqueue failed', error));
});

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await rollupWorker.close();
  await cohortWorker.close();
  await billingSyncWorker.close();
  await rollupQueue.close();
  await cohortQueue.close();
  await billingSyncQueue.close();
  await connection.quit();
  await pool.end();
}

process.on('SIGTERM', () => {
  void shutdown().then(() => process.exit(0)).catch((error) => {
    console.error('conduit-cfo worker shutdown failed', error);
    process.exit(1);
  });
});
process.on('SIGINT', () => {
  void shutdown().then(() => process.exit(0)).catch((error) => {
    console.error('conduit-cfo worker shutdown failed', error);
    process.exit(1);
  });
});

console.log('conduit-cfo financial rollup worker listening');
