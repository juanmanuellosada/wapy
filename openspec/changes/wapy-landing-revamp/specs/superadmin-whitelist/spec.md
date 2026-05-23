## MODIFIED Requirements

### Requirement: /admin shows the whitelist with derived status

The system SHALL render at `/admin/whitelist` (moved from `/admin`) a table of all `whitelist` rows (read via admin client) with columns: email, grant_role, plan, status, invited_at, registered_at, trial ends in, and per-row actions. The status SHALL be derived in TypeScript as `'registered'` if `registered_at` is not null, `'expired'` if `now() > invited_at + 7 days`, otherwise `'invited'`. The trial column SHALL show "venció hace X días" or "vence en X días" based on `trial_ends_at`, or "—" if null (e.g., the seeded superadmin).

The system SHALL redirect `/admin` to `/admin/leads` as the default landing for the superadmin panel.

#### Scenario: Superadmin lands on /admin/leads by default

- **WHEN** a superadmin navigates to `/admin`
- **THEN** the response redirects to `/admin/leads`

#### Scenario: Whitelist tab still accessible

- **WHEN** the superadmin clicks the "Whitelist" tab in the admin nav
- **THEN** the response navigates to `/admin/whitelist` and renders the whitelist table identically to before, now with `plan` and "trial ends in" columns

#### Scenario: Non-superadmin is redirected away

- **WHEN** a user with `role = 'owner'` navigates to `/admin` or any sub-path
- **THEN** the middleware redirects them to `/onboarding` and the panel never loads

#### Scenario: Status reflects current state

- **WHEN** a row has `registered_at = NULL` and `invited_at = now() - 8 days`
- **THEN** the row's status badge reads "Expirado" (red)

- **WHEN** a row has `registered_at` set to any past timestamp
- **THEN** the row's status badge reads "Registrado" (green) regardless of `invited_at`

#### Scenario: Trial column shows accurate countdown

- **WHEN** a whitelist row has `trial_ends_at = now() + 5 days`
- **THEN** the trial column shows "Vence en 5 días"

- **WHEN** a whitelist row has `trial_ends_at = now() - 2 days`
- **THEN** the trial column shows "Venció hace 2 días" with a warning color

- **WHEN** a whitelist row has `trial_ends_at IS NULL` (e.g., the seeded superadmin)
- **THEN** the trial column shows "—"
