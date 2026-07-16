# Conduit-OS

Conduit-OS gives high-growth DTC brands a reliable event-driven AI operating system that turns every commerce event into an auditable, automation-ready business signal.

Built for $5M–$50M brands, it starts with `conduit-core`: a Shopify ingestion ledger that acknowledges webhooks quickly, eliminates duplicate-delivery effects, preserves replayable history, and publishes a stable event stream for future support, inventory, and finance automation.

> **New here?** Read **[Conduit OS: The Simple Layman's Explanation](CONDUIT-OS-EXPLAINED.md)** ([PDF](CONDUIT-OS-EXPLAINED.pdf)) for a plain-English walkthrough of what all four modules do and how they work together, with a real-world example.

## In plain English

**The problem:** Every time someone buys something on a Shopify store, Shopify sends a small notification called a "webhook" — think of it as a text message saying "order #4471 just happened." A store's backend systems (inventory, shipping, support, accounting) all rely on receiving that message correctly, exactly once.

At small scale this works fine. But during a huge sale — Black Friday, a viral TikTok moment, a celebrity shoutout — Shopify can fire thousands of these messages a minute. Under that kind of load, ordinary systems start to fail in ways that cost real money:

- **Messages get dropped.** A server gets overwhelmed, doesn't reply fast enough, and Shopify's message disappears. That order silently never enters the store's system — a customer paid, but nothing shipped and nobody noticed until they complained.
- **Messages get duplicated.** Shopify retries messages it thinks failed, even when they actually succeeded. Without safeguards, that can mean charging a customer's shipping twice or double-counting an order in the sales dashboard.
- **Messages arrive out of order.** A "refund" notification can arrive before the "order paid" notification it refers to, confusing systems that expect things to happen in sequence.

For a brand doing $20M/year, a 0.5%–1% failure rate during one big sale isn't a rounding error — it's real orders, real customer complaints, and real support-team hours spent untangling what actually happened.

**What Conduit-Core does about it:** It sits between Shopify and everything downstream as a strict, honest gatekeeper. Every incoming order message is checked for authenticity (so nobody can fake an order), instantly recorded in a permanent, searchable ledger, and processed exactly once — even if Shopify sends the same message five times. Nothing is lost, nothing is double-counted, and every event is visible in a dashboard where a human can see exactly what happened and, if something ever did fail, replay it with one click. It also runs a lightweight fraud check on every order in the background, flagging suspicious ones (mismatched addresses, unusually large carts, disposable email addresses) without slowing anything down.

Think of it less like "an app" and more like a company's accounting ledger for online orders: boring by design, because boring means nothing gets lost, nothing gets double-booked, and there's always a paper trail.

**Why it's the foundation of the whole system:** Conduit-Core is the first of four planned modules. It's built first because everything else — automating customer support, predicting inventory needs, tracking real-time profit margins — depends on having a trustworthy, complete, deduplicated record of what actually happened in the store. Get that record wrong, and every downstream automation inherits the error.

## System architecture

```mermaid
flowchart LR
    Shopify[Shopify webhooks] --> HMAC[HMAC-verified ingest]
    subgraph Core[conduit-core — shipped]
        HMAC --> Ledger[(Postgres webhook ledger<br/>Row-Level Security)]
        HMAC --> Queue[Redis / BullMQ]
        Queue --> Worker[Idempotent worker<br/>fraud scoring + retries]
        Worker --> Orders[(Postgres orders)]
        Worker --> Ledger
        Ledger --> Console[Next.js ledger console]
    end
    Worker --> Stream[pg_notify conduit_events<br/>downstream event stream]
    subgraph Reply[conduit-reply — shipped]
        Stream --> Intake[Ticket classification]
        Intake --> Drafts[RAG drafts]
        Drafts --> Actions[Authorized actions]
    end
    subgraph Ops[conduit-ops — shipped]
        Stream --> Velocity[Sales velocity + forecast]
        Velocity --> POs[Auto-drafted purchase orders]
        POs --> Supplier[Supplier email agent]
    end
    subgraph CFO[conduit-cfo — shipped]
        Stream --> Rollup[Daily financial rollup]
        Orders -.read-only.-> Rollup
        Rollup --> Cohorts[LTV cohorts]
        Rollup --> Copilot[NL copilot<br/>readonly-role enforced]
    end
    Console -->|search, filter, replay| HMAC
```

## Verified local benchmark

These are honest local results from the included simulator—not hosted-production claims. It sends 25 signed webhooks at concurrency 10, includes two fraud-pattern payloads, resends five byte-identical deliveries, and polls until processing drains.

| Business concern | Verified result | Why it matters |
|---|---:|---|
| Acknowledgement latency | p50 ~27 ms; steady-state p95 ~36–41 ms | Below the `<100 ms` target in steady state |
| Cold-deploy behavior | Only the first burst showed p95 ~105 ms | Warm-up behavior is visible, not hidden |
| Duplicate deliveries | 5/5 acknowledged as duplicates on every run | Shopify retries do not create duplicate work |
| Duplicate ledger rows | 0 ever created | Database uniqueness backs idempotency |
| Exactly-once materialization | 250 processed ledger events across 10 runs produced exactly 25 order rows | Repeated runs converge on one row per external order |
| Fraud outcome | 1 order fraud-flagged | Deterministic scoring runs in the worker path |
| Processing failures | 0 across all verified runs | The verified runs drained cleanly |
| Authorization | Viewer replay → `403`; Admin replay → `200` | Replay follows role boundaries |
| Authentication | Invalid HMAC → `401` | Untrusted payloads do not enter the ledger |

## Quick start

Requirements: Docker with Compose support.

```bash
# Optional: copy defaults before adding real secrets
cp .env.example .env

# Migrations and demo seed data apply automatically on first boot
docker compose up -d --build
```

Open [http://localhost:3000](http://localhost:3000). The console includes a seeded Owner/Admin/Manager/Viewer role picker.

```bash
# Run the signed Shopify simulator
cd conduit-core/api
npm run simulate

# Run 11 HMAC and fraud-scoring tests
npm test
```

| Service | Host address |
|---|---|
| Next.js console | `http://localhost:3000` |
| Fastify API | `http://localhost:4000` |
| PostgreSQL 15 | `localhost:5433` |
| Redis 7 | `localhost:6380` |

> When running API tools outside Docker, use host ports `5433` and `6380`, not the containers' `5432` and `6379`.

## Modules

| Module | Status | Business problem |
|---|---|---|
| [`conduit-core`](conduit-core/README.md) | **Shipped and verified** | Prevents lost, duplicated, or unauditable events from becoming ghost orders and reconciliation work. |
| [`conduit-reply`](conduit-reply/README.md) | **Shipped and verified** | Automates ticket triage, grounded drafts, and authorized commerce actions so service volume can grow without support payroll growing at the same rate. |
| [`conduit-ops`](conduit-ops/README.md) | **Shipped and verified** | Releases cash frozen in slow inventory while bestsellers stock out. |
| [`conduit-cfo`](conduit-cfo/README.md) | **Shipped and verified** | Replaces ad-scaling decisions made on stale spreadsheet data with a daily reconciled net-profit number, real LTV cohorts, and a database-enforced read-only NL copilot. |

## Cross-module integration

The four modules aren't four separate apps sharing a database by coincidence — `conduit-core`'s event stream actively drives the other three, and every module's AI-task spend rolls up into one bill.

- **Event-driven reactions, not just shared tables.** Each downstream module (`reply`, `ops`, `cfo`) keeps a `LISTEN conduit_events` connection open on core's `pg_notify` channel. An `orders/*` webhook enqueues a debounced BullMQ job in the relevant queue — a financial rollup, a demand-forecast scan, a churn scan — 30–60 seconds later. A burst of orders during a flash sale collapses into one job per tenant per 5-minute window (a deterministic `jobId` makes a repeat enqueue within that window a no-op), so a BFCM-scale spike doesn't fan out into a rollup storm.
- **One usage ledger, one bill.** Every module records each AI-task execution (fraud escalation, ticket classification, draft generation, invoice OCR, copilot query) to a shared `usage_ledger` table — real token counts and Haiku pricing where available, a flat per-task estimate otherwise. `conduit-cfo` reads it back in an **AI task usage & billing** panel and reports it to Stripe's metered-billing API on an hourly cycle (`[simulated]`-logged when no `STRIPE_API_KEY` is set, so the loop is fully exercisable with zero external accounts).
- **Cross-module financial copilot.** The NL copilot's schema now spans a PII-safe `orders_financial` view onto core's orders (no customer id, no raw payload) and `ops`'s `products` table, alongside cfo's own tables — enforced the same way as everything else in cfo: by what the `conduit_cfo_readonly` Postgres role is actually granted, not by an app-layer allowlist.
- **Upgrading an existing volume.** `docker-entrypoint-initdb.d` only runs against a fresh Postgres volume. If you already have one running, apply the integration migration directly: `./scripts/apply-migration.sh`.

## What ships today

- Fastify ingest with raw-body HMAC-SHA256 verification and 60-second tenant cache.
- PostgreSQL idempotency on `(tenant_id, shopify_event_id)`.
- BullMQ processing with five attempts, exponential backoff, and terminal Slack alerts.
- Tenant-isolated ledger and order materialization protected by PostgreSQL RLS.
- Deterministic fraud scoring with optional Claude escalation.
- `pg_notify('conduit_events', ...)` publication for downstream modules.
- Next.js 14 console with live counts, search, filters, JSON inspection, role selection, and replay.
- Reproducible simulator and 11 passing unit tests.
- `conduit-reply` CRM with asynchronous classification, grounded drafts, role-gated Shopify actions, churn SMS, Agent Copilot, and zero-key fallbacks.
- `conduit-ops` ERP with deterministic depletion forecasting, auto-drafted purchase orders, a supplier email agent, a returns router, and invoice OCR with a deterministic fallback.
- `conduit-cfo` Executive Financial Cockpit with a daily financial rollup engine, LTV cohort computation, and an NL copilot enforced read-only at the database level, not just the app layer.

See the [`conduit-core` deep dive](conduit-core/README.md) for API, security, Shopify setup, deployment, and scaling details, the [`conduit-ops` deep dive](conduit-ops/README.md) for forecasting, PO drafting, and invoice OCR details, or the [`conduit-cfo` deep dive](conduit-cfo/README.md) for the rollup engine, cohorts, and copilot security boundary.

## A note on the four consoles' proxy configuration

Each module's Next.js console proxies `/api/*` to its Fastify API via `next.config.js`'s `rewrites()`. That destination is resolved and baked into the built `.next/routes-manifest.json` at **image build time** — it is not read from an environment variable at container start. Each `<module>/web/Dockerfile` accepts `API_URL` as a build `ARG`, and the corresponding `build.args` in `docker-compose.yml` supplies the in-network API address (e.g. `http://cfo-api:4003` for `cfo-web`). If you ever change an API's internal address or port, rebuild the affected web image (`docker compose build <web-service>`) and recreate its container — restarting the container alone will not pick up a new destination.
