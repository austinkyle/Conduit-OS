# conduit-core

conduit-core protects revenue during high-volume launches by turning Shopify webhook delivery into a fast, deduplicated, replayable source of truth.

## Hook: the failure hidden inside a successful flash sale

A 0.5–1% webhook failure rate during a $500k flash sale can leave paid orders missing from fulfillment, support, fraud, or finance systems. The storefront may look healthy while the operating team discovers ghost orders, duplicate actions, and reconciliation gaps hours later.

`conduit-core` separates receipt from processing: it authenticates and durably records each event, acknowledges Shopify immediately, then performs business work through a retryable queue. Operators get a searchable ledger and controlled replay instead of log archaeology.

## Business problem

Shopify webhooks are delivered at least once. Networks time out, dependencies fail, deploys go cold, and Shopify retries events that may already have been accepted. A direct webhook-to-business-logic integration turns each transient failure into a revenue and customer-experience problem.

For a $5M–$50M DTC brand, the requirement is not merely an endpoint that receives JSON. It is a tenant-isolated transaction boundary that can prove what arrived, prevent duplicate effects, recover failed work, and feed every future automation from one trusted event history.

## What it guarantees

| Guarantee | Mechanism |
|---|---|
| Zero lost accepted events | The raw payload is inserted into PostgreSQL before a successful acknowledgement. |
| Zero duplicate ledger events | `UNIQUE (tenant_id, shopify_event_id)` plus `ON CONFLICT ... DO NOTHING`. |
| Exactly-once order materialization | Worker status re-check plus `UNIQUE (tenant_id, external_order_id)` idempotent upsert. |
| Immutable audit payload | Replay resets processing state without replacing the retained source payload. |
| Sub-100 ms steady-state acknowledgements | Local p95 measured ~36–41 ms after warm-up. |
| Recoverable processing | Five BullMQ attempts with exponential backoff and authorized manual replay. |
| Tenant isolation | PostgreSQL RLS plus explicit tenant predicates in application queries. |

These guarantees apply to authenticated webhooks that receive a successful response. Production durability also depends on operating PostgreSQL and Redis with appropriate availability, backup, and monitoring policies.

## Architecture

```mermaid
sequenceDiagram
    autonumber
    participant S as Shopify
    participant A as Fastify ingest
    participant P as PostgreSQL ledger (RLS)
    participant Q as Redis / BullMQ
    participant W as Worker
    participant O as Orders
    participant E as conduit_events
    participant C as Next.js console

    S->>A: POST body + shop + HMAC + event ID
    A->>A: Resolve tenant (60s cache) and verify raw-body HMAC
    alt Invalid tenant or HMAC
        A-->>S: 401 Unauthorized
    else Authenticated
        A->>P: INSERT ... ON CONFLICT DO NOTHING
        alt Duplicate delivery
            P-->>A: No row returned
            A-->>S: 200 duplicate=true
        else New event
            P-->>A: ledgerId
            A->>Q: Enqueue ledgerId + tenantId
            A-->>S: 200 duplicate=false
            Q->>W: Deliver job
            W->>P: Lock event and re-check status
            alt Already processed
                W-->>Q: Complete without side effect
            else Needs processing
                W->>O: Idempotent order upsert
                W->>P: Mark Processed
                W->>E: pg_notify JSON event
                W-->>Q: Complete
            end
            alt Processing error
                W-->>Q: Fail attempt
                Q->>W: Retry up to 5 times, exponential backoff
                Note over W,P: Record failure; terminal failure can alert Slack
            end
        end
    end
    C->>A: Search/filter ledger or authorized replay
    A->>P: Tenant-scoped query/update
    A->>Q: Enqueue replay
```

Runtime: TypeScript/Fastify API on `4000`; Redis 7/BullMQ; PostgreSQL 15; a horizontally scalable worker; and a Next.js 14/Tailwind console on `3000`. Next.js rewrites proxy the API without browser CORS configuration.

## Benchmark results

The local simulator sends 25 signed, shuffled `orders/create` payloads at concurrency 10, includes two fraud-pattern orders, resends five byte-identical events, waits for the queue to drain, and prints `PASS` or `FAIL`.

| Measurement | Verified local result |
|---|---:|
| Acknowledgement p50 | ~27 ms |
| Acknowledgement p95, steady state | ~36–41 ms |
| First burst after a cold deploy | p95 ~105 ms |
| Duplicate responses | 5/5 on every run |
| Duplicate ledger rows | 0 |
| Ten-run materialization check | 250 processed events → exactly 25 order rows |
| Fraud-flagged materialized orders | 1 |
| Failed events | 0 across all runs |
| RBAC | Viewer replay `403`; Admin replay `200` |
| Invalid signature | `401` |

