## ADDED Requirements

### Requirement: Users table mirrors auth.users with application role

The system SHALL maintain a `public.users` table that holds the application-level identity for every authenticated Supabase Auth user. The table SHALL include a `role` column constrained to the values `'owner'` or `'superadmin'`, defaulting to `'owner'`. A `public.users` row MUST be created exactly once for each `auth.users` row, with the same `id`.

#### Scenario: New auth user creates a public.users row

- **WHEN** a new row is inserted into `auth.users` (Supabase Auth signup)
- **THEN** a row in `public.users` is created with the same `id`, the same `email`, and `role` set to the `grant_role` value from the matching whitelist row, or `'owner'` if no whitelist row exists

#### Scenario: Role values are constrained

- **WHEN** any process attempts to insert or update a `public.users` row with `role` not in `('owner', 'superadmin')`
- **THEN** the database rejects the operation with a CHECK constraint violation

#### Scenario: Email uniqueness

- **WHEN** a duplicate email is inserted into `public.users`
- **THEN** the database rejects the operation with a unique constraint violation

### Requirement: Whitelist gates registration and carries role grants

The system SHALL maintain a `whitelist` table of email addresses that are permitted to register. Each row SHALL carry a `grant_role` value (`'owner'` by default, `'superadmin'` for seeded admins), an `invite_token`, and timestamps for `invited_at` and `registered_at`. The whitelist is the single source of truth for both "can this email sign up" and "what role do they get on first login".

#### Scenario: Email is case-insensitive unique

- **WHEN** a row with email `User@Example.com` exists and a row with `user@example.com` is inserted
- **THEN** the database rejects the second insert (emails are stored lowercased or via citext)

#### Scenario: Default grant_role is owner

- **WHEN** a row is inserted into `whitelist` without specifying `grant_role`
- **THEN** the row is created with `grant_role = 'owner'`

#### Scenario: Public function checks email without exposing the table

- **WHEN** an anonymous client calls `whitelist_check_email(email)` with an email
- **THEN** the function returns whether the email is on the whitelist, without the client being able to SELECT from the whitelist table directly

### Requirement: Stores table enforces 1:1 with owners and slug discipline

The system SHALL maintain a `stores` table where each row represents a single store owned by exactly one `public.users` row. `owner_id` SHALL be UNIQUE. The `slug` column SHALL be unique among current stores, match the regex `^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$`, and not appear in the `reserved_slugs` table. `status` SHALL be one of `'draft' | 'published' | 'paused'`. The table SHALL track `onboarding_step`, `published_at`, `whatsapp_number`, `logo_url`, and a JSON `theme` column.

#### Scenario: Owner can only have one store

- **WHEN** a user with an existing store attempts to insert a second store with the same `owner_id`
- **THEN** the database rejects the operation with a unique constraint violation

#### Scenario: Reserved slug is rejected

- **WHEN** an attempt is made to insert or update a store with `slug = 'admin'`
- **THEN** the database raises an error indicating the slug is reserved

#### Scenario: Malformed slug is rejected

- **WHEN** an attempt is made to insert a store with `slug = 'My Store!'` or `slug = '-leading-dash'`
- **THEN** the database rejects the operation with a CHECK constraint violation

#### Scenario: Status transitions allowed by application, constrained by DB

- **WHEN** any process sets `status` to a value other than `'draft'`, `'published'`, or `'paused'`
- **THEN** the database rejects the operation with a CHECK constraint violation

### Requirement: Sections and products belong to a store

The system SHALL maintain `sections` and `products` tables linked to a `stores` row via `store_id` with `ON DELETE CASCADE`. `products` MAY optionally reference a `section_id` via `ON DELETE SET NULL`. `products.price_cents` SHALL be a non-negative integer; `products.currency` SHALL default to `'ARS'`. `products.stock` MAY be NULL (interpreted as unlimited).

#### Scenario: Deleting a store cascades

- **WHEN** a `stores` row is deleted
- **THEN** all `sections` and `products` rows with matching `store_id` are also deleted

#### Scenario: Deleting a section preserves products

- **WHEN** a `sections` row is deleted
- **THEN** any `products` rows that referenced it now have `section_id = NULL` and remain in the table

#### Scenario: Negative prices rejected

- **WHEN** a product is inserted with `price_cents = -100`
- **THEN** the database rejects the operation with a CHECK constraint violation

#### Scenario: Section slug unique per store

- **WHEN** two sections in the same store attempt to share the same `slug`
- **THEN** the database rejects the second insert with a unique constraint violation

### Requirement: Slug history preserves retired slugs for redirects

The system SHALL maintain a `slug_history` table that records every slug ever used by a store. When a store's `slug` is updated, the old value SHALL be inserted into `slug_history` automatically (via trigger). Each `old_slug` value SHALL be globally unique across history.

#### Scenario: Renaming a store archives the old slug

- **WHEN** a store with `slug = 'old-name'` is updated to `slug = 'new-name'`
- **THEN** a row is inserted into `slug_history` with `old_slug = 'old-name'` and `changed_at = now()`

#### Scenario: Two stores cannot both retire the same slug

- **WHEN** store A retires slug `x` and store B later tries to retire its own slug `x`
- **THEN** the second archive operation fails (the public-routing capability defines how lookup conflicts resolve when this state cannot actually arise; this requirement is about the DB constraint)

### Requirement: Row Level Security is enabled on every table

The system SHALL enable Row Level Security on `users`, `whitelist`, `stores`, `sections`, `products`, `slug_history`, and `reserved_slugs`. The default deny applies to all roles; access is granted only through explicit policies.

#### Scenario: Anonymous read of unpublished store is blocked

- **WHEN** an anonymous client queries `stores` where `status = 'draft'`
- **THEN** zero rows are returned regardless of how many drafts exist

#### Scenario: Owner cannot read another owner's store

- **WHEN** owner A (authenticated) queries `stores`
- **THEN** the result contains only the row where `owner_id = auth.uid()`

#### Scenario: Superadmin can read all stores

- **WHEN** a superadmin (`public.users.role = 'superadmin'`) queries `stores`
- **THEN** all rows are returned regardless of status or owner
