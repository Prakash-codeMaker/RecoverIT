# Reliability

RecoverIT is designed around the assumption that external systems, AI providers, browsers and users can disappear at any time.

## Reliability mechanisms

- durable workflow ledger;
- background verification retries;
- AI-provider failover;
- idempotent workflow advancement;
- duplicate-action protection;
- state-aware external contact;
- scheduled monitoring;
- persisted evidence and event history;
- deterministic safety gates around consequential operations.

## Browser independence

The browser renders the current case state. It does not own the state machine. Workers can continue checking an active case after the browser has been closed.

## Honest operating modes

RecoverIT can be in a state such as `WAITING_FOR_USER`, `WAITING_FOR_AUTOMATION`, `AWAITING_RESPONSE` or `DONE`. These are product states, not generic loading screens.

## Current evidence

The repository includes a deterministic end-to-end harness. The latest recorded full run before the workflow-ledger presentation changes passed 21/21 checks. New scale and recovery-quality claims should be generated from reproducible evaluations rather than inferred from this single run.