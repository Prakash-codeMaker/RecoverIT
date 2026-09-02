# Integrations

RecoverIT is designed to sit above fragmented payment-resolution systems rather than replace them.

## Current integration surface

- Razorpay transaction/refund lookup and webhook foundation;
- Google Drive read-only evidence import;
- payment / UPI reconciliation paths;
- communications configuration for email / messaging workflows;
- provider directory and provider-specific route metadata.

## Integration pattern

```text
Provider event / user evidence
          ↓
Normalize into case facts
          ↓
Persist evidence + source
          ↓
Reconcile with workflow
          ↓
Prepare next legitimate action
```

Every provider integration should make provenance visible and should fail closed when it cannot establish a reliable state.

## Expansion

Future coverage can add bank, UPI, wallet, merchant and gateway playbooks without changing the core case workflow. Provider-specific behavior belongs behind the integration/routing layer rather than inside the generic case state machine.