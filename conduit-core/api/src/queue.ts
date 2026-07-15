import { Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';

export interface WebhookJobData {
  ledgerId: string;
  tenantId: string;
}

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const webhookQueue = new Queue<WebhookJobData>('webhook-processing', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2_000,
    },
    removeOnComplete: 1_000,
    removeOnFail: false,
  },
});
