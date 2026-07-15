CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE ticket_channel AS ENUM ('Email', 'SMS');
CREATE TYPE ticket_status AS ENUM ('Open', 'Pending_Human', 'Closed');
CREATE TYPE message_sender_type AS ENUM ('Customer', 'Human_Agent', 'AI_Agent');
CREATE TYPE ticket_event_type AS ENUM ('Classified', 'Draft_Generated', 'Action_Executed', 'Escalated', 'Resolved', 'Churn_Sms_Sent');

CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id TEXT,
  channel ticket_channel NOT NULL,
  status ticket_status NOT NULL DEFAULT 'Open',
  sentiment TEXT,
  category TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  sender_type message_sender_type NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, title)
);

CREATE TABLE ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  ticket_id UUID REFERENCES tickets(id),
  event_type ticket_event_type NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  llm_cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX messages_ticket_id_idx ON messages(ticket_id);
CREATE INDEX tickets_tenant_status_idx ON tickets(tenant_id, status);
CREATE INDEX ticket_events_tenant_type_idx ON ticket_events(tenant_id, event_type);

-- No ivfflat index on knowledge_base.embedding yet: table is empty at init time,
-- and ivfflat training on zero rows is unreliable. Add one after the KB is
-- populated in production; cosine similarity via `embedding <=> $1` is fine at demo scale.

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tickets
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON messages
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON knowledge_base
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ticket_events
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE ON tickets, messages, knowledge_base, ticket_events TO conduit_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO conduit_app;
