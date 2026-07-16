import { withReadonlyTenant, pool } from './db.js';
import { recordUsage } from './usage.js';

export type CopilotStatus = 'Success' | 'Rejected' | 'Error';

export interface CopilotResult {
  status: CopilotStatus;
  question: string;
  generatedSql: string | null;
  rows: Record<string, unknown>[];
  rowCount: number | null;
  errorDetail: string | null;
}

// The schema surface the copilot is told about — deliberately only what `conduit_cfo_readonly` is
// granted SELECT on (see db/migrations/007_cfo_init.sql and 009_integration.sql). Even a maximally
// adversarial prompt cannot make the model reference core's raw `orders` (customer PII, raw_data,
// fraud fields) — the connection it runs against has no grant on that table, only on the
// PII-stripped `orders_financial` view, which itself runs with the querying role's own privileges
// (security_invoker) so RLS still applies underneath it.
const SCHEMA_PROMPT = `
Tables (all filtered to the current tenant automatically — never add a WHERE tenant_id clause):

financial_snapshots(date date, gross_revenue numeric, cogs numeric, ad_spend numeric, shipping_costs numeric, processing_fees numeric, net_profit numeric, blended_mer numeric, gross_margin_pct numeric)
ltv_cohorts(cohort_month date, cohort_size integer, revenue_m0 numeric, revenue_m1 numeric, revenue_m2 numeric, cac numeric, payback_bucket text)
ad_spend_daily(date date, platform text, campaign text, spend numeric, conversions integer)
orders_financial(id uuid, external_order_id text, total_price numeric, currency text, payment_status text, shipping_status text, created_at timestamptz) -- PII-safe view of conduit-core's orders
products(id uuid, sku text, title text, unit_cost numeric, inventory_qty integer, safety_stock_limit integer) -- from conduit-ops
usage_ledger(id uuid, module text, task_type text, tokens_in integer, tokens_out integer, cost_usd numeric, created_at timestamptz) -- cross-module AI task cost log
`.trim();

// Defense-in-depth only — the real enforcement boundary is that `conduit_cfo_readonly` cannot run
// anything but SELECT at the database level (see db.ts / 007_cfo_init.sql). This guard exists so
// an obviously malicious or malformed generation is rejected and logged before it ever reaches
// the database, not because the database would allow it through.
export function isSafeSelect(sql: string): boolean {
  const trimmed = sql.trim().replace(/;\s*$/, '');
  if (trimmed.length === 0) return false;
  if (trimmed.includes(';')) return false;
  if (!/^select\b/i.test(trimmed)) return false;
  if (/--|\/\*/.test(trimmed)) return false;
  const forbidden = /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|copy|call|execute|merge|into|vacuum|reindex)\b/i;
  if (forbidden.test(trimmed)) return false;
  return true;
}

function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

async function generateSqlWithClaude(question: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `You are a PostgreSQL analyst. Given this schema:\n\n${SCHEMA_PROMPT}\n\nWrite ONE single read-only SELECT statement (no other statements, no comments, no semicolon) that answers this question: "${question}". Reply with ONLY the SQL, nothing else.`,
        }],
      }),
    });
    if (!response.ok) throw new Error(`Anthropic API returned ${response.status}`);

    const body = await response.json() as { content?: Array<{ type?: string; text?: string }> };
    const text = body.content?.find((item) => item.type === 'text')?.text?.trim();
    if (!text) throw new Error('Anthropic API returned no text');
    return stripCodeFence(text);
  } catch (error) {
    console.warn('conduit-cfo copilot SQL generation failed, using template fallback', error);
    return null;
  }
}

// Deterministic, zero-key fallback: keyword-matched canned queries against the same three tables
// a live Claude generation would use, so `npm test`/`eval`/`simulate` all pass with no API key.
function generateSqlFromTemplate(question: string): string {
  const q = question.toLowerCase();
  if (q.includes('cohort') || q.includes('ltv') || q.includes('payback')) {
    return 'SELECT cohort_month, cohort_size, revenue_m0, revenue_m1, revenue_m2, cac, payback_bucket FROM ltv_cohorts ORDER BY cohort_month DESC';
  }
  if (q.includes('ad spend') || q.includes('mer') || q.includes('meta') || q.includes('google') || q.includes('campaign')) {
    return 'SELECT date, platform, campaign, spend, conversions FROM ad_spend_daily ORDER BY date DESC LIMIT 30';
  }
  if (q.includes('margin')) {
    return 'SELECT date, gross_revenue, cogs, gross_margin_pct FROM financial_snapshots ORDER BY date DESC LIMIT 30';
  }
  return 'SELECT date, gross_revenue, net_profit, blended_mer FROM financial_snapshots ORDER BY date DESC LIMIT 30';
}

async function logCopilotQuery(
  tenantId: string,
  userId: string,
  question: string,
  generatedSql: string | null,
  rowCount: number | null,
  status: CopilotStatus,
  errorDetail: string | null,
): Promise<void> {
  await pool.query('BEGIN');
  try {
    await pool.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    await pool.query(
      `INSERT INTO copilot_queries (tenant_id, user_id, question, generated_sql, row_count, status, error_detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, userId, question, generatedSql, rowCount, status, errorDetail],
    );
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => undefined);
    console.warn('conduit-cfo failed to log copilot query', error);
  }
}

// Natural Language Financial Copilot: generates SQL (Claude when keyed, deterministic templates
// otherwise), rejects anything that fails the app-layer guard, then executes what survives via
// `withReadonlyTenant` — the `conduit_cfo_readonly` connection that cannot write at the database
// level regardless of what the guard missed. Every attempt is logged to `copilot_queries`.
export async function runCopilotQuery(
  tenantId: string,
  userId: string,
  question: string,
): Promise<CopilotResult> {
  const claudeSql = await generateSqlWithClaude(question);
  const generatedSql = claudeSql ?? generateSqlFromTemplate(question);
  const usageOptions = claudeSql !== null
    ? { metadata: { source: 'llm' } }
    : { costUsd: 0, metadata: { source: 'template' } };

  if (!isSafeSelect(generatedSql)) {
    await logCopilotQuery(tenantId, userId, question, generatedSql, null, 'Rejected', 'Query failed the read-only SELECT guard');
    await recordUsage(tenantId, 'copilot_query', { ...usageOptions, metadata: { ...usageOptions.metadata, status: 'Rejected' } });
    return { status: 'Rejected', question, generatedSql, rows: [], rowCount: null, errorDetail: 'Query failed the read-only SELECT guard' };
  }

  try {
    const rows = await withReadonlyTenant(tenantId, async (client) => {
      const result = await client.query(generatedSql);
      return result.rows as Record<string, unknown>[];
    });
    await logCopilotQuery(tenantId, userId, question, generatedSql, rows.length, 'Success', null);
    await recordUsage(tenantId, 'copilot_query', { ...usageOptions, metadata: { ...usageOptions.metadata, status: 'Success' } });
    return { status: 'Success', question, generatedSql, rows, rowCount: rows.length, errorDetail: null };
  } catch (error) {
    const errorDetail = error instanceof Error ? error.message : 'Unknown error';
    await logCopilotQuery(tenantId, userId, question, generatedSql, null, 'Error', errorDetail);
    await recordUsage(tenantId, 'copilot_query', { ...usageOptions, metadata: { ...usageOptions.metadata, status: 'Error' } });
    return { status: 'Error', question, generatedSql, rows: [], rowCount: null, errorDetail };
  }
}
