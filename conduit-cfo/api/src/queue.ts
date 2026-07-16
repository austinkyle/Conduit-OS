import { Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';

export interface RollupJobData {
  tenantId: string;
  date?: string;
}

export interface CohortJobData {
  tenantId: string;
}

export interface BillingSyncJobData {
  tenantId: string;
}

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const rollupQueue = new Queue<RollupJobData>('financial-rollup', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    removeOnComplete: 100,
    removeOnFail: false,
  },
});

export const cohortQueue = new Queue<CohortJobData>('cohort-recompute', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    removeOnComplete: 20,
    removeOnFail: false,
  },
});

export const billingSyncQueue = new Queue<BillingSyncJobData>('billing-sync', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    removeOnComplete: 100,
    removeOnFail: false,
  },
});
