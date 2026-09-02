# RecoverIT Architecture

RecoverIT is organized around a persistent recovery case. The browser is an interface to the case; it is not the source of truth.

## System boundary

See [`recoverit-system-architecture.svg`](../assets/recoverit-system-architecture.svg).

```text
Web UI
  ↓
Authenticated case APIs
  ↓
Case workflow engine
  ├── evidence verification
  ├── investigation
  ├── route preparation
  ├── approval / external contact
  ├── response handling
  └── resolution
  ↓
PostgreSQL system of record

AI interpretation and background jobs operate beside this core.
```

## Core modules

- `lib/case-workflow.js` — authoritative workflow reconciliation.
- `lib/case-verification.js` — evidence verification orchestration and retry behavior.
- `lib/case-brain.js` — case reasoning presentation, subordinated to persisted workflow state.
- `lib/recoverit-ai.js` — AI provider abstraction and failover.
- `lib/dispute.js` / `lib/dispute-automation.js` — recovery-route and external workflow logic.
- `lib/resolution.js` — resolution state and outcome coordination.

## Background continuation

Scheduled workers handle verification, payment monitoring, dispute follow-up, case monitoring and workflow heartbeat. This prevents the user's browser session from becoming a hidden dependency of the recovery process.

## Scaling direction

The current architecture is suitable for an early product because the workflow state is persisted and work can be resumed/retried. The next scaling steps are measured queue throughput, stronger observability, provider playbooks, batched workers, idempotency audits and reproducible evaluation at larger case volumes. These are scale paths, not claims of already-achieved production throughput.