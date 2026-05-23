## ADDED Requirements

### Requirement: Role column distinguishes owners from superadmins

The system SHALL distinguish two application roles, `'owner'` and `'superadmin'`, stored in `public.users.role`. The role determines what data a user can read or modify via RLS policies. The role is set on first login from the whitelist's `grant_role` and is not user-editable.

#### Scenario: Default role is owner

- **WHEN** a user registers without a `grant_role` override in the whitelist
- **THEN** their `public.users.role` is `'owner'`

#### Scenario: Seeded superadmin gets superadmin role on first login

- **WHEN** a user whose email appears in the whitelist with `grant_role = 'superadmin'` registers
- **THEN** their `public.users.role` is set to `'superadmin'` on row creation

#### Scenario: User cannot change their own role

- **WHEN** an authenticated user attempts to UPDATE their own `public.users` row to change `role`
- **THEN** the RLS policy rejects the update (only superadmin policies can modify the `role` column)

### Requirement: handle_new_user trigger bridges Supabase Auth to application identity

The system SHALL provide a `handle_new_user()` PL/pgSQL function attached as an AFTER INSERT trigger on `auth.users`. The function SHALL be `SECURITY DEFINER` so it can write to `public.users` regardless of the inserting session's privileges. It SHALL look up the user's email in `whitelist` to determine the role to grant.

#### Scenario: New auth user with whitelisted email gets correct role

- **WHEN** Supabase Auth inserts a new `auth.users` row for an email whose whitelist row has `grant_role = 'superadmin'`
- **THEN** `public.users` receives a new row with that user's `id`, `email`, and `role = 'superadmin'`

#### Scenario: New auth user without whitelist entry still gets a public.users row

- **WHEN** Supabase Auth inserts a new `auth.users` row for an email not in the whitelist (this should not happen in production because Fase 2 enforces whitelist at signup, but the trigger is defensive)
- **THEN** `public.users` still receives a row with `role = 'owner'` so RLS policies have a consistent identity to reference

#### Scenario: Trigger failure does not silently corrupt state

- **WHEN** the trigger encounters an unexpected error (e.g., a NULL email)
- **THEN** the trigger raises an exception, aborting the `auth.users` insert transaction so no orphaned auth record is created

### Requirement: Service role key is never exposed to the browser

The system SHALL keep `SUPABASE_SERVICE_ROLE_KEY` server-only. The browser Supabase client SHALL be instantiated only with the anon key. Any code that needs service-role access SHALL run in Route Handlers, Server Components, or Server Actions.

#### Scenario: Browser client uses anon key

- **WHEN** code in a Client Component imports the Supabase client
- **THEN** the client is initialized with `NEXT_PUBLIC_SUPABASE_ANON_KEY` only

#### Scenario: Server client can elevate to service role when needed

- **WHEN** server-only code imports the server Supabase helper with `{ admin: true }`
- **THEN** the returned client uses `SUPABASE_SERVICE_ROLE_KEY` and bypasses RLS

#### Scenario: Importing the server helper from a Client Component fails at build

- **WHEN** a Client Component imports `lib/supabase/server.ts`
- **THEN** Next.js refuses to build, surfacing a clear error about server-only modules