These are local simulator results, not a promise of identical cloud latency.

```bash
cd conduit-core/api
npm run simulate
npm test
```

The simulator defaults to `http://localhost:4000`, the seeded Aurora Apparel tenant, and the seeded Admin token. Overrides: `API_URL`, `SHOP_DOMAIN`, `WEBHOOK_SECRET`, `ADMIN_TOKEN`, and `COUNT`. The test suite contains 11 Vitest tests for HMAC verification and fraud scoring.

## API reference

Local base URL: `http://localhost:4000`.

### `POST /api/v1/webhooks/shopify`

Authenticates, inserts idempotently, enqueues, and acknowledges a Shopify webhook.

| Required header | Purpose |
|---|---|
| `Content-Type: application/json` | Enables JSON parsing while preserving raw signature bytes. |
| `X-Shopify-Shop-Domain` | Resolves the tenant; successful lookups are cached for 60 seconds. |
| `X-Shopify-Hmac-SHA256` | Base64 HMAC-SHA256 over the exact raw body. |
| `X-Shopify-Webhook-Id` | Preferred idempotency key. `X-Shopify-Event-Id`, then payload `id`, are fallbacks. |
| `X-Shopify-Topic` | Event topic such as `orders/create`; defaults to `unknown`. |

New events return `{ "ok": true, "duplicate": false, "ledgerId": "<uuid>" }`; repeats return `{ "ok": true, "duplicate": true }`. Authentication failures return `401`; malformed payloads or missing event IDs return `400`.

### `GET /api/v1/ledger/events`

Requires `Authorization: Bearer <token>`. Returns tenant-scoped events, total, and status counts. Query parameters: `status` (`Pending`, `Processed`, `Failed`), exact `topic`, search `q` across event ID/topic, `limit` (default 50, max 200), and `offset` (default 0). All roles can read.

### `POST /api/v1/ledger/events/:id/replay`

Requires a bearer token and **Owner** or **Admin** role. Resets a tenant-owned event to `Pending`, clears its error, and re-enqueues it. Manager/Viewer receive `403`; missing or cross-tenant IDs receive `404`.

| Demo token | Role | Read | Replay |
|---|---|---:|---:|
| `tok_owner_demo` | Owner | Yes | Yes |
| `tok_admin_demo` | Admin | Yes | Yes |
| `tok_manager_demo` | Manager | Yes | No |
| `tok_viewer_demo` | Viewer | Yes | No |

These are local demo credentials, not production secrets. Liveness: `GET /healthz`.

## Data model

| Table | Responsibility |
|---|---|
| `tenants` | Brand, unique Shopify domain, webhook secret, encrypted integration-key storage. |
| `users` | Tenant membership, email, role, and API bearer token. |
| `webhook_ledger` | Original payload, event ID, topic, status, attempts, errors, and timestamps; unique per tenant/event ID. |
| `orders` | Materialized order, payment/fulfillment state, raw data, and fraud outcome; unique per tenant/external order ID. |

Migrations and demo seed data auto-apply through PostgreSQL's initialization directory on the first Docker boot.

## Security

**HMAC:** The API verifies `X-Shopify-Hmac-SHA256` against exact raw bytes using the tenant secret. Unknown shops and invalid/missing signatures return `401` before insertion.

**RLS and service-role pattern:** All four tables have forced PostgreSQL Row-Level Security keyed on `current_setting('app.tenant_id')`. Each tenant operation opens a transaction, sets that value transaction-locally, and still includes an explicit tenant predicate. Production should connect as `conduit_app` or an equivalent non-superuser role subject to RLS—never a superuser or bypass-RLS role.

**Encryption at rest:** The crypto helper protects stored Shopify/API tokens with AES-256-GCM, a random 12-byte IV, and authentication tag. `ENCRYPTION_KEY` must be 64 hexadecimal characters (32 bytes). Replace the all-zero local Docker default in production. Production bearer credentials should also be issued, rotated, and securely managed by the chosen identity layer.

## Fraud detection agent

Every order is scored deterministically before materialization. Scores cap at 100; **50 or higher is flagged**.

