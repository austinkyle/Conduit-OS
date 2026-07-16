# conduit-reply context

conduit-reply reduces support payroll growth by turning conduit-core's trusted order stream into shipped, tenant-isolated classification, grounded drafts, authorized actions, and churn-prevention outreach.

## Current state

- **Shipped and verified 2026-07-15:** Fastify CRM API, BullMQ classification and churn workers, PostgreSQL/pgvector RLS schema, deterministic classification/templates, optional Claude/OpenAI/Twilio/Shopify adapters, and Next.js Agent Copilot Workspace.
- Verified with zero external API keys: 10/10 Vitest tests; 4/4 live-stack eval scenarios; 50/50 concurrent simulated tickets with 0 failures; ingest p50 41.3 ms / p95 119.3 ms / p99 136.7 ms against a 2000 ms p95 threshold; stats `{"totalTickets":66,"autoResolutionRate":1,"handoffRatio":0,"avgLatencyMs":9,"totalLlmCostUsd":0}`.
- **Cross-module integration:** `worker.ts` debounces core's `orders/*` events into a churn scan (one job per tenant per 5-minute bucket via a deterministic `jobId`), and `api/src/usage.ts` records every classification/draft-generation task to the shared `usage_ledger` that `conduit-cfo` bills against.

## Stack

TypeScript, Fastify 4, PostgreSQL 15 + pgvector, Redis 7, BullMQ 5, Next.js 14, React, Tailwind, Vitest, Docker Compose.

## File map

- `api/src/auth.ts` — bearer authentication and four-role RBAC.
- `api/src/db.ts` — PostgreSQL pool and transaction-local RLS tenant context.
- `api/src/events.ts` — read-only core listener with two-second reconnect.
- `api/src/notify.ts` — consumed core event type.
- `api/src/pii.ts` — Luhn-gated card, SSN, CVV, and password redaction.
- `api/src/llm.ts` — optional Claude classification and draft overlay.
- `api/src/embeddings.ts` — optional OpenAI embeddings and SHA256 fallback.
- `api/src/usage.ts` — shared `usage_ledger` write helper (`recordUsage`, `resolveCost`); never throws.
- `api/src/queue.ts` — BullMQ ticket and churn queues.
- `api/src/classifier.ts` — heuristic-first classification with optional LLM.
- `api/src/extractor.ts` — order ID and SKU extraction.
- `api/src/rag.ts` — KB retrieval, read-only order lookup, draft template.
- `api/src/churn.ts` — churn scan and SMS event recording.
- `api/src/sms.ts` — optional Twilio and simulated fallback.
- `api/src/actions/shopify.ts` — optional Shopify actions and simulation.
- `api/src/routes/tickets.ts` — intake, list/filter, detail, and messages.
- `api/src/routes/knowledge-base.ts` — KB sync and missing embeddings.
- `api/src/routes/drafts.ts` — grounded draft endpoint.
- `api/src/routes/actions.ts` — role-gated action endpoint.
- `api/src/routes/churn.ts` — Owner/Admin churn trigger.
- `api/src/routes/stats.ts` — CRM statistics endpoint.
- `api/src/server.ts` — Fastify composition and health route.
- `api/src/worker.ts` — workers, repeatable scan, core listener.
- `api/scripts/eval-scenarios.ts` — four deterministic scenario checks.
- `api/scripts/simulate-tickets.ts` — load simulator and percentiles.
- `api/test/pii.test.ts` — PII scrubbing tests.
- `api/test/embeddings.test.ts` — embedding fallback tests.
- `api/test/draft-template.test.ts` — draft template tests.
- `db/migrations/003_reply_init.sql` — pgvector, tables, grants, and RLS.
- `db/migrations/004_reply_seed.sql` — order, ticket, and policy fixtures.
- `web/lib/api.ts` — API client and token storage.
- `web/types.ts` — UI types.
- `web/components/TokenPicker.tsx` — demo role selection.
- `web/components/TicketList.tsx` — ticket queue and selection.
- `web/components/MessageThread.tsx` — conversation and agent messages.
- `web/components/DraftPanel.tsx` — drafts and autonomous actions.
- `web/components/StatsCards.tsx` — live CRM statistics.
- `web/app/page.tsx` — three-pane Agent Copilot Workspace.
- `web/app/layout.tsx` — Next.js root layout.
- `web/app/globals.css` — Tailwind and workspace styling.

## Event contract — CONSUMED

Channel: `pg_notify('conduit_events', JSON.stringify(event))`

```ts
{ ledgerId: string; tenantId: string; topic: string; orderId?: string }
```

**CONSUMED READ-ONLY:** `conduit-core` owns this sacred contract. `startCoreEventListener` uses a dedicated `pg.Client`, runs `LISTEN conduit_events`, reconnects two seconds after errors, and never throws or writes to core. Application reads from `orders` occur only in `lookupOrderContext` and the churn query, both tenant-scoped plain `SELECT`; `004_reply_seed.sql` is the one-time fixture exception.

## Demo tokens

| Token | Role | Autonomous action | KB sync / churn scan |
|---|---|---:|---:|
| `tok_owner_demo` | Owner | Yes | Yes |
| `tok_admin_demo` | Admin | Yes | Yes |
| `tok_manager_demo` | Manager | Yes | No |
| `tok_viewer_demo` | Viewer | No | No |

Tenant: `00000000-0000-0000-0000-000000000001`.

## Host ports and commands

Ports: reply web `3001`; reply API `4001`; core web `3000`; core API `4000`; shared PostgreSQL `5433` (container `5432`); shared Redis `6380` (container `6379`).

```bash
docker compose up -d --build
cd conduit-reply/api && npm test
cd conduit-reply/api && npm run eval
cd conduit-reply/api && npm run simulate
```
