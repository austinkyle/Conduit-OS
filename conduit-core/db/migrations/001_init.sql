CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('Owner', 'Admin', 'Manager', 'Viewer');
CREATE TYPE event_status AS ENUM ('Pending', 'Processed', 'Failed');

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    shopify_domain TEXT NOT NULL UNIQUE,
    encrypted_api_keys JSONB NOT NULL DEFAULT '{}'::jsonb,
    webhook_secret TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    email TEXT NOT NULL UNIQUE,
    role user_role NOT NULL,
    api_token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE webhook_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    shopify_event_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    payload JSONB NOT NULL,
    status event_status NOT NULL DEFAULT 'Pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    received_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX webhook_ledger_tenant_event_idx ON webhook_ledger (tenant_id, shopify_event_id);
CREATE INDEX webhook_ledger_tenant_status_idx ON webhook_ledger (tenant_id, status);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    external_order_id TEXT NOT NULL,
    customer_id TEXT,
    total_price NUMERIC(12,2),
    currency TEXT,
    payment_status TEXT,
    shipping_status TEXT,
    fraud_score INTEGER,
    fraud_flagged BOOLEAN NOT NULL DEFAULT false,
    fraud_reasons JSONB,
    raw_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (tenant_id, external_order_id)
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE webhook_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenants
    USING (id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON users
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON webhook_ledger
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON orders
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- The application connects as this non-superuser role so row-level security applies.
CREATE ROLE conduit_app LOGIN PASSWORD 'conduit_app';
GRANT USAGE ON SCHEMA public TO conduit_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO conduit_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO conduit_app;
