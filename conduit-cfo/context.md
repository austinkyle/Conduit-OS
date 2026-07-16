# conduit-cfo — context

Executive Financial Cockpit. Merges core's order revenue, ops's live unit costs, this module's own ad-spend ledger, and processing fees into a daily reconciled net-profit snapshot; computes LTV cohorts from real order history; answers plain-English financial questions through a database-enforced read-only copilot.

## Current state

- Shipped: rollup engine, LTV cohorts, NL copilot with DB-level readonly enforcement (`conduit_cfo_readonly` role), BullMQ worker (immediate + 24h repeatable rollup, immediate + 30d repeatable cohort recompute), Executive Financial Cockpit console (stats cards, net profit chart, cohort heatmap, copilot chat), tests, eval, simulator — verified 2026-07-15.
- Verified metrics: 22/22 unit tests, 5/5 live-stack eval scenarios (including the DB-level DELETE-rejection proof), simulator 50/50 successful dashboard reads, p50/p95/p99 = 19.0/103.8/107.4ms.
- **Cross-module integration:** `worker.ts` now also debounces core's `orders/*` events into an extra rollup (one job per tenant per 5-minute bucket) and runs an hourly `billingSyncWorker` that reports every module's `usage_ledger` rows to Stripe's metered-billing API (`[simulated]`-logged without `STRIPE_API_KEY`). The copilot's `SCHEMA_PROMPT` now spans core's PII-safe `orders_financial` view, ops's `products`, and the shared `usage_ledger`, gated purely by `conduit_cfo_readonly`'s grants. New **AI task usage & billing** panel on the dashboard reads `GET /api/v1/usage/summary`.

## Stack

- API: Fastify + TypeScript, port `4003`.
- Worker: BullMQ (`rollupWorker`, `cohortWorker`) against shared Redis.
- DB: shared PostgreSQL 15, cfo schema from `007_cfo_init.sql` + `008_cfo_seed.sql`, RLS on all 4 tables, plus the dedicated `conduit_cfo_readonly` role.
- Web: Next.js 14 + Tailwind, port `3003`, proxies `/api/*` to the cfo API via a build-time-baked `rewrites()` destination.
- External (all optional, deterministic fallback otherwise): `ANTHROPIC_API_KEY` (Claude copilot SQL generation), `STRIPE_API_KEY` (real processing fees + real metered-billing usage reporting; `STRIPE_USAGE_METER_EVENT_NAME` overrides the meter event name), `META_ADS_ACCESS_TOKEN`/`META_AD_ACCOUNT_ID` (live Meta ad-spend sync).

## File map

