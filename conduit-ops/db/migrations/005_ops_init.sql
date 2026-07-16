CREATE TYPE po_status AS ENUM ('Draft', 'Sent', 'Received', 'Closed');
CREATE TYPE invoice_status AS ENUM ('Pending', 'Parsed', 'Failed');
CREATE TYPE po_event_type AS ENUM ('Drafted', 'Sent', 'Shipping_Update', 'Received', 'Closed', 'Invoice_Parsed');

CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  lead_time_days INTEGER NOT NULL,
  moq INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  supplier_id UUID REFERENCES suppliers(id),
  title TEXT NOT NULL,
  sku TEXT NOT NULL,
  inventory_qty INTEGER NOT NULL DEFAULT 0,
  safety_stock_limit INTEGER NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sku)
);

CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  status po_status NOT NULL DEFAULT 'Draft',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tracking_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE po_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  purchase_order_id UUID REFERENCES purchase_orders(id),
  event_type po_event_type NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE demand_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  product_id UUID NOT NULL REFERENCES products(id),
  forecast_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  predicted_depletion_date TIMESTAMPTZ,
  suggested_reorder_qty INTEGER NOT NULL DEFAULT 0,
  confidence_score NUMERIC(5,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Synthetic stand-in for conduit-cfo's future ad-spend feed. conduit-cfo (Project 4) is not
-- built yet, so there is no real source for "upcoming marketing ad-spend projections" per the
-- spec. This table is seeded with deterministic fixture data only and documented as such;
-- forecast.ts treats it as one weighted input, never as ground truth.
CREATE TABLE ad_spend_projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  product_id UUID REFERENCES products(id),
  week_start DATE NOT NULL,
  projected_spend_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  supplier_id UUID REFERENCES suppliers(id),
  file_path TEXT NOT NULL,
  status invoice_status NOT NULL DEFAULT 'Pending',
  parsed_line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- source_order_id references conduit-core's orders.external_order_id loosely (text, no FK) —
-- ops reads core's orders table read-only for return signals but never writes cross-module FKs.
CREATE TABLE returns_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  product_id UUID REFERENCES products(id),
  source_order_id TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  defective BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX purchase_orders_tenant_status_idx ON purchase_orders(tenant_id, status);
CREATE INDEX po_events_tenant_po_idx ON po_events(tenant_id, purchase_order_id);
CREATE INDEX demand_forecasts_tenant_product_idx ON demand_forecasts(tenant_id, product_id);
CREATE INDEX ad_spend_projections_tenant_product_idx ON ad_spend_projections(tenant_id, product_id);
CREATE INDEX invoices_tenant_status_idx ON invoices(tenant_id, status);
CREATE INDEX returns_log_tenant_product_idx ON returns_log(tenant_id, product_id);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON suppliers
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON products
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON purchase_orders
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE po_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON po_events
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE demand_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_forecasts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON demand_forecasts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE ad_spend_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_spend_projections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ad_spend_projections
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoices
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE returns_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON returns_log
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE ON suppliers, products, purchase_orders, po_events,
  demand_forecasts, ad_spend_projections, invoices, returns_log TO conduit_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO conduit_app;
