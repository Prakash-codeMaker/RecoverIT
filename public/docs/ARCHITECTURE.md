# RecoverIT architecture

RecoverIT separates probabilistic AI interpretation from deterministic case control.

```text
Customer / payment context
          ↓
       RecoverIT UI
          ↓
        Case APIs
          ↓
┌────────────────────────────┐
│ Persistent case workflow   │
│ evidence · investigation   │
│ recovery route · outcome   │
└────────────┬───────────────┘
             ↓
        PostgreSQL state
          ↙       ↘
   AI reasoning   Background jobs
        ↓              ↓
 interpretation    monitoring / retry
        ↓
 deterministic safety gates
        ↓
 approved external action
```

### Product-to-code

| Product capability | Code / state |
|---|---|
| Persistent workflow | `lib/case-workflow.js` + `recovery_cases.workflow_*` |
| Evidence verification | `lib/case-verification.js` |
| AI interpretation | `lib/recoverit-ai.js` + `lib/case-brain.js` |
| Recovery routing | `lib/dispute.js` + `api/cases/dispute-*` |
| Resolution | `lib/resolution.js` |
| Background continuation | `api/jobs/workflow-heartbeat.js` |
| Provider integration | `api/integrations/*` |

### Why this scales

The unit of scale is the **case workflow**, not a chat session. Provider adapters, batched workers, idempotent actions, monitoring and outcome signals can expand around the same case contract as coverage grows.