| Signal | Weight | Rule |
|---|---:|---|
| Abnormal cart value | 35 | Total exceeds 4× the tenant average. |
| Shipping/billing mismatch | 30 | Country or postal code differs. |
| Rapid-fire ordering | 25 | At least 3 existing orders from the customer within 10 minutes. |
| Disposable email | 20 | Domain matches disposable/suspicious heuristics. |
| Placeholder name | 10 | Name is absent or resembles `test` / `asdf`. |

When `ANTHROPIC_API_KEY` is set and deterministic scoring already flags an order, the worker can request a Claude second opinion. Its verdict is stored as explanatory context with zero score weight; deterministic rules remain the boundary. External-call failure does not stop processing.

## Shopify Admin setup

The demo requires no store: `npm run simulate` generates realistic payloads, signs them with the seeded secret, and exercises the full path locally.

1. Deploy the API behind HTTPS at `POST https://<api-host>/api/v1/webhooks/shopify`.
2. In Shopify Admin, open **Settings → Notifications → Webhooks**, choose **Create webhook**, select an event, JSON format, a supported API version, and the public URL. Labels may vary slightly by Admin release.
3. Register at minimum **Order creation** (`orders/create`). Add update/cancellation topics only when downstream semantics are defined.
4. Save the canonical `*.myshopify.com` domain in `tenants.shopify_domain` exactly as sent in `X-Shopify-Shop-Domain`.
5. Save the matching secret in `tenants.webhook_secret`. For Admin-created webhooks, use Shopify's displayed signing secret. For app-managed subscriptions, Shopify signs with the app client secret.
6. Send a Shopify test notification and confirm the event appears in the console.

The signature covers raw bytes. Proxies and middleware must forward the body unchanged.

## Production deploy notes

| Local component | Production mapping |
|---|---|
| PostgreSQL 15 | Supabase Postgres or another managed PostgreSQL service |
| Redis 7 | Upstash Redis or another BullMQ-compatible managed Redis |
| `api` | Railway, Render, ECS/Fargate, Kubernetes, or equivalent stateless service |
| `worker` | Separate worker service using the same image |
| Next.js `web` | Railway, Render, ECS, or a Next.js-capable host |

Apply `db/migrations/001_init.sql` and `002_seed.sql` deliberately in hosted environments; Docker first-boot initialization is not a cloud migration runner. Do not load demo users into customer environments. Connect with an RLS-constrained non-superuser role.

| Variable | Required | Purpose / default |
|---|---:|---|
| `DATABASE_URL` | Yes | PostgreSQL URL; use provider-required TLS and the RLS role. |
| `REDIS_URL` | Yes | Redis URL shared by API and workers. |
| `PORT` | Platform-dependent | Fastify port; default `4000`. |
| `ENCRYPTION_KEY` | Yes | 64-character hex AES-256 key in a secret store. |
| `PG_POOL_MAX` | Recommended | Pool size per process; default `20`. Budget across replicas. |
| `PG_IDLE_TIMEOUT_MS` | Optional | Idle DB timeout; default `300000` ms. |
| `WORKER_CONCURRENCY` | Optional | Jobs per worker; default `10`. Tune against DB capacity. |
| `SLACK_WEBHOOK_URL` | Optional | Alert destination after retries are exhausted. |
| `ANTHROPIC_API_KEY` | Optional | Enables Claude escalation for flagged orders. |
| `NEXT_PUBLIC_API_URL` | Web deployment | Browser-visible API URL; local value `http://localhost:4000`. |
| `API_URL` | Web/simulator | Next.js server-side origin or simulator target. |

Also configure PostgreSQL backups/PITR, appropriate Redis availability, HTTPS, centralized logs, queue alerts, secret rotation, and health checks.

## Scaling to BFCM

- Run stateless Fastify nodes behind a load balancer. The 60-second cache is disposable; correctness lives in PostgreSQL constraints.
- Scale BullMQ workers horizontally. Row locks, status checks, and unique order keys make redelivered work converge.
- Keep `PG_POOL_MAX × process count` below the database connection budget; add a provider pooler where appropriate.
- Tune `WORKER_CONCURRENCY` from measured database latency, not CPU alone.
- Keep fraud and downstream work outside the Shopify request lifecycle.
- Warm replicas before traffic. The local cold first burst reached ~105 ms p95; steady-state p95 was ~36–41 ms.
- Monitor pending/failed counts, queue depth/age, DB saturation, Redis latency, ack percentiles, retries, and terminal alerts.

## Roadmap

Source-specific schema converters for **BigCommerce**, **WooCommerce**, and **TikTok Shop** will normalize events into the same ledger and downstream contract. The `conduit_events` contract remains stable so support, operations, and finance modules do not need source-specific commerce logic.
