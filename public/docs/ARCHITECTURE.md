# RecoverIT architecture

RecoverIT is a persistent orchestration layer for payment recovery. The central architectural decision is to separate **probabilistic interpretation** from **deterministic authority**.

## System boundary

```text
Customer story + evidence
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

### Responsibilities

| Layer | Owns |
|---|---|
| **Experience** | story input, evidence upload, case state, next action, approval UI |
| **AI layer** | interpretation, extraction, classification, provider-response understanding, preparation |
| **Case Brain** | structured synthesis of facts/evidence/next action |
| **Workflow engine** | authoritative step, status, reason, next action and continuation |
| **Policy/gates** | authorization, evidence gates, route legitimacy, idempotency and approval |
| **Provider adapters** | Razorpay, bank/UPI and provider-specific routes |
| **Workers** | verification retries, monitoring, follow-up and workflow reconciliation |
| **Resolution** | outcome projection and confirmation |

## Core implementation

`lib/case-workflow.js` is the central orchestration module. It loads the durable case state, evaluates the relevant gates, computes the authoritative next step and persists the workflow ledger.

The workflow ledger includes:

```text
workflow_step
workflow_next_action
workflow_status
workflow_reason
workflow_last_trigger
workflow_updated_at
```

`api/jobs/workflow-heartbeat.js` provides background continuation so active cases do not depend on an open browser.

## AI boundary

AI is deliberately not the system of record.

AI may:

- understand a payment story;
- read a receipt, statement or screenshot;
- extract candidate payment facts;
- identify missing information;
- classify an organization response;
- prepare a route or message.

Deterministic code decides:

- whether the caller owns the case;
- whether evidence satisfies the gate;
- whether payment facts are consistent;
- which destination/channel is legitimate;
- whether the user explicitly approved the action;
- whether a duplicate action already exists;
- whether a provider response changes the workflow;
- whether an outcome is actually confirmed.

## Failure boundary

A provider/model failure is converted into a recoverable workflow condition whenever possible.

```text
provider timeout
      ↓
preserve evidence + case
      ↓
mark verification unavailable / retryable
      ↓
background retry / fallback provider
      ↓
reconcile workflow
```

A clear evidence rejection remains a hard gate. A temporary verifier outage is not treated as proof rejection.

## Scaling boundary

The customer-facing case model stays stable as the execution layer grows. More volume can be handled by:

- batched verification workers;
- provider-specific queues/adapters;
- event-driven provider updates;
- stronger observability and tracing;
- horizontally scaled integrations;
- expanded provider playbooks;
- larger outcome datasets.

The durable workflow ledger is the source of progress, so scaling execution does not require moving state into an LLM transcript.