**API (`conduit-cfo/api/src/`)**
- `server.ts` — Fastify app; registers `/healthz`, analytics routes, copilot route, stats route; listens on `PORT` (default 4003).
- `auth.ts` — Bearer token authentication; resolves `tenant_id`/`role`/`email` from shared `users` table; `requireRole()` guard.
- `db.ts` — `pool` (app role) and `readonlyPool` (`conduit_cfo_readonly` role); `withTenant`/`withReadonlyTenant` transaction-scoped tenant-context helpers.
- `revenue.ts` — read-only reads against core's `orders`: daily gross revenue, customer first-order months, cohort revenue through a given month.
- `cogs.ts` — read-only join of core's `orders` line items against ops's `products.unit_cost` by SKU.
- `fees.ts` — `fetchStripeFees()` (optional live) / `getDailyProcessingFees()` (2.9% + $0.30/order fallback).
- `adspend.ts` — `fetchMetaSpend()` (optional live) / `syncAdSpendForDate()` / `getDailyAdSpend()`; Google Ads is seed/backfill-only (OAuth2 out of scope).
- `rollup.ts` — `computeFinancialMetrics()` pure function; `runFinancialRollup()` orchestrates reads → compute → upsert `financial_snapshots`.
- `cohorts.ts` — `derivePaybackBucket()`; `computeLtvCohorts()` computes/stores only cohorts whose M2 window has fully closed.
- `copilot.ts` — `SCHEMA_PROMPT` (now spans `orders_financial`, ops's `products`, and `usage_ledger`), `isSafeSelect()` app-layer guard, `generateSqlWithClaude()` / `generateSqlFromTemplate()`, `logCopilotQuery()`, `runCopilotQuery()` (records every query to `usage_ledger`).
- `usage.ts` — shared `usage_ledger` write helper (`recordUsage`, `resolveCost`); never throws.
- `billing.ts` — `reportMeterEvent()` (Stripe metered-billing POST, `[simulated]` fallback) and `syncUsageToStripe()` (`FOR UPDATE SKIP LOCKED` claim of unreported rows per tenant).
- `events.ts` — `startCoreEventListener()`; `LISTEN conduit_events` via a dedicated `pg.Client`, 2s reconnect-on-error; also drives a debounced event-triggered rollup.
- `worker.ts` — `rollupWorker`, `cohortWorker`, and `billingSyncWorker` (hourly repeatable + on-demand, `__all__` tenant fan-out); immediate + repeatable job registration on boot; graceful shutdown on SIGTERM/SIGINT.
- `routes/analytics.ts` — `GET /snapshots`, `GET /cohorts`, `POST /sync` (Owner/Admin).
- `routes/stats.ts` — `GET /stats`.
- `routes/copilot.ts` — `POST /copilot/query` (authenticated).
- `routes/usage.ts` — `GET /api/v1/usage/summary` — per-module/task-type cost & token breakdown plus totals and unreported-to-Stripe count.

**Web (`conduit-cfo/web/`)**
- `app/page.tsx` — dashboard: parallel-fetches snapshots(60d)/cohorts/stats, 5s auto-refresh, renders the four components below.
- `components/StatsCards.tsx` — top-line net profit / gross margin / blended MER / blended CAC cards.
- `components/NetProfitChart.tsx` — net profit trend chart over `financial_snapshots`.
- `components/CohortHeatmap.tsx` — LTV cohort payback heatmap.
- `components/CopilotChat.tsx` — NL question input, posts to `/api/v1/analytics/copilot/query`, renders status-badged history with a results table.
- `components/UsagePanel.tsx` — AI task usage & billing panel: total cost/tasks/pending-Stripe-sync counts plus a per-module/task-type breakdown table.
- `components/TokenPicker.tsx` — demo-token switcher.
- `lib/api.ts` — `apiFetch()` wrapper, `TOKEN_CHANGED_EVENT`.
- `types.ts` — shared response types (`FinancialSnapshot`, `LtvCohort`, `StatsResponse`, `CopilotResult`, etc).

**DB (`conduit-cfo/db/migrations/`)**
- `007_cfo_init.sql` — enums, `ad_spend_daily`, `financial_snapshots`, `ltv_cohorts`, `copilot_queries`, RLS, `conduit_app` grants, `conduit_cfo_readonly` role (3s statement timeout, SELECT-only on 3 tables).
- `008_cfo_seed.sql` — 46 days of synthetic snapshots (sine-wave revenue, relative to `CURRENT_DATE`), matching Meta/Google ad-spend split, 3 complete LTV cohorts. Today's snapshot deliberately unseeded — computed live by the worker's boot-time rollup.
- root `db/migrations/009_integration.sql` (idempotent, applies to all four modules) — shared `usage_ledger` table, `orders_financial` PII-safe view (`security_invoker`), and the cross-module grants `conduit_cfo_readonly` needs on it and on ops's `products`.

**Scripts (`conduit-cfo/api/scripts/`)**
- `eval-scenarios.ts` — 5 scenarios against the live Docker stack: snapshot reconciliation, manual sync, copilot destructive-question resolves to a harmless SELECT, direct `conduit_cfo_readonly` DELETE rejection (the authoritative DB-boundary proof), cohort revenue non-decreasing.
- `simulate-dashboard.ts` — concurrent dashboard-read load simulation, reports p50/p95/p99.

## Event contract — CONSUMED

conduit-cfo consumes core's event stream both for logging/awareness and to enqueue a debounced event-triggered rollup on `orders/*` topics (one job per tenant per 5-minute bucket via a deterministic BullMQ `jobId`) — it never writes to core or ops tables.

```json
{ "ledgerId": "uuid", "tenantId": "uuid", "topic": "string", "orderId": "uuid (optional)" }
```

Published via `pg_notify('conduit_events', ...)` in conduit-core; consumed via `LISTEN conduit_events` on a dedicated `pg.Client` in `events.ts`, reconnecting 2s after any error.

## Demo tokens

| Token | Role |
|---|---|
| `tok_owner_demo` | Owner |
| `tok_admin_demo` | Admin |
| `tok_manager_demo` | Manager |
| `tok_viewer_demo` | Viewer |

All belong to tenant `00000000-0000-0000-0000-000000000001`, shared with core/reply/ops seed data.

## Host ports and commands

| Service | Port |
|---|---:|
| `cfo-api` | 4003 |
| `cfo-web` | 3003 |
| Postgres (shared, host-mapped) | 5433 |

```bash
docker compose up -d cfo-api cfo-worker cfo-web

cd conduit-cfo/api
npm test        # 22 unit tests
npm run eval     # 5 live-stack scenarios (needs the stack running)
npm run simulate # concurrent dashboard-read load simulation
```
