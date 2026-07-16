-- Cross-module integration: shared AI-task usage ledger (written by every module, billed by cfo)
-- and the PII-safe cross-module views that back the copilot's cross-module schema (see
-- copilot.ts). Written to be re-run safely against an existing volume via
-- scripts/apply-migration.sh, not just at first `docker-entrypoint-initdb.d` init — every
-- statement below is idempotent.

CREATE TABLE IF NOT EXISTS usage_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  module      text NOT NULL CHECK (module IN ('core', 'reply', 'ops', 'cfo')),
  task_type   text NOT NULL,
  tokens_in   integer,
  tokens_out  integer,
  cost_usd    numeric(10,6) NOT NULL DEFAULT 0,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  stripe_reported_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_ledger_tenant_created_idx ON usage_ledger (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_ledger_unreported_idx ON usage_ledger (tenant_id) WHERE stripe_reported_at IS NULL;

ALTER TABLE usage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_ledger FORCE ROW LEVEL SECURITY;

-- CREATE POLICY has no IF NOT EXISTS form in Postgres; guard it the same way a rerunnable
-- migration guards CREATE TYPE, by swallowing the duplicate-object error.
DO $$ BEGIN
  CREATE POLICY tenant_isolation ON usage_ledger
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE ON usage_ledger TO conduit_app;
GRANT SELECT ON usage_ledger TO conduit_cfo_readonly;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO conduit_app;

-- PII-safe surface onto core's `orders` for the copilot and any other read-only cross-module
-- consumer: excludes raw_data (full Shopify payload) and customer_id (the one PII-bearing
-- column on this table). security_invoker means the view runs with the querying role's own
-- privileges, so `orders`'s own tenant_isolation RLS policy still applies underneath it —
-- without this, a view owned by a superuser-ish role could leak cross-tenant rows regardless of
-- who queries it.
CREATE OR REPLACE VIEW orders_financial WITH (security_invoker = true) AS
  SELECT id, tenant_id, external_order_id, total_price, currency, payment_status, shipping_status, created_at
    FROM orders;

-- security_invoker makes Postgres check the invoker's own privileges against the underlying
-- `orders` table too, not just the view — so the readonly role needs a direct grant on exactly
-- the columns the view exposes. Column-level (not table-level) SELECT means even a direct
-- `SELECT * FROM orders` as this role still can't reach `raw_data` or `customer_id`.
GRANT SELECT (id, tenant_id, external_order_id, total_price, currency, payment_status, shipping_status, created_at)
  ON orders TO conduit_cfo_readonly;
GRANT SELECT ON orders_financial TO conduit_cfo_readonly;
GRANT SELECT ON products TO conduit_cfo_readonly;
