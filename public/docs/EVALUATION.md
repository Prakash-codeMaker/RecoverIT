# Evaluation

RecoverIT should optimize for resolution quality, not AI activity.

## Current test strategy

The test-mode surface covers the core recovery loop, including:

- schema and fixture readiness;
- synthetic case creation;
- verified evidence fixture;
- route preparation;
- dispute attempt persistence;
- awaiting-response state;
- organization request handling;
- requested-evidence satisfaction;
- same-organization follow-up;
- duplicate-case protection;
- approval requirement;
- resolution synchronization;
- multimodal AI probing;
- cleanup.

The latest recorded full E2E run passed **21/21 checks**.

## Metrics to add before making performance claims

The production evaluation set should report at least:

1. evidence-verification precision / recall;
2. recovery-route accuracy;
3. successful recovery rate;
4. amount at risk vs amount recovered;
5. abstention / exception rate;
6. duplicate-action prevention rate;
7. median time to next useful action;
8. external-response classification accuracy.

All metrics should come from a reproducible fixture set and be separated into synthetic, replayed and real-consented data where applicable.

## Evaluation principle

Do not convert product analytics such as page visits or case count into a recovery-rate claim. A metric is publishable only when its definition, denominator, dataset and test procedure can be reproduced.