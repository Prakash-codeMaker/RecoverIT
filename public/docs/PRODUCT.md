# RecoverIT product

RecoverIT is a payment-recovery product built around a durable case.

## The customer promise

A customer should not have to repeatedly explain the same payment problem to different systems.

RecoverIT keeps the case together:

```text
story
+ evidence
+ payment facts
+ timeline
+ next action
+ approval
+ provider response
+ outcome
```

## Product loop

```text
REPORT → VERIFY → INVESTIGATE → RECOVER → APPROVE → MONITOR → RESOLVE
```

## What makes it different

A conventional support assistant can summarize the problem or draft a message. RecoverIT goes further by maintaining a durable workflow with explicit gates and background continuation.

The product is designed around four principles:

1. **Evidence before authority** — important actions require the relevant proof.
2. **AI for ambiguity** — use models where unstructured information needs interpretation.
3. **Deterministic control for money** — exact financial facts and authorization are application state.
4. **Resolution over conversation** — success is an outcome, not a completed chat.

## Target problem families

- payment failed but money was deducted;
- refund not received;
- duplicate payment;
- payment stuck;
- unrecognized payment;
- broader merchant/provider reconciliation problems.

## Product boundary

RecoverIT does not promise that every payment can be recovered. It promises to make the next legitimate, evidence-backed step clearer and safer, and to keep the case moving when the system has enough information to continue.