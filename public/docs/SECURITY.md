# Security

Payment-resolution workflows can contain sensitive financial information. RecoverIT treats privacy and authorization as product requirements.

## Current principles

- platform-managed authentication;
- case ownership scoped to the authenticated user;
- access declared at the API boundary;
- secrets kept in deployment configuration rather than source;
- AI credentials remain server-side;
- evidence accessed only through authorized workflows;
- explicit user authorization before consequential external contact.

## Public repository hygiene

Never commit:

- API keys or webhook secrets;
- real customer evidence;
- production database exports;
- private OAuth tokens;
- credentials or certificates;
- identifying customer data.

Before publishing the repository, inspect both the working tree and Git history for secrets and private data. Public documentation should use synthetic case examples.

## Threat-model priorities

The highest-risk flows are evidence access, external destination selection, approval handling, duplicate-action prevention and provider/webhook authenticity. Those areas should remain deterministic and testable.