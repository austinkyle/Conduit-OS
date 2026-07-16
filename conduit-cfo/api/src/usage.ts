import { withTenant } from './db.js';

const MODULE = 'cfo' as const;

// Flat per-task cost estimates, used only when the caller has neither a real cost nor real token
// counts to hand us — same "estimate when unset" shape as fees.ts's 2.9% + $0.30 card-fee
// fallback. Haiku list pricing ($1/$5 per MTok in/out) is preferred whenever token counts are
// available; see resolveCost.
const FLAT_COST_ESTIMATES: Record<string, number> = {
  copilot_query: 0.006,
};

const HAIKU_INPUT_USD_PER_MTOK = 1;
const HAIKU_OUTPUT_USD_PER_MTOK = 5;

export interface RecordUsageOptions {
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  metadata?: Record<string, unknown>;
}

export function resolveCost(taskType: string, options: RecordUsageOptions): number {
  if (options.costUsd !== undefined) return options.costUsd;
  if (options.tokensIn !== undefined || options.tokensOut !== undefined) {
    const cost = ((options.tokensIn ?? 0) / 1_000_000) * HAIKU_INPUT_USD_PER_MTOK
      + ((options.tokensOut ?? 0) / 1_000_000) * HAIKU_OUTPUT_USD_PER_MTOK;
    return Number(cost.toFixed(6));
  }
  return FLAT_COST_ESTIMATES[taskType] ?? 0;
}

// Records one AI-task execution to the shared usage_ledger (db/migrations/009_integration.sql)
// for the billing sync (billing.ts) and the usage panel (routes/usage.ts) to read back. Never
// throws — same contract as notify.ts's sendSlackAlert — a usage-logging failure must never
// break the caller's actual task.
export async function recordUsage(
  tenantId: string,
  taskType: string,
  options: RecordUsageOptions = {},
): Promise<void> {
  try {
    const costUsd = resolveCost(taskType, options);
    await withTenant(tenantId, async (client) => {
      await client.query(
        `INSERT INTO usage_ledger (tenant_id, module, task_type, tokens_in, tokens_out, cost_usd, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          tenantId,
          MODULE,
          taskType,
          options.tokensIn ?? null,
          options.tokensOut ?? null,
          costUsd,
          JSON.stringify(options.metadata ?? {}),
        ],
      );
    });
  } catch (error) {
    console.warn(`conduit-${MODULE} failed to record usage`, taskType, error);
  }
}
