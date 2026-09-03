# RecoverIT demo

The strongest walkthrough is one real product journey rather than a slide deck.

## Five-minute walkthrough

### 0:00–0:30 — The problem

Start with one concrete payment incident:

> “The merchant says the refund was processed, but the customer still does not have the money.”

Show why the customer normally has to coordinate evidence across multiple systems.

### 0:30–1:00 — The product

Show the complete loop:

```text
story → evidence → verification → investigation → recovery → approval → monitoring → resolution
```

Introduce the key architecture principle:

> **AI handles ambiguity. Deterministic software handles authority.**

### 1:00–3:00 — Working product

Use the live product and show:

- natural-language problem intake;
- evidence upload;
- verification state;
- payment/timeline reconstruction;
- next action;
- explicit approval gate;
- persistent case state.

### 3:00–4:00 — Architecture

Show the relationship between:

- `lib/recoverit-ai.js`;
- `lib/case-brain.js`;
- `lib/case-workflow.js`;
- `lib/dispute.js`;
- `api/cases/dispute-send.js`.

Explain that the model interprets while deterministic code controls authority.

### 4:00–4:40 — Failure recovery

Explain the verification-timeout incident:

```text
synchronous verifier failure
        ↓
case creation broke
        ↓
separate evidence staging from authorization
        ↓
preserve case + retry/failover
        ↓
remain blocked until verified
```

### 4:40–5:00 — Evidence

Show:

- 21/21 latest E2E checks;
- 13 eligible synthetic recovery routes;
- test-mode provider probe;
- current limitations.

## Test Mode

After signing in, `/test-mode.html` provides a synthetic protected scenario. It does not contact a real organization.

## Demo principle

Spend most of the time showing the product working. Use the repository and technical documentation to make the deeper engineering inspectable afterward.