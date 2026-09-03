# Reliability

RecoverIT treats payment recovery as a long-running workflow with explicit failure states.

## Failure classes

| Failure | Response |
|---|---|
| Temporary AI/provider outage | preserve case, record unavailable state, retry/fail over |
| Evidence rejected | keep case blocked and request correct proof |
| Evidence needs review | keep consequential actions blocked |
| Missing user information | create a specific waiting-for-user action |
| Provider facts conflict | retain uncertainty instead of guessing |
| No legitimate route | do not fabricate a destination |
| Approval missing | keep action prepared but unsent |
| Duplicate action detected | block matching action |
| Provider response arrives later | feed response back into the same workflow |
| Browser closes | background workflow can continue |

## The verification failure that changed the design

The original evidence preflight made synchronous AI verification part of case creation. A provider timeout could therefore turn a temporary infrastructure failure into a user-visible case-creation failure.

The fix separated two concerns:

```text
Evidence staging  ≠  Evidence authorization
```

The file can be retained and the case can continue into a review/unverified state while verification retries. Downstream recovery actions remain gated until verification succeeds.

## AI provider failover

Text and multimodal calls have modality-aware provider fallback. The system validates structured output after each provider response rather than treating an HTTP success as semantic success.

## Idempotency and duplicate protection

Money-adjacent actions are persisted and checked before another matching action is created. This protects against retries and repeated user attempts creating duplicate recovery actions.

## Resolution is evidence-based

A provider saying `processed` does not automatically mean the customer received the money. RecoverIT keeps the case outcome-gated until the relevant receipt/settlement evidence supports resolution.

## Operational continuation

Scheduled workers reconcile active cases for verification, payment/refund monitoring, dispute follow-up and workflow heartbeat. The durable ledger is the source of progress.