## MODIFIED Requirements

### Requirement: Post-login destination depends on role

The system SHALL route a user to their role-appropriate landing page immediately after a successful login or signup. Routing logic SHALL live in the server action (not in the middleware), using the `redirect()` API of Next.js. For owners, the destination depends on their store state: if no published store exists, redirect to `/onboarding` (which then further routes to the correct wizard step); if a store is already published, redirect to `/dashboard`.

#### Scenario: Owner without store lands on /onboarding

- **WHEN** a `role = 'owner'` user with no `stores` row (or `status='draft'`) completes signup or login
- **THEN** the server action returns a redirect to `/onboarding`

#### Scenario: Owner with published store lands on /dashboard

- **WHEN** a `role = 'owner'` user whose store has `status='published'` logs in
- **THEN** the server action returns a redirect to `/dashboard`

#### Scenario: Superadmin lands on /admin

- **WHEN** a `role = 'superadmin'` user completes signup or login
- **THEN** the server action returns a redirect to `/admin`

#### Scenario: Redirect query param overrides default

- **WHEN** a user reaches `/login?redirect=/dashboard/products` and logs in successfully
- **THEN** the server action redirects them to `/dashboard/products` (a path their role allows) instead of the default for their role
