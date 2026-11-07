# RecoverIT × TraceRoot: agent reliability demo

A small, standalone TypeScript companion example showing how RecoverIT's durable
payment-recovery workflow can be represented as nested TraceRoot spans.

It is intentionally **synthetic**. It does not connect to the deployed RecoverIT
application, a real model provider, a bank, Razorpay, email, SMS, or any payment
system. The external-action function is an in-memory fixture.

## What the trace shows

```text
recoverit.case.workflow
├── recoverit.evidence.verify
├── recoverit.ai.investigate          (attempt 1: synthetic timeout)
├── recoverit.ai.investigate          (attempt 2: success)
├── recoverit.route.prepare
└── recoverit.external_action.dispatch (only after explicit approval)
```

The demo records workflow-step/status attributes, a synthetic case identifier,
the selected route, evidence verification outcome, retry count and synthetic
dispatch acknowledgement. Function inputs and outputs are deliberately not
captured by the SDK wrappers; only the curated attributes are emitted.

## Run locally

Requirements: Node.js 20 or later and an API key for TraceRoot Cloud if you want
to export the trace.

```bash
cd examples/traceroot-agent-reliability
npm install
npm test
npm run typecheck
```

To export the demo trace:

```bash
# macOS / Linux
export TRACEROOT_API_KEY="your-project-api-key"
npm run demo
```

PowerShell:

```powershell
$env:TRACEROOT_API_KEY = "your-project-api-key"
npm run demo
```

The demo uses `@traceroot-ai/traceroot` and its `observe()`, `updateCurrentSpan()`,
and `TraceRoot.flush()` APIs. Auto-instrumentation is disabled because the
example focuses on the workflow spans it explicitly creates.

## Safety and evaluation boundary

- Use only the bundled synthetic IDs and fixture values.
- Do not add real names, emails, account numbers, payment references, receipts,
  bank statements, tokens or provider credentials to span attributes.
- The synthetic provider is not a real external-action integration.
- The tests assert retry behavior, evidence gating and explicit approval. They
  do not claim production recovery rates, real funds recovered or production
  reliability.
- This folder is not wired into the live Hatchable runtime. It is a reproducible
  companion example intended for engineering review.
