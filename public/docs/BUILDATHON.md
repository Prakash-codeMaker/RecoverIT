# Razorpay AI Buildathon 2026 — RecoverIT submission

This page is a submission-facing map for reviewers who want to connect the application requirements to the shipped build.

## Build

| Submission field | RecoverIT |
|---|---|
| Track | **AI Revenue Recovery** |
| Project | **RecoverIT** |
| Problem | Payment failures, missing refunds, duplicate charges and provider mismatches create fragmented evidence and unclear recovery paths. |
| GitHub | This repository is intended to be **public** for source review. |
| Pitch video | The application accepts a **5-minute pitch video; unlisted is fine**. |
| Failure story | Multimodal verification timeout → case-creation failure → evidence/workflow decoupling + durable retry/failover. |

The Buildathon's public materials emphasize problem taste, build quality, AI judgment and failure recovery.

## What a reviewer can verify

### 1. Problem taste

RecoverIT targets a painful payment-operations gap: the customer has evidence scattered across bank, merchant, gateway and provider systems, while support workflows often stop at explanation rather than resolution.

### 2. Build quality

The repository contains:

- full-stack customer-facing UI;
- Postgres-backed durable case state;
- evidence storage and multimodal analysis;
- a workflow ledger and background workers;
- provider-specific recovery routes;
- approval and duplicate-action gates;
- notifications;
- synthetic end-to-end validation;
- Razorpay test-mode integration.

### 3. AI judgment

AI is used for interpretation because that is where probabilistic models add value:

```text
story understanding
+ document interpretation
+ fact extraction
+ response interpretation
+ route/message preparation
```

Deterministic code owns authority:

```text
ownership
+ evidence gates
+ exact payment facts
+ route legitimacy
+ approval
+ idempotency
+ workflow state
+ resolution
```

### 4. Failure recovery

The most important engineering failure was not hidden:

```text
multimodal verification was synchronous
        ↓
provider timeout returned 502
        ↓
case creation appeared to fail
        ↓
evidence staging was separated from authorization
        ↓
case state is preserved
        ↓
verification retries / fails over
        ↓
external action remains blocked until verified
```

That changed the architecture rather than merely adding a retry button.

## Validation evidence

Latest recorded full E2E run:

**21/21 checks passed — September 2, 2026.**

Additional current validation:

- **13 eligible synthetic recovery routes**;
- connected Razorpay test-payment probe;
- duplicate-action protection;
- same-case provider follow-up;
- requested-document satisfaction;
- resolution-state synchronization;
- multimodal provider fallback probe.

These are engineering/test results. They are not claims of production recovery rate or real customer funds recovered.

## Five-minute demo outline

```text
0:00–0:30  Problem
0:30–1:00  Product thesis + AI boundary
1:00–3:00  Working case demo
3:00–4:00  Architecture + durable workflow
4:00–4:40  What broke + how it was fixed
4:40–5:00  Validation + current limits
```

## Reviewer source map

| Question | Start here |
|---|---|
| What is RecoverIT? | [`PRODUCT.md`](./PRODUCT.md) |
| How does the system work? | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| How does the case continue? | [`WORKFLOW.md`](./WORKFLOW.md) |
| Where is AI used? | [`AI-SAFETY.md`](./AI-SAFETY.md) |
| What happens when something breaks? | [`RELIABILITY.md`](./RELIABILITY.md) |
| What has actually been tested? | [`EVALUATION.md`](./EVALUATION.md) |
| How do providers connect? | [`INTEGRATIONS.md`](./INTEGRATIONS.md) |
| How can this scale? | [`SCALABILITY.md`](./SCALABILITY.md) |
| How is sensitive data handled? | [`SECURITY.md`](./SECURITY.md) |
| What should the demo show? | [`DEMO.md`](./DEMO.md) |

## Submission hygiene

Before submitting:

- keep the GitHub repository **public**;
- keep the pitch video **unlisted** and accessible to anyone with the link;
- keep the pitch at or under the requested five-minute target;
- ensure the live product URL works;
- do not commit API keys, webhook secrets or private customer evidence;
- describe synthetic/test-mode amounts as synthetic;
- do not claim official Razorpay endorsement or production partnership;
- use the failure answer to explain a real engineering problem and the architectural fix.