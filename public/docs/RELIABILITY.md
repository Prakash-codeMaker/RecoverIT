# Reliability

RecoverIT treats payment recovery as a long-running workflow. Evidence verification can retry, AI-provider outages preserve uncertainty, external responses can arrive later, and active cases can be reconciled by scheduled workers.

The durable workflow ledger keeps the current step, next action, reason, trigger, and reconciliation timestamp. Consequential external contact is protected by evidence gates and explicit user approval.