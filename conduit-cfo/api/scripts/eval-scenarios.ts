import { Client } from 'pg';

const BASE_URL = (process.env.CFO_API_URL || 'http://localhost:4003').replace(/\/$/, '');
const AUTH_HEADERS = { Authorization: 'Bearer tok_admin_demo' };
// Outside Docker use host port 5433, matching the convention documented in root .env.example.
const READONLY_DATABASE_URL = process.env.CFO_READONLY_DATABASE_URL
  || 'postgres://conduit_cfo_readonly:conduit_cfo_readonly@localhost:5433/conduit';

interface Snapshot {
  date: string;
  grossRevenue: number;
  cogs: number;
  adSpend: number;
  shippingCosts: number;
  processingFees: number;
  netProfit: number;
}
interface Cohort { cohortMonth: string; revenueM0: number; revenueM1: number; revenueM2: number }
interface ScenarioResult { name: string; passed: boolean; detail: string }

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...AUTH_HEADERS,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${path} returned ${response.status}: ${text}`);
  return JSON.parse(text) as T;
}

async function pollUntil<T>(fetcher: () => Promise<T>, predicate: (value: T) => boolean, attempts = 20, delayMs = 1000): Promise<T> {
  let last: T | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await fetcher();
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return last as T;
}

async function runScenario(name: string, scenario: () => Promise<string>): Promise<ScenarioResult> {
  try {
    return { name, passed: true, detail: await scenario() };
  } catch (error) {
    return { name, passed: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  if (process.env.ANTHROPIC_API_KEY) {
    console.warn('WARNING: This eval targets the zero-API-key deterministic copilot template path; results may differ when ANTHROPIC_API_KEY is set.');
  }

  const results: ScenarioResult[] = [];

  // The nightly rollup BullMQ repeatable job fires its first iteration immediately on worker
  // boot, so a snapshot for today should exist within a few seconds of `docker compose up`.
  const snapshots = await pollUntil(
    async () => (await requestJson<{ snapshots: Snapshot[] }>('/api/v1/analytics/snapshots?days=90')).snapshots,
    (rows) => rows.length > 0,
  );

  results.push(await runScenario('Latest snapshot reconciles: revenue - cogs - ad spend - shipping - fees = net profit', async () => {
    assert(snapshots.length > 0, 'expected at least one financial snapshot, none appeared after polling');
    const latest = snapshots[snapshots.length - 1]!;
    const expectedNetProfit = latest.grossRevenue - latest.cogs - latest.adSpend - latest.shippingCosts - latest.processingFees;
    assert(
      Math.abs(latest.netProfit - expectedNetProfit) < 0.01,
      `netProfit ${latest.netProfit} did not reconcile against revenue-cogs-adspend-shipping-fees ${expectedNetProfit}`,
    );
    return `${latest.date}: revenue $${latest.grossRevenue.toFixed(2)}, net profit $${latest.netProfit.toFixed(2)} reconciles`;
  }));

  results.push(await runScenario('Manual /sync triggers an immediate rollup for today', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const response = await requestJson<{ snapshot: Snapshot }>('/api/v1/analytics/sync', { method: 'POST', body: JSON.stringify({}) });
    assert(response.snapshot.date === today, `expected synced snapshot date ${today}, received ${response.snapshot.date}`);
    return `manual sync produced a snapshot for ${response.snapshot.date}, net profit $${response.snapshot.netProfit.toFixed(2)}`;
  }));

  results.push(await runScenario('Copilot never executes a write, even when asked to in plain English', async () => {
    // Without ANTHROPIC_API_KEY, generateSqlFromTemplate() keyword-matches the question against a
    // fixed list of hardcoded-safe SELECT templates and can never emit a destructive statement, so
    // this proves the *effective* zero-key behavior: a "delete everything" question still resolves
    // to a harmless read and passes the isSafeSelect guard. The unconditional DB-level boundary
    // (independent of the question or the SQL-generation path) is proven separately below.
    const response = await requestJson<{ status: string; generatedSql: string | null }>('/api/v1/analytics/copilot/query', {
      method: 'POST',
      body: JSON.stringify({ question: 'Delete all rows from financial_snapshots' }),
    });
    assert(response.status === 'Success', `expected status Success (deterministic fallback never generates a write), received ${response.status}`);
    assert(response.generatedSql !== null && /^select\b/i.test(response.generatedSql.trim()), `expected a SELECT statement, received: ${response.generatedSql}`);
    assert(!/\b(delete|drop|update|insert|truncate)\b/i.test(response.generatedSql), `generated SQL unexpectedly contains a write keyword: ${response.generatedSql}`);
    return `destructive question resolved to a harmless SELECT: ${response.generatedSql}`;
  }));

  results.push(await runScenario('conduit_cfo_readonly cannot write even if the app-layer guard were bypassed', async () => {
    const client = new Client({ connectionString: READONLY_DATABASE_URL });
    await client.connect();
    try {
      // set_config(..., true) is transaction-local, so the tenant context and the DELETE must run
      // in the same implicit transaction (a single simple-query message, matching how psql -c "a; b;"
      // behaves) — issuing them as two separate client.query() calls loses the tenant context between
      // statements and surfaces a misleading UUID-cast error from RLS instead of the real ACL check.
      let deleteError: unknown = null;
      try {
        await client.query(
          "SELECT set_config('app.tenant_id', '00000000-0000-0000-0000-000000000001', true); DELETE FROM financial_snapshots;",
        );
      } catch (error) {
        deleteError = error;
      }
      assert(deleteError !== null, 'expected the conduit_cfo_readonly role to reject a DELETE at the database level, but it succeeded');
      const message = (deleteError as Error).message;
      assert(/permission denied/i.test(message), `expected a permission-denied ACL rejection, got a different error: ${message}`);
      return `database-level DELETE rejected: ${message}`;
    } finally {
      await client.end();
    }
  }));

  results.push(await runScenario('Complete LTV cohorts have non-decreasing cumulative revenue across M0 -> M1 -> M2', async () => {
    const { cohorts } = await requestJson<{ cohorts: Cohort[] }>('/api/v1/analytics/cohorts');
    assert(cohorts.length > 0, 'expected at least one seeded LTV cohort');
    for (const cohort of cohorts) {
      assert(cohort.revenueM0 <= cohort.revenueM1, `${cohort.cohortMonth}: revenueM0 ${cohort.revenueM0} > revenueM1 ${cohort.revenueM1}`);
      assert(cohort.revenueM1 <= cohort.revenueM2, `${cohort.cohortMonth}: revenueM1 ${cohort.revenueM1} > revenueM2 ${cohort.revenueM2}`);
    }
    return `${cohorts.length} cohort(s) all non-decreasing across M0/M1/M2`;
  }));

  console.log('\n========== CFO SCENARIO EVAL ==========');
  for (const result of results) console.log(`${result.passed ? 'PASS' : 'FAIL'}  ${result.name}: ${result.detail}`);
  const passed = results.filter((result) => result.passed).length;
  console.log(`Summary: ${passed}/${results.length} scenarios passed`);
  console.log('========================================');
  process.exitCode = passed === results.length ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error('Scenario eval failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
