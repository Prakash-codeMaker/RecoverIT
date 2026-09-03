# RecoverIT workflow

A RecoverIT case is a **durable process**, not a chat thread.

```text
REPORT
  ↓
VERIFY
  ↓
INVESTIGATE
  ↓
PREPARE RECOVERY
  ↓
USER APPROVAL
  ↓
EXTERNAL ACTION / GUIDED HANDOFF
  ↓
MONITOR
  ↓
RESOLVE / ESCALATE / REQUEST INPUT
```

## State model

The workflow can stop at a safe boundary and resume later.

| State | Meaning |
|---|---|
| `IDENTITY` | establish the authenticated owner/case context |
| `EVIDENCE` | collect and verify proof |
| `WAITING_FOR_USER` | a specific document, fact or approval is needed |
| `WAITING_FOR_AUTOMATION` | provider/model is unavailable; retry is armed |
| `INVESTIGATION` | reconstruct facts and timeline |
| `ROUTE` | determine a legitimate provider/recovery route |
| `APPROVAL` | exact consequential action is prepared for user review |
| `EXTERNAL_ACTION` | approved action is delivered or handed off |
| `MONITORING` | wait for provider/customer outcome |
| `RESOLVED` | outcome is confirmed |

## Workflow ledger

The case persists:

```text
workflow_step
workflow_next_action
workflow_status
workflow_reason
workflow_last_trigger
workflow_updated_at
```

This answers four critical questions without asking the model to reconstruct them:

1. **Where is the case?**
2. **What can happen next?**
3. **Who/what is blocking progress?**
4. **Why is the case in this state?**

## Waiting is a first-class state

RecoverIT does not turn uncertainty into a fake answer.

Examples:

- evidence is missing → wait for the user;
- evidence is rejected → request replacement proof;
- provider is unavailable → preserve state and retry;
- a response requests a bank statement → attach that exact requirement to the same case;
- user has not approved contact → keep the action prepared but unsent.

## Same-case continuity

When an organization asks for more information, the response, requirement, replacement evidence and follow-up action remain attached to the same case.

That prevents the common failure mode where every new support interaction becomes a disconnected ticket.

## Background continuation

Scheduled workers reconcile active cases for:

- evidence verification;
- payment/refund monitoring;
- dispute follow-up;
- workflow heartbeat;
- resolution synchronization.

The browser is an interface to the workflow, not the workflow itself.