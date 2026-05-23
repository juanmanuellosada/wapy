## ADDED Requirements

### Requirement: Signup requires a whitelisted email and creates a session

The system SHALL allow signup only for emails that exist in `public.whitelist` with an invite that has not expired (≤7 days since `invited_at`) and has not yet been registered. On successful signup, the system SHALL create a Supabase Auth user, trigger the `handle_new_user` function that creates a `public.users` row with the role from `whitelist.grant_role`, and establish an active session (auto-login). No additional email confirmation step is required.

#### Scenario: Whitelisted email signs up successfully

- **WHEN** an email present in `whitelist` (with `registered_at IS NULL` and `invited_at` within 7 days) submits the signup form with a valid password
- **THEN** the server creates a Supabase Auth user, the `handle_new_user` trigger creates a `public.users` row, and the response sets session cookies that authenticate the user immediately

#### Scenario: Non-whitelisted email cannot sign up

- **WHEN** an email not present in `whitelist` submits the signup form
- **THEN** the server rejects the request with an error message indicating the email is not invited, and no `auth.users` row is created

#### Scenario: Expired invite cannot sign up

- **WHEN** a whitelisted email whose `invited_at + 7 days < now()` submits the signup form
- **THEN** the server rejects the request with an error message indicating the invite has expired

#### Scenario: Already-registered email cannot sign up again

- **WHEN** a whitelisted email whose `registered_at IS NOT NULL` submits the signup form
- **THEN** the server rejects with a message suggesting the user log in instead

#### Scenario: Invalid token in URL is rejected

- **WHEN** the signup URL contains `?token=X` and `X` does not match the whitelist row's `invite_token`
- **THEN** the server rejects with an "invalid invite link" message even if the email is otherwise valid

#### Scenario: Token in URL prefills the email field

- **WHEN** a user lands on `/signup?token=X` where `X` matches a whitelist row's `invite_token`
- **THEN** the form prefills the email field with that row's `email` and locks it (read-only) to prevent the user from changing it

### Requirement: Login authenticates with email and password

The system SHALL allow registered users to log in by providing their email and password. On success, the system SHALL establish a session and route the user according to their `role`.

#### Scenario: Successful login routes by role

- **WHEN** a user with `role = 'owner'` logs in
- **THEN** the response redirects them to `/onboarding`

#### Scenario: Superadmin login routes to admin

- **WHEN** a user with `role = 'superadmin'` logs in
- **THEN** the response redirects them to `/admin`

#### Scenario: Wrong credentials show generic error

- **WHEN** a user submits a wrong password (or a non-existent email)
- **THEN** the response shows a generic "incorrect email or password" message (no account enumeration)

### Requirement: Logout clears the session

The system SHALL provide a logout endpoint that clears Supabase Auth cookies and redirects the user to the landing page.

#### Scenario: Logout from authenticated page

- **WHEN** a logged-in user submits the logout form
- **THEN** session cookies are cleared and the user is redirected to `/`

#### Scenario: Logout when not logged in is a no-op

- **WHEN** the logout endpoint is hit without a valid session
- **THEN** the response still redirects to `/` without error

### Requirement: Forgot-password initiates a reset email

The system SHALL allow a user to request a password reset by entering their email on `/forgot-password`. The system SHALL call Supabase Auth's `resetPasswordForEmail()` which sends a templated mail with a one-time link to `/reset-password?token=...`. The system SHALL always respond with a generic success message regardless of whether the email exists, to prevent account enumeration.

#### Scenario: Existing user requests reset

- **WHEN** a registered user submits `/forgot-password` with their email
- **THEN** Supabase sends a reset email with a link to `{NEXT_PUBLIC_APP_URL}/reset-password?...`, and the page shows "If an account exists for this email, we've sent a reset link"

#### Scenario: Non-existent email request

- **WHEN** an email not registered submits `/forgot-password`
- **THEN** the page shows the same "if an account exists..." message — no information leak about whether the email is registered

### Requirement: Reset-password sets a new password from the reset link

The system SHALL accept a password reset via `/reset-password` when the user arrives with a valid Supabase Auth reset token. The system SHALL update the password via Supabase Auth and then route the user according to their role.

#### Scenario: Valid reset token lets user set a new password

- **WHEN** a user arrives at `/reset-password` from a valid Supabase reset link and submits a new password matching the minimum requirements
- **THEN** the password is updated, the user is logged in, and they are redirected to their role's landing (`/onboarding` or `/admin`)

#### Scenario: Invalid or expired reset token shows clear error

- **WHEN** the reset link is expired or invalid
- **THEN** the page shows an error explaining the link is invalid and offers a button to request a new one

### Requirement: Password minimum length is enforced client and server

The system SHALL require passwords to be at least 8 characters. Validation SHALL run on both the client (via `zod` schema in `react-hook-form`) and the server (re-validated in the server action with the same schema before calling Supabase Auth).

#### Scenario: Password shorter than 8 chars is rejected

- **WHEN** a signup or reset-password form is submitted with a 7-character password
- **THEN** the request is rejected with a clear error before any auth operation is attempted

#### Scenario: Server re-validates password length

- **WHEN** a malicious client bypasses client-side validation and POSTs a 5-character password
- **THEN** the server action rejects it with the same error (no `auth.users` row is created)
