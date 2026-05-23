## ADDED Requirements

### Requirement: Middleware protects private routes from anonymous access

The system SHALL run Next.js middleware on requests matching `/onboarding/*`, `/dashboard/*`, and `/admin/*`. When a request to any of those paths has no valid Supabase Auth session, the middleware SHALL redirect to `/login?redirect=<original-path>` so the user can be sent back after authenticating.

#### Scenario: Anonymous request to /onboarding is redirected

- **WHEN** an unauthenticated browser requests `/onboarding`
- **THEN** the middleware returns a 307 redirect to `/login?redirect=/onboarding`

#### Scenario: Authenticated request to /onboarding passes through

- **WHEN** an authenticated user (any role) requests `/onboarding`
- **THEN** the middleware passes the request to the route handler without redirect

#### Scenario: Public paths are not affected

- **WHEN** a request to `/`, `/signup`, `/login`, or `/forgot-password` arrives
- **THEN** the middleware does not intercept (the `matcher` excludes those paths)

### Requirement: Middleware enforces role-based routing for /admin

The system SHALL prevent users without `role = 'superadmin'` from accessing `/admin/*`. When a non-superadmin authenticated user tries to access `/admin/*`, the middleware SHALL redirect them to `/onboarding`.

#### Scenario: Owner cannot access /admin

- **WHEN** an authenticated user with `role = 'owner'` requests `/admin` or any sub-path
- **THEN** the middleware returns a 307 redirect to `/onboarding`

#### Scenario: Superadmin can access /admin

- **WHEN** an authenticated user with `role = 'superadmin'` requests `/admin`
- **THEN** the middleware passes the request through

### Requirement: Middleware refreshes Supabase session cookies on every matched request

The system SHALL use `@supabase/ssr`'s middleware helper to read incoming auth cookies, refresh them if near expiration, and write the refreshed cookies onto the response. This SHALL happen on every middleware-matched request without requiring user action.

#### Scenario: Cookies near expiration are refreshed

- **WHEN** an authenticated request arrives with an access token that expires in <60 seconds
- **THEN** the middleware silently obtains a new access token via the refresh token and writes the updated cookie on the response

#### Scenario: Expired refresh token clears session

- **WHEN** an authenticated request arrives with a refresh token that has expired
- **THEN** the middleware clears the auth cookies and the user is treated as anonymous for subsequent middleware checks

### Requirement: Post-login destination depends on role

The system SHALL route a user to their role-appropriate landing page immediately after a successful login or signup. Routing logic SHALL live in the server action (not in the middleware), using the `redirect()` API of Next.js.

#### Scenario: Owner lands on /onboarding

- **WHEN** a `role = 'owner'` user completes signup or login
- **THEN** the server action returns a redirect to `/onboarding`

#### Scenario: Superadmin lands on /admin

- **WHEN** a `role = 'superadmin'` user completes signup or login
- **THEN** the server action returns a redirect to `/admin`

#### Scenario: Redirect query param overrides default

- **WHEN** a user reaches `/login?redirect=/dashboard/products` and logs in successfully
- **THEN** the server action redirects them to `/dashboard/products` (a path their role allows) instead of the default for their role

### Requirement: Placeholder pages exist for /onboarding and /admin

The system SHALL provide minimal pages at `/onboarding` and `/admin` that confirm the user is authenticated and routed correctly. These pages SHALL display the logged-in user's email, a "coming soon" message, and a logout button.

#### Scenario: /onboarding shows placeholder for owner

- **WHEN** a logged-in `owner` user requests `/onboarding`
- **THEN** the page renders showing their email, a message explaining the dashboard is being built, and a working logout button

#### Scenario: /admin shows placeholder for superadmin

- **WHEN** a logged-in `superadmin` requests `/admin`
- **THEN** the page renders showing their email, a "coming soon" message about whitelist management, and a working logout button
