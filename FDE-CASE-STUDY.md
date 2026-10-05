# Conduit-OS — FDE case study

## Evidence boundary

An implemented four-module portfolio prototype. This case study is based on repository code, test sources, simulators, and previously recorded local results inspected on October 5, 2026. It is not a client engagement record. No real-work shadowing, client rollout, operator adoption, or commercial ROI is established here. Historical benchmark results were not rerun during documentation cleanup.

## 1. Observe: workflow and constraint

**Modeled workflow:** Shopify emits order events; support, inventory, and finance need consistent order state; operators investigate discrepancies and retry failed work. Duplicate delivery or an unauditable failure can create reconciliation work and inconsistent downstream decisions.

**Discovery still required:** follow an actual order exception across the store, helpdesk, warehouse, and accounting tools. Record who repairs it, the source of truth, event volumes, duplicate/retry frequency, time spent, and which decisions require approval. Those observations and volumes are not supplied by this repository.

## 2. Route: software, AI, human

| Work | Owner | Reason / implementation evidence |
| --- | --- | --- |
| Verify signed events, store ledger rows, deduplicate, queue and materialize orders | Software | Authentication, identity, and state transitions are explicit rules: [ingest](conduit-core/api/src/routes/webhooks.ts), [worker](conduit-core/api/src/worker.ts). |
| Calculate fraud signals, depletion forecasts, financial rollups and cohorts | Software | Repeatable rules and arithmetic: [fraud scorer](conduit-core/api/src/fraud/scorer.ts), [forecast](conduit-ops/api/src/forecast.ts), [rollup](conduit-cfo/api/src/rollup.ts). |
| Interpret flagged orders, classify tickets, draft policy responses, propose read queries | AI, optionally | Bounded assistance: [fraud escalation](conduit-core/api/src/fraud/llm.ts), [reply worker](conduit-reply/api/src/worker.ts), [financial copilot](conduit-cfo/api/src/copilot.ts). |
| Replay failures, authorize restricted actions, approve purchases and business interventions | Human | [Role-gated replay](conduit-core/api/src/routes/ledger.ts), [commerce action routes](conduit-reply/api/src/routes/actions.ts), operator consoles. Role gating is not a substitute for a reviewed operating policy. |

## 3. Design for failure

| Failure | Implemented response | Remaining boundary |
| --- | --- | --- |
| Invalid signature or repeated delivery | HMAC verification and database uniqueness | Does not prove ordering correctness for every topic. |
| Worker failure | Bounded BullMQ attempts/backoff, ledger error status, terminal alert, privileged replay | Alert configuration and recovery ownership need acceptance. |
| Model unavailable | Several modules offer deterministic/no-key paths | Fallback quality must be reviewed for the specific task. |
| Model proposes a write query | Application SELECT guard plus a restricted database role | Test actual deployed grants and tenant isolation before rollout. |
| Ledger succeeds but queue enqueue fails | The ledger retains the pending event; replay is available | Ingest does not atomically couple ledger insertion to enqueue. A duplicate delivery can be acknowledged without re-enqueueing. Add an outbox or pending-event reconciler before claiming guaranteed delivery. |
| A downstream listener is disconnected | PostgreSQL notification is transient | Add durable consumer recovery/checkpoints before relying on every downstream event. |

## 4. Verify: current evidence and next acceptance

- [HMAC tests](conduit-core/api/test/hmac.test.ts), [fraud rules](conduit-core/api/test/scorer.test.ts), [forecast tests](conduit-ops/api/test/forecast.test.ts), [copilot tests](conduit-cfo/api/test/copilot.test.ts) and module usage tests describe reproducible engineering checks.
- The [Shopify simulator](conduit-core/api/scripts/simulate-shopify.ts) and module `scripts/eval-scenarios.ts` files exercise synthetic/demo conditions. The root README preserves historical local latency, duplicate, and authorization results.
- These checks are not historical business acceptance. Next: replay permission-approved order history; reconcile totals and status ordering; inject enqueue/listener outages; compare support drafts, forecasts, and finance outputs with accountable operators.
- Agree on acceptance criteria before the trial: reconciliation differences, duplicate side effects, recoverability, authorized action correctness, alert ownership, and acceptable latency. Run in shadow mode before enabling external actions.

## 5. Measure business value

Establish baseline exception volume, reconciliation minutes, support handling time, stockout days, inventory tied up, and reporting delay. Compare the same measures after adoption, including software/API costs and ongoing intervention time. Report recovered capacity separately from realized cash savings; record assumptions and overlap when estimating loss exposure. No savings figure is measured in this repository.

## Architecture choice, adoption, and next work

The ledger/worker split makes ingest, processing, and operator recovery inspectable; it also introduces a queue boundary that needs durable reconciliation. A simpler scheduled reconciliation may be sufficient for a lower-volume business and should be evaluated during discovery.

The intended employee change is fewer opaque exceptions and a visible recovery queue. Demonstrated employee adoption remains absent. Next work is durable enqueue/consumer recovery, historical reconciliation, operator acceptance, and an anonymized measured engagement—not another module.
