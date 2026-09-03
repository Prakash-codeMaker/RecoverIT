# RecoverIT workflow

> **A recovery case is a durable process — not a chat thread.**

<p align="center">
  <img src="../assets/recoverit-workflow-animated.svg" alt="Animated RecoverIT recovery workflow" width="100%" />
</p>

## The loop

```text
REPORT → VERIFY → INVESTIGATE → RECOVER → APPROVE → ACT → MONITOR
                                                        ↘
                                      RESOLVE ← RESPONSE / RETRY
```

The case always has a persisted **current step + next action + reason**.

## State map

<p align="center">
  <img src="../assets/recoverit-state-machine.svg" alt="RecoverIT case state machine" width="100%" />
</p>

### Safe waiting states

| State | What happens |
|---|---|
| `WAITING_FOR_USER` | Ask for the specific missing proof, fact or approval. |
| `WAITING_FOR_AUTOMATION` | Preserve the case and retry verification/provider work. |
| `MONITORING` | Wait for a provider, refund or customer outcome. |

**Waiting is not failure.** It is an explicit workflow state.

## What persists

```text
┌─────────────────────────────────────────────────────┐
│ RECOVERY CASE                                       │
│                                                     │
│  STEP        → where the case is                    │
│  NEXT ACTION → what can happen next                 │
│  STATUS      → active / waiting / blocked / done    │
│  REASON      → why it is here                       │
│  TRIGGER     → what changed it                      │
│  UPDATED     → when state last changed              │
└─────────────────────────────────────────────────────┘
```

This means the browser can close, a model can time out, or a provider can reply hours later without losing the workflow.

## One case, many interactions

```text
Provider asks for a bank statement
              ↓
     same recovery case
              ↓
     requirement recorded
              ↓
      user uploads proof
              ↓
       verification runs
              ↓
     workflow continues
```

No new ticket is required just because the situation changed.

## Background continuation

```text
VERIFY RETRIES ─┐
PAYMENT MONITOR ─┤
FOLLOW-UP ───────┼──→ WORKFLOW HEARTBEAT → CASE STATE
RESOLUTION ──────┘
```

Background workers continue active cases without an open browser.

## Implementation

- `lib/case-workflow.js` — authoritative orchestration
- `api/cases/workflow-state.js` — current workflow state
- `api/cases/workflow-advance.js` — controlled advancement
- `api/jobs/workflow-heartbeat.js` — background continuation
- `lib/dispute-automation.js` — follow-up scheduling

[Back to repository](../../README.md) · [Architecture](./ARCHITECTURE.md) · [AI boundary](./AI-SAFETY.md)