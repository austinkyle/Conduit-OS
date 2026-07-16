CREATE TYPE ad_platform AS ENUM ('Meta', 'Google');
CREATE TYPE payback_bucket AS ENUM ('30', '60', '90', '90+');
CREATE TYPE copilot_query_status AS ENUM ('Success', 'Rejected', 'Error');

CREATE TABLE ad_spend_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  date DATE NOT NULL,
  platform ad_platform NOT NULL,
  campaign TEXT NOT NULL,
  spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per tenant per day. processing_fees is an addition beyond the original spec's table —
-- the spec's own testing strategy (section 17) requires net profit to account for "transaction
-- processing fees," which needs a durable column, not just a transient calculation.
CREATE TABLE financial_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  date DATE NOT NULL,
  gross_revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  cogs NUMERIC(14,2) NOT NULL DEFAULT 0,
  ad_spend NUMERIC(14,2) NOT NULL DEFAULT 0,
  shipping_costs NUMERIC(14,2) NOT NULL DEFAULT 0,
  processing_fees NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_profit NUMERIC(14,2) NOT NULL DEFAULT 0,
  blended_mer NUMERIC(8,4),
  gross_margin_pct NUMERIC(6,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, date)
);

CREATE TABLE ltv_cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  cohort_month DATE NOT NULL,
  cohort_size INTEGER NOT NULL DEFAULT 0,
  revenue_m0 NUMERIC(14,2) NOT NULL DEFAULT 0,
  revenue_m1 NUMERIC(14,2) NOT NULL DEFAULT 0,
  revenue_m2 NUMERIC(14,2) NOT NULL DEFAULT 0,
  cac NUMERIC(12,2) NOT NULL DEFAULT 0,
  payback_bucket payback_bucket,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, cohort_month)
);

-- Every natural-language question the copilot receives, the SQL it generated (or attempted),
-- and the outcome — satisfies spec section 18's "log all natural language search history".
CREATE TABLE copilot_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID REFERENCES users(id),
  question TEXT NOT NULL,
  generated_sql TEXT,
  row_count INTEGER,
  status copilot_query_status NOT NULL,
  error_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ad_spend_daily_tenant_date_idx ON ad_spend_daily(tenant_id, date);
CREATE INDEX financial_snapshots_tenant_date_idx ON financial_snapshots(tenant_id, date);
CREATE INDEX ltv_cohorts_tenant_month_idx ON ltv_cohorts(tenant_id, cohort_month);
CREATE INDEX copilot_queries_tenant_created_idx ON copilot_queries(tenant_id, created_at);

ALTER TABLE ad_spend_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_spend_daily FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ad_spend_daily
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE financial_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON financial_snapshots
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE ltv_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ltv_cohorts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ltv_cohorts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE copilot_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_queries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON copilot_queries
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE ON ad_spend_daily, financial_snapshots, ltv_cohorts, copilot_queries
  TO conduit_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO conduit_app;

-- Dedicated role for the text-to-SQL copilot. It is the real enforcement boundary for the spec's
-- "separate, highly locked down, read-only database replica" requirement (section 11): rather
-- than a physical streaming replica (heavy infra for a local demo stack, same risk profile as the
-- app's own role once superuser-bypassed) or an app-layer string filter alone (a weak boundary — a
-- filter bug lets a write through), this role can never run INSERT/UPDATE/DELETE at the database
-- level, and it is granted SELECT only on cfo's own pre-aggregated tables — never on core's raw
-- `orders` or ops's raw `products` — so the copilot cannot reach customer PII or execute the kind
-- of heavy live-transaction-table query the spec's scaling section (16) warns against, even if the
-- LLM were adversarially prompted. RLS still applies to this role (it is not a superuser), so the
-- application must set `app.tenant_id` per-transaction exactly like the `conduit_app` pool does.
CREATE ROLE conduit_cfo_readonly LOGIN PASSWORD 'conduit_cfo_readonly';
ALTER ROLE conduit_cfo_readonly SET statement_timeout = '3s';
GRANT USAGE ON SCHEMA public TO conduit_cfo_readonly;
GRANT SELECT ON financial_snapshots, ltv_cohorts, ad_spend_daily TO conduit_cfo_readonly;
