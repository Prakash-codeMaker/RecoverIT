# Integrations

RecoverIT keeps external providers behind the recovery workflow. Integrations supply evidence or provider state; they do not bypass the deterministic action gate.

## Current integrations

### Razorpay

- connected test-mode payment probe;
- transaction lookup foundation;
- refund integration foundation;
- webhook path;
- payment-state reconciliation.

The repository describes this as **Razorpay test-mode integration**, not an official production partnership.

### Bank reconciliation

`api/bank/reconcile.js` supports bank-side payment context and reconciliation used by recovery routes.

### UPI reconciliation

`api/upi/reconcile.js` provides UPI-specific reconciliation and provider context.

### Google Drive evidence import

Google Drive can be used as an optional evidence source. This is separate from authentication: **RecoverIT currently uses email-code authentication, not Google sign-in.**

### Email

Transactional case notifications are centralized in `lib/user-notifications.js` and sent only for meaningful events with deduplication/quiet-window behavior.

### Twilio SMS

SMS is available for important/action-needed notifications. WhatsApp is intentionally not part of the current RecoverIT integration surface.

## Integration rule

```text
provider data
    ↓
case state
    ↓
deterministic checks
    ↓
approved action
```

External provider success is recorded as provider evidence; it is not automatically interpreted as final customer resolution.