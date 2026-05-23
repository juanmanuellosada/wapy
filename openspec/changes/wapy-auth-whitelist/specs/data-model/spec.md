## MODIFIED Requirements

### Requirement: Whitelist gates registration and carries role grants

The system SHALL maintain a `whitelist` table of email addresses that are permitted to register. Each row SHALL carry a `grant_role` value (`'owner'` by default, `'superadmin'` for seeded admins), an `invite_token`, and timestamps for `invited_at` and `registered_at`. The whitelist is the single source of truth for both "can this email sign up" and "what role do they get on first login". Validation of whitelist membership and invite expiration SHALL be performed server-side using the admin Supabase client; no PostgREST RPC endpoint is exposed for whitelist lookups.

#### Scenario: Email is case-insensitive unique

- **WHEN** a row with email `User@Example.com` exists and a row with `user@example.com` is inserted
- **THEN** the database rejects the second insert (emails are stored lowercased via trigger)

#### Scenario: Default grant_role is owner

- **WHEN** a row is inserted into `whitelist` without specifying `grant_role`
- **THEN** the row is created with `grant_role = 'owner'`

#### Scenario: whitelist_check_email is not callable by anon or authenticated

- **WHEN** an anonymous or authenticated client attempts to call `whitelist_check_email()` via `/rest/v1/rpc/whitelist_check_email`
- **THEN** PostgREST returns a 403 (EXECUTE was revoked from `anon`, `authenticated`, and `public` roles in migration 013)

#### Scenario: Server validates whitelist via admin client

- **WHEN** a signup server action validates a candidate email
- **THEN** it uses the admin client (service role) to query `whitelist` directly, reading `grant_role`, `invite_token`, `invited_at`, and `registered_at` in a single query

#### Scenario: Invite expires 7 days after invited_at

- **WHEN** a server action validates a whitelisted email whose `invited_at` is more than 7 days in the past and whose `registered_at IS NULL`
- **THEN** the action treats the invite as expired and rejects the signup
