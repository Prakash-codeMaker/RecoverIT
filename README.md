# RecoverIT

> **Your payment problem doesn't end when you report it.**
>
> RecoverIT is an AI-assisted payment dispute resolution platform designed to help people understand payment problems, organize evidence, take the right next action, monitor progress, and move toward resolution.

[![Status](https://img.shields.io/badge/status-active%20prototype-orange)](https://recoverit.hatchable.site)
[![Built with](https://img.shields.io/badge/built%20with-Hatchable-black)](https://hatchable.ai)
[![AI](https://img.shields.io/badge/AI-Gemini-blue)](https://ai.google.dev/)

**Live product:** https://recoverit.hatchable.site

---

## Why RecoverIT?

Payment disputes are rarely as simple as "raise a complaint." A user may know that money was deducted, a refund was promised, or a transaction failed, but still have no idea:

- what actually happened;
- which evidence matters;
- who needs to be contacted;
- what to do next;
- whether they should wait or escalate; or
- whether the issue has genuinely been resolved.

RecoverIT is built around a different model:

```text
User story
    ↓
Understand the problem
    ↓
Verify identity + payment facts
    ↓
Collect and review evidence
    ↓
Investigate
    ↓
Give one clear next action
    ↓
Monitor the case
    ↓
Notify the user when something changes
    ↓
Escalate when appropriate
    ↓
Confirm the real outcome
```

The goal is not to generate a generic complaint and leave the user alone. The goal is to create a **living case** that can continue moving toward a real outcome.

---

## Product principles

### 1. Outcome over AI

The user does not care that an AI model ran an inference. They care about what happened to their money and what they should do next.

RecoverIT therefore keeps AI behind the product experience and exposes useful outcomes such as:

- **Payment verified**
- **Evidence needed**
- **Provider response received**
- **Evidence conflict found**
- **Action required**
- **Waiting for provider**
- **Escalation prepared**
- **Resolved**

### 2. AI where judgment helps; deterministic systems where certainty matters

RecoverIT deliberately does **not** use AI for everything.

**AI is useful for:**

- understanding natural-language payment stories;
- extracting structured facts from messy descriptions;
- interpreting provider responses;
- reviewing evidence context;
- identifying missing information;
- explaining complicated payment journeys in simple language;
- preparing provider-specific messages and escalation drafts;
- multilingual and voice-based interaction.

**Deterministic logic is preferred for:**

- authentication and authorization;
- case ownership;
- transaction/reference data;
- timestamps and amounts;
- case states;
- evidence presence;
- monitoring schedules;
- notification delivery;
- escalation eligibility rules;
- resolution confirmation;
- database integrity.

This separation is intentional: AI should help reason about uncertainty, not invent payment states.

### 3. Never assume a payment state without reliable evidence

If an AI provider is unavailable or evidence is incomplete, RecoverIT should preserve uncertainty rather than manufacture an answer.

For example:

> "We could not verify the refund yet. The case remains open and needs additional evidence."

is preferable to an unsupported claim that a refund was or was not received.

---

## Core capabilities

### 🧾 Case registration

Users can describe a payment problem using natural language instead of having to understand financial terminology first.

The system supports:

- text descriptions;
- voice-based reporting;
- transaction/reference information;
- provider or merchant responses;
- evidence uploads.

### 🔎 AI-assisted investigation

RecoverIT can turn a user's story and available evidence into structured investigation context and explain what is known, unknown, and required next.

### 🧩 Evidence management

Users can provide supporting material such as:

- receipts;
- bank statements;
- refund confirmations;
- screenshots;
- provider responses;
- payment references;
- other relevant proof.

### 🛡️ Identity verification

Cases are tied to the authenticated user account so investigation and case history can continue without repeatedly asking the user to identify themselves.

### 🧠 Resolution engine

Cases are treated as living resolution workflows rather than static complaint forms.

A case can move through stages such as:

```text
Understand
→ Verify
→ Check proof
→ Investigate
→ Recovery plan
→ User action / Provider waiting
→ Monitor
→ Resolve
```

### 🔄 Continuous monitoring

Active cases can be checked by background jobs. RecoverIT can surface meaningful changes and determine when the user needs to pay attention.

The system is designed around **meaningful updates**, not noisy "AI is thinking" notifications.

### 🔔 User notifications

When a case requires attention or receives a meaningful update, RecoverIT can surface the update through the product's notification and email-update workflows.

Examples:

> **Action needed:** Add the transaction reference so the investigation can continue.

or:

> **New provider response:** RecoverIT found a discrepancy between the response and the evidence you supplied.

### 🏦 Provider intelligence

RecoverIT includes provider-oriented workflows and intelligence designed to make investigations more specific to the payment ecosystem involved.

The architecture can be extended with provider playbooks for UPI, wallets, cards, banks, merchants, payment gateways, telecom services, and other payment contexts.

### 📦 Dispute Pack

RecoverIT can prepare a structured escalation package containing relevant case facts, evidence, timeline, provider responses, and the requested resolution.

The user remains in control of consequential escalation actions.

### 📈 Outcome learning

User feedback and case outcomes are captured as product signals so future versions can learn which workflows, questions, evidence requests, and resolution paths are actually useful.

The objective is to optimize for **real resolution**, not simply more AI activity.

### 🛡️ Payment Protection

RecoverIT includes a foundation for personal payment/refund monitoring so users can keep track of active payment issues and return to cases that need attention.

---

## Architecture

RecoverIT is currently implemented as a full-stack web application on Hatchable.

```text
                         ┌─────────────────────┐
                         │   RecoverIT Web UI   │
                         │ Landing / Dashboard │
                         │ Case / Evidence     │
                         └──────────┬──────────┘
                                    │
                         authenticated API calls
                                    │
             ┌──────────────────────┴──────────────────────┐
             │                                             │
     ┌───────▼────────┐                           ┌────────▼────────┐
     │ Case workflows │                           │ User services   │
     │ Investigation  │                           │ Notifications   │
     │ Evidence       │                           │ Feedback        │
     │ Resolution     │                           │ Verification    │
     └───────┬────────┘                           └────────┬────────┘
             │                                             │
             └──────────────────┬──────────────────────────┘
                                │
                       ┌────────▼─────────┐
                       │ PostgreSQL / DB  │
                       │ Cases / Events   │
                       │ Evidence / Data │
                       └────────┬─────────┘
                                │
                 ┌──────────────┴──────────────┐
                 │                             │
        ┌────────▼────────┐           ┌────────▼────────┐
        │ AI reasoning    │           │ Background jobs │
        │ Gemini via      │           │ Case monitoring │
        │ Hatchable AI    │           │ Payment monitor │
        └─────────────────┘           └─────────────────┘
```

### Backend areas

The current project includes API areas for:

- account information;
- case creation and retrieval;
- investigation and AI reports;
- live/quick case status;
- evidence upload;
- identity verification;
- notifications;
- payment checks and complaint preparation;
- provider intelligence;
- feedback and outcome signals;
- P1/P2 case tooling;
- resolution state;
- Razorpay webhook handling;
- scheduled case and payment monitoring.

### Data model

The project uses PostgreSQL migrations for its application data, including case, event, investigation, evidence, notification, feedback, provider, monitoring, analytics, escalation, and resolution functionality.

Migrations are versioned in `migrations/` and applied by Hatchable during deployment.

---

## AI architecture

RecoverIT uses AI as a reasoning layer rather than as the system of record.

A simplified investigation looks like:

```text
Natural-language story
        │
        ▼
Fact extraction
        │
        ├── amount
        ├── date/time
        ├── provider
        ├── transaction reference
        ├── claimed outcome
        └── missing information
        │
        ▼
Evidence + provider context
        │
        ▼
AI reasoning
        │
        ├── what is supported?
        ├── what is uncertain?
        ├── what conflicts?
        └── what information is needed?
        │
        ▼
Deterministic resolution state
        │
        ▼
One clear user action
```

This design is important for trust. An AI response is treated as an input to the resolution workflow, not unquestionable truth.

---

## Continuous investigation

RecoverIT is designed for cases that take time.

A case can remain active while waiting for:

- provider responses;
- additional evidence;
- refund processing;
- payment-state changes;
- user confirmation;
- escalation windows.

Background monitoring runs independently of the user's browser session. Users should not need to keep a page open for a case to remain active.

The case monitor operates on active cases in batches, allowing the architecture to scale beyond a single user's case.

---

## Privacy & security

Payment disputes can contain highly sensitive information. RecoverIT is therefore designed around several principles:

- authentication is handled by the platform;
- case access is scoped to the authenticated user;
- API endpoints declare access requirements;
- secrets are stored through Hatchable's secret configuration rather than committed credentials;
- provider webhook secrets are kept server-side;
- AI credentials are not exposed to the browser;
- evidence should only be accessed by authorized workflows;
- consequential escalation actions should remain user-controlled.

### Important

**Never commit real API keys, webhook secrets, credentials, private certificates, customer evidence, production database exports, or other sensitive material to a public GitHub repository.**

Before making this repository public, review the repository contents and Git history for secrets and personal data.

---

## Configuration

RecoverIT uses Hatchable configuration and managed services.

The current production configuration includes authentication, Google/Gemini AI, scheduled case monitoring, and an optional Razorpay webhook secret.

Secrets are configured through the deployment environment rather than hard-coded into application source.

Typical configuration concepts include:

```toml
[auth]
enabled = true

[ai]
required = true
providers = ["google"]

[[secret]]
key = "GOOGLE_API_KEY"
required = true
expose = false
```

Do **not** put actual secret values into `hatchable.toml` or GitHub.

---

## Local / development notes

The project is built for Hatchable's managed runtime.

Hatchable provides the runtime services used by RecoverIT, including:

- PostgreSQL access;
- authentication;
- AI access;
- storage;
- email;
- scheduling;
- browser capabilities;
- deployment and API hosting.

The project intentionally uses the Hatchable SDK instead of maintaining duplicate infrastructure clients.

If you are developing this project outside Hatchable, you will need to provide equivalents for those managed services or adapt the application architecture accordingly.

---

## Project structure

```text
.
├── api/
│   ├── account/
│   ├── actions/
│   ├── admin/
│   ├── cases/
│   ├── evidence/
│   ├── feedback/
│   ├── jobs/
│   ├── notifications/
│   ├── payment/
│   ├── product/
│   ├── provider-intelligence/
│   ├── verification/
│   └── webhooks/
│
├── lib/
│   ├── case.js
│   └── resolution.js
│
├── migrations/
│   └── 001_core.sql ... 036_resolution_engine.sql
│
├── public/
│   ├── index.html
│   ├── app.html
│   ├── case.html
│   ├── report.html
│   ├── resolution.html
│   ├── notifications.html
│   ├── feedback.html
│   ├── admin.html
│   ├── cases/
│   ├── india/
│   ├── vendor/
│   └── *.css / *.js
│
└── hatchable.toml
```

---

## Current status

RecoverIT is an **active prototype / early-stage product**.

> **Repository note:** The GitHub repository is intended to publish the source code and architecture. Production credentials, database data, customer evidence, generated private assets, and deployed infrastructure state are not part of the repository.

The project already contains a working foundation for:

- authenticated user accounts;
- payment-dispute case creation;
- evidence collection;
- AI-assisted investigation;
- identity verification;
- case events and status;
- continuous case monitoring;
- payment/refund monitoring;
- provider intelligence;
- notifications and email updates;
- escalation preparation;
- dispute-pack workflows;
- outcome feedback;
- personal payment protection;
- resolution-state management.

Some provider integrations and external payment-network capabilities are still evolving. RecoverIT should never claim that it directly checked a bank or provider system unless a real integration or reliable evidence supports that claim.

---

## Roadmap

### Near term

- [ ] Expand provider-specific workflows
- [ ] Improve UPI payment-state reconciliation
- [ ] Add more real provider integrations
- [ ] Improve evidence extraction and verification
- [ ] Expand multilingual voice support
- [ ] Improve email-based case updates
- [ ] Strengthen dispute-pack generation
- [ ] Add more resolution outcome signals

### Scale

- [ ] Distributed/batched investigation workers
- [ ] Provider-specific resolution playbooks
- [ ] Stronger event-driven monitoring
- [ ] Resolution-quality evaluation
- [ ] More robust observability
- [ ] Privacy-preserving analytics
- [ ] Automated escalation eligibility checks
- [ ] Large-scale case queue management

### Long-term vision

RecoverIT should become a **payment-resolution layer** that can help people across millions of payment problems without turning every case into a manual support ticket.

The long-term system should continuously improve from anonymized/appropriate product signals, case outcomes, provider behavior, and user feedback while keeping user data protected.

---

## What RecoverIT is not

RecoverIT is not:

- a bank;
- a payment processor;
- a regulator;
- a guaranteed refund service;
- a replacement for a bank's or provider's official dispute process;
- a system with automatic access to every user's bank account.

RecoverIT helps users **understand, document, pursue, monitor, and escalate** payment disputes.

Actual payment outcomes depend on the relevant bank, merchant, payment provider, network, evidence, and applicable dispute process.

---

## Contributing

Contributions are welcome as the project moves toward a more open payment-resolution platform.

Good areas for contribution include:

- provider-specific playbooks;
- evidence-verification methods;
- multilingual UX;
- accessibility;
- resolution-state design;
- monitoring architecture;
- privacy and security;
- evaluation datasets and test scenarios;
- developer tooling;
- documentation.

Before opening a pull request:

1. Explain the problem being solved.
2. Keep changes focused.
3. Avoid committing secrets or real customer data.
4. Add or update tests where appropriate.
5. Preserve the existing authentication and case-ownership model.
6. Avoid claiming provider/payment states that cannot be verified.

---

## Security

If you discover a security vulnerability, **do not open a public issue containing exploit details or sensitive information**.

Use the repository's private security-reporting mechanism once configured, or contact the project maintainer privately.

---

## License

Copyright © 2026 RecoverIT.

This project is currently released under the **MIT License**. See [`LICENSE`](./LICENSE).

---

## Built with

- **Hatchable** — application hosting, database, authentication, APIs, scheduling and managed services
- **PostgreSQL** — application data and case state
- **Gemini / Google AI** — AI-assisted investigation
- **HTML / CSS / JavaScript** — product interface
- **Razorpay webhook integration** — provider-event foundation

---

## Vision

> **A payment problem should not require the user to become a payment expert.**
>
> RecoverIT is being built to understand what happened, verify what can be verified, tell the user what matters, keep the case moving, and stay with the problem until there is an outcome.

**RecoverIT — keep the case moving.**