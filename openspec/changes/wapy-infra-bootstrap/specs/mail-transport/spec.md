## ADDED Requirements

### Requirement: Resend client is configured with a single from-address

The system SHALL send transactional mail via Resend using the from-address `Wapy <hola@wapy.com.ar>`. The Resend client SHALL be lazily instantiated so importing the module does not fail when `RESEND_API_KEY` is unset (e.g., during local dev without the var, or during build).

#### Scenario: Importing the module without RESEND_API_KEY does not crash

- **WHEN** application code imports `lib/resend.ts` and the `RESEND_API_KEY` env var is unset
- **THEN** the import succeeds; an error is thrown only when a sender function is actually called

#### Scenario: Sender function throws a clear error when key is missing

- **WHEN** `sendInviteEmail(...)` is called and `RESEND_API_KEY` is unset
- **THEN** the function throws an error stating `RESEND_API_KEY is not configured`

### Requirement: sendInviteEmail helper sends whitelist invites

The system SHALL provide a `sendInviteEmail({ to, token, inviteUrl })` helper that sends an invite email containing a link to `{NEXT_PUBLIC_APP_URL}/signup?token={token}`. The email subject and body SHALL identify Wapy as the sender and explain that the recipient was invited to create their store.

#### Scenario: Invite email is sent with the correct from and to

- **WHEN** `sendInviteEmail({ to: 'jane@example.com', token: 'abc123', inviteUrl: 'https://wapy.com.ar/signup?token=abc123' })` is called and the Resend key is configured
- **THEN** Resend's API is invoked with `from: 'Wapy <hola@wapy.com.ar>'`, `to: 'jane@example.com'`, and a body containing the invite URL

#### Scenario: Resend API errors surface to the caller

- **WHEN** Resend returns a 4xx/5xx response (e.g., domain not verified)
- **THEN** `sendInviteEmail` rejects with an error carrying the Resend error details

### Requirement: From-domain verification is a documented user task, not a deploy-time check

The system SHALL ship the mail wiring without requiring the Resend domain to be verified at deploy time. The `wapy.com.ar` (or chosen subdomain) verification in Resend is documented in `design.md` and `.env.local.example` as a manual user action before any invite is sent.

#### Scenario: Code merges without verified Resend domain

- **WHEN** the change is deployed to Vercel and the Resend domain is not yet verified
- **THEN** the build succeeds and the app runs; only the act of calling `sendInviteEmail` will fail (which is a Fase 2 concern, not this change)
