# RecoverIT workflow

RecoverIT is a persistent case workflow, not a conversational session.

```text
Report
  ↓
Verify identity + evidence
  ↓
Investigate payment facts
  ↓
Prepare legitimate recovery route
  ↓
User approval
  ↓
External contact / guided submission
  ↓
Monitor response
  ↓
Process requested evidence or reply
  ↓
Track refund / outcome
  ↓
Resolve
```

At every stage the case stores the current step, next action, status and reason. A browser can close without losing the workflow position.

## Important gate

No consequential external recovery action is exposed until the required evidence is verified and the route is ready. AI can interpret evidence and prepare a recommendation; deterministic workflow rules decide whether the case is allowed to advance.