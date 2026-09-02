# RecoverIT architecture

RecoverIT is a persistent recovery orchestration layer for payment problems.

```text
Customer story / evidence
          |
          v
   AI interpretation
          |
          v
 Persistent case + workflow ledger
          |
   +------+------+------+
   |             |      |
Evidence      Payment  Provider
verification  context  intelligence
   |             |      |
   +------+------+------+
          |
          v
 Deterministic recovery policy
          |
          v
 User-approved external action
          |
          v
 Response / refund monitoring
          |
          v
        Resolution
```

AI handles interpretation and preparation. Deterministic application code owns authorization, ownership, payment facts, evidence gates, state transitions, approval, idempotency, retries, monitoring, and resolution confirmation.

`lib/case-workflow.js` is the central workflow engine. The case stores its current step, next action, status, reason, trigger, and last reconciliation time so background jobs can resume the same case after the browser closes.

The architecture can scale with batched workers, provider-specific queues, event-driven monitoring, horizontally scaled integrations, and a growing provider playbook layer without changing the customer-facing recovery journey.