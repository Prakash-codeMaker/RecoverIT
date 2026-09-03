# AI safety boundary

RecoverIT uses AI where ambiguity and unstructured information create real value, and deterministic code where authority and financial correctness matter.

> **AI can recommend. Deterministic controls decide.**

## AI is responsible for interpretation

- story understanding;
- multimodal document interpretation;
- structured fact extraction;
- missing-information detection;
- provider-response classification;
- route/message preparation.

## Deterministic code is responsible for authority

- authentication and case ownership;
- payment/reference/amount consistency;
- evidence verification gates;
- destination and channel legitimacy;
- workflow state transitions;
- explicit user approval;
- duplicate/idempotency protection;
- retries and monitoring;
- escalation eligibility;
- resolution confirmation.

## Consequential action gate

A model output cannot directly send a consequential recovery action.

```text
AI suggestion
    ↓
structured case state
    ↓
deterministic policy checks
    ↓
exact destination + message + evidence
    ↓
explicit user approval
    ↓
external action
```

If the gate fails, the system waits or asks for a specific missing item.

## Why not let the model decide?

Payment recovery contains facts that should be exact: transaction references, amounts, timestamps, ownership, evidence status, destination and whether an action has already happened.

These are better represented as typed database state and deterministic predicates than as free-form model reasoning.

## Fail-closed behavior

- no verified evidence → no consequential contact;
- no legitimate route → no send;
- no approval → no consequential action;
- uncertain provider response → no automatic resolution;
- temporary AI outage → preserve state and retry;
- synthetic test evidence → never presented as real recovery.