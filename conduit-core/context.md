# conduit-core context

conduit-core prevents lost and duplicate commerce actions by providing the shipped, verified ingestion ledger for every downstream Conduit-OS module.

## Current state

- **Shipped and verified 2026-07-15:** Fastify ingest, BullMQ worker, PostgreSQL/RLS ledger and orders, fraud agent, Next.js console, 11 tests, signed simulator.
- Verified: p50 ~27 ms / steady-state p95 ~36–41 ms; 5/5 duplicates recognized; 0 duplicate rows; 250 processed events across 10 runs → 25 orders; 1 fraud flag; 0 failures; Viewer replay `403`; Admin `200`; invalid HMAC `401`.

## Stack

TypeScript, Fastify 4, PostgreSQL 15, Redis 7, BullMQ 5, Next.js 14, React, Tailwind, Vitest, Docker Compose.

## File map

- `api/src/auth.ts` — bearer authentication and four-role RBAC.
- `api/src/crypto.ts` — AES-256-GCM integration-secret helper.
- `api/src/db.ts` — PostgreSQL pool and transaction-local tenant context.
- `api/src/hmac.ts` — constant-time Shopify HMAC verification.
- `api/src/notify.ts` — Postgres event publication and Slack alerts.
- `api/src/queue.ts` — BullMQ queue, attempts, and backoff.
- `api/src/server.ts` — Fastify composition, health route, listener, pool warm-up.
- `api/src/worker.ts` — idempotent processing, order upsert, fraud, event publication.
- `api/src/routes/ledger.ts` — ledger query/counts/pagination and replay.
- `api/src/routes/webhooks.ts` — raw body, tenant cache, HMAC, dedup, enqueue, ack.
- `api/src/fraud/scorer.ts` — deterministic weighted fraud rules.
- `api/src/fraud/llm.ts` — optional Claude escalation.
- `api/scripts/simulate-shopify.ts` — signed simulator and PASS/FAIL check.
- `api/test/hmac.test.ts` — HMAC tests.
- `api/test/scorer.test.ts` — fraud tests.
- `db/migrations/001_init.sql` — schema, indexes, RLS, `conduit_app` role.
- `db/migrations/002_seed.sql` — demo tenant and role tokens.
- `web/app/page.tsx` — polling ledger console page.
- `web/components/JsonViewer.tsx` — highlighted payload JSON.
- `web/components/LedgerTable.tsx` — filters, rows, expansion, replay.
- `web/components/StatsCards.tsx` — live counts.
- `web/components/StatusBadge.tsx` — status styling.
- `web/components/TokenPicker.tsx` — demo role/token selection.
- `web/lib/api.ts` — console API client.
- `web/types.ts` — console data types.

## Event contract — SACRED

Channel: `pg_notify('conduit_events', JSON.stringify(event))`

```ts
{ ledgerId: string; tenantId: string; topic: string; orderId?: string }
```

**SACRED: breaking changes require explicit review. All downstream modules consume it.** `conduit-core` is the source of truth; downstream modules do not write around it.

## Demo tokens

| Token | Role | Replay |
|---|---|---:|
| `tok_owner_demo` | Owner | Yes |
| `tok_admin_demo` | Admin | Yes |
| `tok_manager_demo` | Manager | No |
| `tok_viewer_demo` | Viewer | No |

Demo shop: `aurora-apparel.myshopify.com`; secret: `demo_webhook_secret_change_me`.

## Host ports and commands

Ports: web `3000`; API `4000`; PostgreSQL `5433` (container `5432`); Redis `6380` (container `6379`).

```bash
docker compose up -d --build
cd conduit-core/api && npm run simulate
cd conduit-core/api && npm test
```
