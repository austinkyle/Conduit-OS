# CLAUDE.md — Conduit-OS

## What This Is

Conduit-OS is an event-driven AI operating system for high-growth DTC brands ($5M–$50M revenue). It is a portfolio flagship AND a productizable system — every architectural decision must survive scrutiny from a technical founder evaluating whether to hire or buy.

Positioning: enterprise middleware, not scripts. Code quality, docs, and repo presentation must reflect that.

## Monorepo Structure

```
conduit-os/
├── conduit-core/     # High-Integrity Ingestion Ledger — Shopify webhook/event ingestion, dedup, replay. Zero dropped transactions under BFCM-scale load.
├── conduit-reply/    # Omnichannel Agentic CRM — reads customer history from core, queries shipping APIs, localized RAG. Resolves tracking, address edits, refunds autonomously.
├── conduit-ops/      # Predictive Supply Chain & ERP — marketing velocity forecasts → inventory replenishment, PO drafting, automated supplier email loops.
└── conduit-cfo/      # Executive Financial Cockpit — merges Meta/Google ad APIs + transactions + unit costs. Real-time net margin, LTV cohorts, natural-language queries.
```

Data flow: `conduit-core` is the source of truth. All other modules consume its event stream. Nothing writes around it.

## Business Problem Each Module Solves (keep in every README)

- **core**: 0.5% webhook failure rate at scale = tens of thousands in disputes/ghost orders
- **reply**: Support payroll is the fastest-growing cost center; automate ~70% of tickets while raising LTV
- **ops**: Cash frozen in slow inventory while bestsellers stock out
- **cfo**: Multi-million ad scaling decisions made on stale spreadsheet data

## Working Rules

- Per-module context lives in `<module>/context.md`. Read it before working in a module. Keep this root file lean — routing only.
- Model routing: Sonnet for building, Opus/Fable for architecture, planning, adversarial review.
- Plan mode for high-blast-radius work: schema changes, event contract changes in core, anything touching money math in cfo.
- Event contracts between modules are sacred. Breaking changes to core's event schema require explicit review — every downstream module depends on it.
- Every module ships with: production-quality README (hook → business problem → architecture → ROI metrics), architecture diagram, and runnable demo.
- One-click deploy is a hard requirement: single `docker-compose.yml` at root spins up the full stack locally. Test it before any release-worthy commit.

## Presentation Requirements (GitHub-facing)

- Root README leads with: system architecture diagram, ROI metric highlights (70% ticket reduction, 40% fewer stockout days, real-time daily net profit), one-click deployment proof.
- Write READMEs for a founder-buyer first, engineer second. Business outcome in the first sentence.
- No placeholder content, no TODO stubs in main. If a module isn't ready, it isn't in main.

## Status

- [x] conduit-core — shipped (ingest API, worker, fraud agent, ledger console, tests, simulator — verified 2026-07-15)
- [x] conduit-reply — shipped (ticket ingest, BullMQ classification, RAG draft generation, autonomous Shopify actions, churn-prevention SMS loop, Agent Copilot console, tests, eval, simulator — verified 2026-07-15)
- [x] conduit-ops — shipped (forecast engine, PO auto-drafting, supplier email agent, returns router, invoice OCR, Supply Chain Command Center console, tests, eval, simulator — verified 2026-07-15)
- [x] conduit-cfo — shipped (financial rollup engine, LTV cohorts, NL copilot with DB-level readonly-role enforcement, BullMQ worker, Executive Financial Cockpit console, tests, eval, simulator — verified 2026-07-15)
- [x] cross-module integration layer — shipped (event-driven reactions from core's stream into reply/ops/cfo debounced BullMQ jobs, shared `usage_ledger` + Stripe metered-billing sync + cfo usage panel, cfo copilot schema extended to `orders_financial`/`products`/`usage_ledger` via DB grants — see root README's "Cross-module integration" section and each module's `context.md`)

Details per module to be provided; update each `context.md` as specs arrive.
