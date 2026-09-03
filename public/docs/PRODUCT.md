# RecoverIT product

RecoverIT is a payment-resolution product built around a durable recovery case.

## Customer promise

A customer should not have to explain the same payment problem repeatedly to different systems.

RecoverIT keeps together:

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

## What makes the product different

A support assistant can summarize an incident or draft a message. RecoverIT maintains the incident as an executable, durable workflow.

The product is built around four principles:

1. **Evidence before authority** — important actions require the relevant proof.
2. **AI for ambiguity** — models interpret unstructured information.
3. **Deterministic control for money** — exact financial facts and authorization live in application state.
4. **Resolution over conversation** — a completed chat is not a resolved payment.

## Problem families

- payment failed but money was deducted;
- refund not received;
- duplicate payment;
- payment stuck;
- unrecognized payment;
- merchant/provider reconciliation problems.

## Product boundary

RecoverIT does not promise that every payment can be recovered. It makes the next legitimate, evidence-backed step clearer, safer and persistent, then keeps the case moving when the necessary information becomes available.