import { Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';

export interface ForecastJobData {
  tenantId: string;
}

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// Purchase-order dispatch (supplier-agent.ts) and invoice parsing (vision.ts) both run
// synchronously inside their route handlers, mirroring conduit-reply's actions.ts — only the
// nightly forecast scan needs a repeatable background job.
export const forecastQueue = new Queue<ForecastJobData>('demand-forecast', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    removeOnComplete: 100,
    removeOnFail: false,
  },
});
