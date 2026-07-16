# conduit-ops context

conduit-ops turns conduit-core's trusted order stream into a predictive supply chain layer: SKU-level stockout forecasting, autonomous purchase-order drafting, a supplier email agent, a returns-signal router, and an invoice OCR parser.

## Current state

- **Shipped and verified 2026-07-15:** Fastify ERP API, BullMQ forecast worker with a boot-time immediate scan plus a 24h repeatable scan, PostgreSQL RLS schema, deterministic weighted-signal forecasting, optional Claude vision / SendGrid adapters, and a Next.js Supply Chain Command Center console with a Recharts depletion curve.
- Verified with zero external API keys, including a full `docker compose down -v && docker compose up -d --build` fresh-volume rebuild confirming migrations auto-run correctly: 10/10 Vitest tests; 4/4 live-stack eval scenarios; 50/50 concurrent simulated dashboard reads with 0 failures; dashboard read p50 18.8 ms / p95 106.9 ms / p99 122.2 ms against a 2000 ms p95 threshold; post-run ERP stats `{"openPurchaseOrders":1,"activeAlerts":1,"avgConfidence":0.233,"totalForecastedReorderValue":3250}`.
- **Cross-module integration:** `worker.ts` debounces core's `orders/*` events into an extra forecast scan (one job per tenant per 5-minute bucket via a deterministic `jobId`), and `api/src/usage.ts` records every invoice-OCR/supplier-email AI task to the shared `usage_ledger` that `conduit-cfo` bills against. `products.safety_stock_limit` is also read cross-tenant-safely by cfo's copilot via a DB grant, not an app-layer allowlist.

## Stack

TypeScript, Fastify 4, PostgreSQL 15, Redis 7, BullMQ 5, Next.js 14, React, Tailwind, Recharts, Vitest, Docker Compose.

## File map

- `api/src/auth.ts` — bearer authentication and four-role RBAC.
- `api/src/db.ts` — PostgreSQL pool and transaction-local RLS tenant context.
- `api/src/events.ts` — read-only core listener with two-second reconnect.
- `api/src/notify.ts` — consumed core event type.
- `api/src/velocity.ts` — read-only sales velocity derived from core's `orders.raw_data` line items.
- `api/src/forecast.ts` — deterministic weighted-signal depletion/reorder/confidence forecast, `runForecastScan`.
- `api/src/po.ts` — auto-drafts one Draft purchase order per supplier from a forecast scan.
- `api/src/supplier-agent.ts` — sends the PO to the supplier by email and logs `po_events`.
- `api/src/returns.ts` — read-only proxy scan of core's `orders` for refund/cancel signals, updates `inventory_qty`.
- `api/src/vision.ts` — optional Claude vision invoice OCR with a deterministic regex-template fallback.
- `api/src/email.ts` — optional SendGrid send and simulated fallback.
- `api/src/usage.ts` — shared `usage_ledger` write helper (`recordUsage`, `resolveCost`); never throws.
- `api/src/queue.ts` — BullMQ `forecastQueue` (PO dispatch and invoice parsing run synchronously in their route handlers).
- `api/src/routes/inventory.ts` — inventory alerts, products, suppliers.
- `api/src/routes/purchase-orders.ts` — create/list/detail/status-transition, Owner/Admin gated writes.
- `api/src/routes/returns.ts` — Owner/Admin returns-scan trigger.
- `api/src/routes/invoices.ts` — multipart invoice upload, mime/size/magic-byte validation, OCR parse.
- `api/src/routes/stats.ts` — ERP dashboard statistics endpoint.
- `api/src/server.ts` — Fastify composition and health route.
- `api/src/worker.ts` — forecast worker, immediate + repeatable scan, core listener.
- `api/scripts/eval-scenarios.ts` — four deterministic scenario checks.
- `api/scripts/simulate-forecast.ts` — load simulator and percentiles.
- `api/test/forecast.test.ts` — forecast math unit tests (velocity, safety margin, lead time, MOQ, ad-spend cap, confidence).
- `db/migrations/005_ops_init.sql` — `suppliers`, `products`, `purchase_orders`, `po_events`, `demand_forecasts`, `ad_spend_projections`, `invoices`, `returns_log`, RLS, grants.
- `db/migrations/006_ops_seed.sql` — 2 suppliers, 6 products (one deliberately below its safety stock limit), synthetic ad-spend projections.
- `web/lib/api.ts` — API client and `conduit_ops_token` storage.
- `web/types.ts` — UI types.
- `web/components/TokenPicker.tsx` — demo role selection.
- `web/components/AlertsList.tsx` — selectable stockout alert list.
- `web/components/SkuDepletionChart.tsx` — Recharts projected-vs-safety-stock line chart.
- `web/components/PurchaseOrderPanel.tsx` — PO list with status-transition actions.
- `web/components/SupplierList.tsx` — supplier directory.
- `web/components/StatsCards.tsx` — live ERP statistics.
- `web/app/page.tsx` — Supply Chain Command Center dashboard.
- `web/app/layout.tsx` — Next.js root layout.
- `web/app/globals.css` — Tailwind and dashboard styling.

## Event contract — CONSUMED

Channel: `pg_notify('conduit_events', JSON.stringify(event))`

```ts
{ ledgerId: string; tenantId: string; topic: string; orderId?: string }
```

**CONSUMED READ-ONLY:** `conduit-core` owns this sacred contract. `startCoreEventListener` uses a dedicated `pg.Client`, runs `LISTEN conduit_events`, reconnects two seconds after errors, and never throws or writes to core. Application reads from `orders` occur only in two tenant-scoped plain `SELECT` paths — `velocity.ts` (sales velocity, unnesting `raw_data->'line_items'`) and `returns.ts` (refund/cancel proxy signal) — both documented as read-only, best-effort scans that never write to core tables.

## Demo tokens

| Token | Role | Manage purchase orders / returns scan / invoice parse | Read dashboard |
|---|---|---:|---:|
| `tok_owner_demo` | Owner | Yes | Yes |
| `tok_admin_demo` | Admin | Yes | Yes |
| `tok_manager_demo` | Manager | No | Yes |
| `tok_viewer_demo` | Viewer | No | Yes |

Tenant: `00000000-0000-0000-0000-000000000001`.

## Host ports and commands

Ports: ops web `3002`; ops API `4002`; reply web `3001`; reply API `4001`; core web `3000`; core API `4000`; shared PostgreSQL `5433` (container `5432`); shared Redis `6380` (container `6379`).

```bash
docker compose up -d --build
cd conduit-ops/api && npm test
cd conduit-ops/api && npm run eval
cd conduit-ops/api && npm run simulate
```
