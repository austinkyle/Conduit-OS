import { withTenant } from './db.js';

export interface UnreportedUsageRow {
  id: string;
  task_type: string;
  cost_usd: string;
  created_at: string;
}

const METER_EVENT_NAME = process.env.STRIPE_USAGE_METER_EVENT_NAME ?? 'conduit_ai_tasks';

// Stripe's metered-billing API wants one event per billable occurrence, keyed by a caller-supplied
// `identifier` so a retried sync can never double-report — the usage_ledger row's own id fills
// that role. Falls back to a `[simulated]` log line when STRIPE_API_KEY is unset, same
// graceful-degradation shape as fees.ts/adspend.ts, so `npm test`/`eval`/`simulate` need no live
// Stripe account.
export async function reportMeterEvent(tenantId: string, row: UnreportedUsageRow): Promise<void> {
  const apiKey = process.env.STRIPE_API_KEY;
  if (!apiKey) {
    console.log(`[simulated] Stripe meter event: tenant=${tenantId} task=${row.task_type} cost=$${row.cost_usd} id=${row.id}`);
    return;
  }

  const params = new URLSearchParams({
    event_name: METER_EVENT_NAME,
    identifier: row.id,
    'payload[stripe_customer_id]': tenantId,
    'payload[value]': row.cost_usd,
    timestamp: String(Math.floor(new Date(row.created_at).getTime() / 1000)),
  });
  const response = await fetch('https://api.stripe.com/v1/billing/meter_events', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  if (!response.ok) throw new Error(`Stripe meter event API returned ${response.status}`);
}

// SKIP LOCKED lets an hourly repeatable run and a manually-triggered run overlap safely — the
// second just skips whatever rows the first already has locked, instead of blocking or
// double-reporting them. Rows are only marked `stripe_reported_at` after every meter event in the
// batch succeeds, so a partial failure leaves the remainder eligible for the next sync.
export async function syncUsageToStripe(tenantId: string): Promise<{ reported: number }> {
  return withTenant(tenantId, async (client) => {
    const result = await client.query<UnreportedUsageRow>(
      `SELECT id, task_type, cost_usd, created_at
         FROM usage_ledger
        WHERE tenant_id = $1 AND stripe_reported_at IS NULL
        ORDER BY created_at ASC
        LIMIT 500
        FOR UPDATE SKIP LOCKED`,
      [tenantId],
    );

    for (const row of result.rows) {
      await reportMeterEvent(tenantId, row);
    }

    if (result.rows.length > 0) {
      await client.query(
        `UPDATE usage_ledger SET stripe_reported_at = now() WHERE id = ANY($1::uuid[])`,
        [result.rows.map((row) => row.id)],
      );
    }

    return { reported: result.rows.length };
  });
}
