# Security

RecoverIT handles payment-related evidence, so the architecture is intentionally conservative around authority and secrets.

## Authentication and access

- End-user authentication is provided by the platform auth layer.
- Current user authentication is passwordless email-code login.
- Case routes are scoped to the authenticated user.
- Google sign-in is not part of the current product.

## Secrets

Do not commit:

- Razorpay credentials;
- Twilio credentials;
- AI provider keys;
- webhook secrets;
- OAuth client secrets;
- private evidence;
- production database exports.

Provider credentials are configured outside the repository.

## Evidence

Evidence is stored as application data, not committed into Git. Synthetic Test Mode fixtures are clearly labeled and are never presented as real customer records.

## Money-path safety

Consequential external recovery actions require:

1. appropriate verified evidence;
2. consistent case/payment facts;
3. a legitimate route and destination;
4. explicit user approval;
5. duplicate/idempotency checks.

## Resolution safety

Provider processing does not automatically equal customer receipt. The resolution layer requires the relevant outcome evidence before marking the case resolved.

## Repository hygiene

The public repository intentionally contains source, architecture diagrams, test methodology and synthetic fixtures — not production credentials or private customer data.