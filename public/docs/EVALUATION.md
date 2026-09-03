# Evaluation

RecoverIT separates **workflow correctness** from **business outcome claims**.

## Latest recorded full E2E run

**21/21 checks passed** on **September 2, 2026**.

The run exercised the production-shaped workflow components with synthetic fixtures and verified:

- schema reachability;
- synthetic case creation;
- verified evidence-analysis contract;
- eligible route discovery;
- first-action preparation;
- persisted dispute attempt;
- awaiting-response transition;
- organization response capture;
- exact requested-document requirement;
- replacement evidence satisfying that requirement;
- same-organization follow-up;
- same-case continuity;
- approval requirement;
- resolution-state synchronization;
- multimodal AI availability.

The recorded multimodal probe succeeded through the fallback path with OpenRouter.

## Broader recovery suite

The recovery suite currently exercises five high-value issue types and includes:

- no-evidence contact blocking;
- missing-document gating;
- verified first-action preparation;
- same-organization follow-up;
- escalation preparation;
- Case Brain rebuild;
- resolution projection;
- a connected Razorpay test-payment probe.

The current route matrix exposes **13 eligible routes** for the synthetic high-value scenarios used by the suite.

## What these tests do prove

They provide evidence that the workflow contracts are connected and that important safety invariants can be tested repeatedly.

## What these tests do not prove

They do not establish:

- a production recovery percentage;
- a real-world route accuracy percentage;
- real customer money recovered;
- universal provider coverage;
- model accuracy on a representative held-out production dataset.

Those metrics require a labeled evaluation set with known outcomes.

## Future business-grade benchmark

The next evaluation layer should report:

```text
cases processed
₹ at risk
₹ recovered
recovery rate
route accuracy
verification accuracy
abstention / exception rate
escalation rate
unsafe actions prevented
median time to useful next action
```

The principle is simple: **publish measured outcomes, not optimistic estimates.**