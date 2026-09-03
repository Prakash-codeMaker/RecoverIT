# RecoverIT judge demo

The strongest demo is one concrete case followed end-to-end.

## Recommended 5-minute flow

### 0:00–0:30 — Problem

Show the payment/refund problem in one sentence.

Example:

> “The merchant says the refund was processed, but the customer still does not have the money.”

### 0:30–1:00 — Product thesis

Show:

```text
story → evidence → verification → investigation → route → approval → monitoring → resolution
```

Say the key line:

> **AI interprets. Deterministic controls decide.**

### 1:00–3:00 — Working product

Use the live payment checker and move into a case.

Show:

- natural-language story;
- evidence upload;
- verification state;
- investigation/timeline;
- next action;
- approval gate;
- case continuation.

### 3:00–4:00 — Architecture

Show the AI boundary and durable workflow.

Point to:

- `lib/recoverit-ai.js`;
- `lib/case-brain.js`;
- `lib/case-workflow.js`;
- `api/cases/dispute-send.js`.

### 4:00–4:40 — What broke

Explain the evidence-verification timeout problem and the fix:

```text
synchronous verifier failure
        ↓
case creation broke
        ↓
separate evidence staging from authorization
        ↓
preserve case + retry verification
        ↓
fail closed until verified
```

### 4:40–5:00 — Proof

Show the latest validation evidence:

- 21/21 E2E checks passed;
- 13 eligible synthetic routes;
- connected Razorpay test-mode probe;
- no fabricated production recovery percentage.

## Test Mode

After signing in, `/test-mode.html` provides a synthetic protected scenario. It does not contact a real organization.

## Demo rule

Prefer a working product interaction over a slide-heavy explanation. The architecture and repository are there for the reviewer who wants to go deeper.