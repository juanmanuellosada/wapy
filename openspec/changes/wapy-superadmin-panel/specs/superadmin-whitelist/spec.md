## ADDED Requirements

### Requirement: /admin shows the whitelist with derived status

The system SHALL render at `/admin` a table of all `whitelist` rows (read via admin client) with columns: email, grant_role, status, invited_at, registered_at, and per-row actions. The status SHALL be derived in TypeScript as `'registered'` if `registered_at` is not null, `'expired'` if `now() > invited_at + 7 days`, otherwise `'invited'`.

#### Scenario: Superadmin sees all whitelist entries

- **WHEN** a superadmin navigates to `/admin`
- **THEN** the page renders a table containing every row from `whitelist`, with email, role, status badge, and dates visible

#### Scenario: Non-superadmin is redirected away

- **WHEN** a user with `role = 'owner'` navigates to `/admin`
- **THEN** the middleware redirects them to `/onboarding` and the panel never loads

#### Scenario: Status reflects current state

- **WHEN** a row has `registered_at = NULL` and `invited_at = now() - 8 days`
- **THEN** the row's status badge reads "Expirado" (red)

- **WHEN** a row has `registered_at` set to any past timestamp
- **THEN** the row's status badge reads "Registrado" (green) regardless of `invited_at`

### Requirement: Superadmin can add an email to the whitelist with automatic invite

The system SHALL provide an "Add email" form on `/admin` that takes email and grant_role. On submit, a server action SHALL insert the row into `whitelist` and immediately call `sendInviteEmail` with the generated invite_token. If the mail send fails, the row remains created and the UI surfaces the error.

#### Scenario: Adding a new email creates a row and sends invite

- **WHEN** the superadmin submits the add form with `nuevo@example.com` and `grant_role = 'owner'`
- **THEN** a new `whitelist` row is created with the lowercased email, a fresh `invite_token`, and `invited_at = now()`, AND `sendInviteEmail` is called with `to = 'nuevo@example.com'` and `inviteUrl = {NEXT_PUBLIC_APP_URL}/signup?token={invite_token}`

#### Scenario: Adding an existing email fails gracefully

- **WHEN** the superadmin tries to add an email that already exists in the whitelist
- **THEN** the action fails with a clear "this email is already in the whitelist" error and no duplicate row is created (UNIQUE constraint enforces this)

#### Scenario: Mail failure does not roll back the row

- **WHEN** the row insert succeeds but `sendInviteEmail` throws (e.g., Resend API error)
- **THEN** the row remains in `whitelist`, the table refreshes to show it, and the UI displays a warning that the mail did not send, with the Re-invite button available to retry

### Requirement: Superadmin can re-invite a pending whitelist entry

The system SHALL provide a "Re-invite" action per row. When clicked, a server action SHALL regenerate the `invite_token`, reset `invited_at` to `now()`, and call `sendInviteEmail` with the new token. Re-invite SHALL only succeed for rows where `registered_at IS NULL`.

#### Scenario: Re-invite a pending row

- **WHEN** the superadmin clicks Re-invite on a row whose `registered_at IS NULL`
- **THEN** the row's `invite_token` is regenerated, `invited_at` is reset to `now()`, and a new invite mail is sent to that email

#### Scenario: Re-invite on a registered row is blocked

- **WHEN** the superadmin attempts to re-invite a row whose `registered_at IS NOT NULL`
- **THEN** the action rejects with "this user is already registered" and no mutation occurs

### Requirement: Superadmin can remove a whitelist entry

The system SHALL provide a "Remove" action per row. The UI SHALL require an explicit confirmation before the action fires. The action SHALL delete only the `whitelist` row; it SHALL NOT touch `auth.users` or `public.users`.

#### Scenario: Remove an unregistered row

- **WHEN** the superadmin confirms Remove on a row whose `registered_at IS NULL`
- **THEN** the `whitelist` row is deleted and the row disappears from the table on refresh

#### Scenario: Remove a registered row

- **WHEN** the superadmin confirms Remove on a row whose `registered_at IS NOT NULL`
- **THEN** the `whitelist` row is deleted but the corresponding `auth.users` row and `public.users` row remain intact; the user's session is not affected

### Requirement: Server actions enforce role guard independently of middleware

The system SHALL re-verify in every superadmin server action that the caller has `role = 'superadmin'`, even though the middleware already restricts `/admin`. This guards against direct invocation of the actions (e.g., via curl) bypassing the route protection.

#### Scenario: Non-superadmin call fails

- **WHEN** an authenticated user with `role = 'owner'` attempts to invoke `addWhitelistEntry`, `reinviteEntry`, or `removeWhitelistEntry` directly
- **THEN** the action throws a forbidden error before any DB mutation occurs

#### Scenario: Unauthenticated call fails

- **WHEN** an unauthenticated request attempts to invoke any superadmin action
- **THEN** the action throws an unauthorized error
