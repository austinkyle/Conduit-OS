import { Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';

export interface TicketJobData {
  ticketId: string;
  tenantId: string;
}

export interface ChurnJobData {
  tenantId: string;
}

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const ticketQueue = new Queue<TicketJobData>('ticket-classification', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: 1_000,
    removeOnFail: false,
  },
});

export const churnQueue = new Queue<ChurnJobData>('churn-scan', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    removeOnComplete: 100,
    removeOnFail: false,
  },
});
