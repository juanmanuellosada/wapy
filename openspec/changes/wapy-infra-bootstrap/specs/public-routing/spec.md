## ADDED Requirements

### Requirement: Reserved slugs are stored in a table and seeded with system routes

The system SHALL maintain a `reserved_slugs` table whose rows enumerate strings that cannot be used as store slugs. The table SHALL be seeded with the set of routes the application uses or reserves for future use: `admin`, `api`, `dashboard`, `signup`, `login`, `logout`, `onboarding`, `forgot-password`, `reset-password`, `settings`, `account`, `billing`, `help`, `support`, `terms`, `privacy`, `about`, `pricing`, `contact`, `static`, `_next`, `favicon.ico`, `robots.txt`, `sitemap.xml`, `apple-icon`, `icon`, `manifest.json`, `wapy`, `app`, `auth`, `public`, plus Spanish equivalents `panel`, `tienda`, `tiendas`, `ingresar`, `registro`, `cuenta`, `ayuda`, `terminos`, `privacidad`, `nosotros`, `precios`, `contacto`.

#### Scenario: Reserved slug list is queryable

- **WHEN** any client reads `reserved_slugs`
- **THEN** the seeded list (including Spanish equivalents) is present

#### Scenario: Superadmin can add a new reserved slug

- **WHEN** a superadmin inserts a new row into `reserved_slugs` (e.g., as a future feature adds a new top-level route)
- **THEN** the insert succeeds and subsequent store insert/update attempts with that slug are rejected

#### Scenario: Owners cannot modify the reserved slug list

- **WHEN** an authenticated owner attempts to INSERT, UPDATE, or DELETE on `reserved_slugs`
- **THEN** RLS policies reject the operation

### Requirement: Slug format is enforced via regex CHECK constraint

The system SHALL enforce that every `stores.slug` matches the regex `^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$`. This guarantees: lowercase only, alphanumeric + dashes, no leading or trailing dash, length 1–32.

#### Scenario: Valid slug is accepted

- **WHEN** a store is inserted with `slug = 'mi-tienda-1'`
- **THEN** the insert succeeds

#### Scenario: Slug with uppercase is rejected

- **WHEN** a store is inserted with `slug = 'MiTienda'`
- **THEN** the database rejects the insert with a CHECK constraint violation

#### Scenario: Slug with leading dash is rejected

- **WHEN** a store is inserted with `slug = '-tienda'`
- **THEN** the database rejects the insert with a CHECK constraint violation

#### Scenario: Slug longer than 32 characters is rejected

- **WHEN** a store is inserted with a 33-character slug
- **THEN** the database rejects the insert with a CHECK constraint violation

### Requirement: Slug rename produces a permanent redirect record

The system SHALL automatically insert a row into `slug_history` whenever a store's `slug` column is updated. The application-level routing layer (delivered in Fase 6) SHALL use `slug_history` to issue HTTP 301 redirects from old slugs to the current slug.

#### Scenario: Update creates history row

- **WHEN** a store's `slug` is changed from `'tienda-vieja'` to `'tienda-nueva'`
- **THEN** a `slug_history` row exists with `old_slug = 'tienda-vieja'` and `store_id` matching that store

#### Scenario: Lookup prefers current slug over historical match

- **WHEN** a freshly-created store claims a slug that previously belonged to a different (now retired) store, and a request arrives for that slug
- **THEN** the routing layer resolves to the current store (per the lookup order: `stores.slug` checked before `slug_history.old_slug`)

#### Scenario: History rows have no expiration

- **WHEN** time passes after a slug rename
- **THEN** the `slug_history` row persists indefinitely (no TTL/cleanup job)

### Requirement: Anonymous clients can read slug history for redirect resolution

The system SHALL allow anonymous clients to SELECT from `slug_history`. This is required for the public route handler to resolve historical slugs without an authenticated session.

#### Scenario: Anon read of slug history succeeds

- **WHEN** an anonymous client queries `slug_history` by `old_slug`
- **THEN** the matching row (or empty result) is returned

#### Scenario: Anon cannot write to slug history

- **WHEN** an anonymous client attempts to INSERT, UPDATE, or DELETE on `slug_history`
- **THEN** RLS policies reject the operation
