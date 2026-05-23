## Context

Wapy is a Next.js App Router app deployed on Vercel. Today it serves a marketing landing and a single hardcoded demo store at `/store/[slug]`. This change provisions the production data + storage + mail layer that the next five phases (auth, onboarding, panels, etc.) will build on. The Supabase project is already created (`wapy` in org `Juanma's`, ref `gtiujuarwoatjekmljhn`, region sa-east-1, Postgres 17, Pro tier) and the MCP can apply migrations directly. The domain `wapy.com.ar` is purchased at NIC.ar but DNS is not yet pointed at Vercel — this design accounts for that (no production deploy is required for this change to be considered done).

## Goals / Non-Goals

**Goals**

- Stand up a Postgres schema that supports the entire MVP (whitelist signup → onboarding → published storefront), with RLS active on every table.
- Make the DB the source of truth for slug uniqueness *and* reserved-word blocking, so app code can rely on a constraint violation rather than re-validating in TypeScript.
- Bridge `auth.users` (Supabase Auth) to a `public.users` row automatically, with role granted from a whitelist hint — so the seed superadmin Just Works on first login.
- Wire Supabase + Resend clients into the Next.js app with safe-default getters (don't crash on import; throw on missing env only when called).
- Cut the landing → demo-store link so marketing stops promising what the product doesn't yet do.
- Leave the `/store/[slug]` demo route alive and untouched for now — its replacement comes in Fase 6.

**Non-Goals**

- Signup/login UI, password reset, session management → Fase 2.
- Whitelist management UI → Fase 3.
- Onboarding wizard, store/product CRUD UI → Fase 4-5.
- Public storefront migration from `/store/[slug]` to `/[slug]` → Fase 6.
- DNS configuration on NIC.ar, Vercel domain attachment, Resend domain verification → out of code scope; user does these in respective dashboards.
- Vercel env var sync via CLI (`vercel env push`) → documented as manual user step. Reason: requires user to be logged into Vercel CLI, which is not installed.
- Test framework setup → tracked as a TODO; would expand scope unnecessarily here.

## Decisions

### 1. Schema in `public` schema, RLS on every table

We use the default `public` schema rather than a custom `wapy` schema. Supabase Studio, Data API auto-generation, and CLI tooling all assume `public`; using a custom schema fights the platform without a benefit here (this DB only hosts Wapy). Every table gets `enable row level security` immediately after creation. Tables without policies become effectively read-only for the anon role, which is the safe default until policies are defined.

**Alternative considered**: separate `wapy` schema for app tables. Rejected — adds Data API config friction, Supabase advisors would warn, and we don't expect another product in this DB (the user pays for an isolated project precisely so this stays single-tenant at the platform level).

### 2. Auth bridge: trigger on `auth.users` → `public.users`, role from whitelist

When `auth.users` gets a new row (signup), a security-definer trigger function `handle_new_user()` inserts into `public.users` with `role = coalesce(whitelist.grant_role, 'owner')`. This means:

- The whitelist is the single place that controls who can sign up *and* what role they get.
- The seed superadmin (`juanmalosada01@gmail.com` with `grant_role='superadmin'`) is granted on first login with no manual intervention.
- Future invites default to `grant_role='owner'`, which is what the whitelist UI will write in Fase 3.

**Alternative considered**: env var `SUPERADMIN_EMAILS` checked at runtime in app code. Rejected — duplicates source of truth, requires env redeploy to add admins, and breaks if a superadmin's session predates the env change. The DB trigger approach is more uniform and survives forever.

**Alternative considered**: separate `superadmins` table. Rejected — one boolean check column on `users` is simpler and RLS policies read cleanly as `users.role = 'superadmin'`.

### 3. Slugs: app-readable regex + DB-enforced reserved list

Slug validation happens twice on purpose:

- **App-side** (later phases): friendly error messages, autocomplete, real-time uniqueness check.
- **DB-side** (this phase): `CHECK` constraint with regex `^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$` + a trigger that rejects values in `reserved_slugs` table. The constraint is the last line of defense — even if app code is bypassed (direct SQL, future admin tools), no store can claim a reserved slug.

We model reserved slugs as a *table* (`reserved_slugs`) not an enum or hard-coded array, so the superadmin can add new reserved words later (Fase 3) without a migration. The table is seeded in this change with the routing surface area.

**Trade-off**: this adds a lookup on every store insert/update. Acceptable — store writes are rare (onboarding once, slug changes maybe once a year). The cost is dwarfed by the index lookup that already happens for uniqueness.

### 4. Slug renames: history table + future Routing Middleware lookup

When an owner changes their slug (Fase 5), we insert the old slug into `slug_history` and update the store. The public route handler (Fase 6) will: if requested path is not a current store slug, look it up in `slug_history` and return a 301 redirect to the current slug. We store no expiry — historical slugs are permanent redirects so external links never break.

**Alternative considered**: TTL on `slug_history` rows (e.g., 90 days). Rejected — surprise 404s from old WhatsApp shares is worse than carrying a tiny table forever. If the table grows too large in years, we add an expiry policy then.

**Conflict resolution**: if owner A retires slug `x` and later owner B tries to claim `x`, B's `stores.slug` insert will succeed (uniqueness is only against currently-active store slugs) *but* the `slug_history` row for A still resolves `x → A`. We resolve this by having the public route check current `stores.slug` FIRST, then `slug_history`. So a freshly-claimed slug always wins over a historical one. We document this in the `public-routing` spec.

### 5. Storage layout: `{bucket}/{store_id}/{filename}`

Both buckets (`product-images`, `store-logos`) prefix every object with the owning `store_id`. RLS write policy: `auth.uid()` must match the `owner_id` of the store whose `id` matches the first path segment. Public read is allowed on both buckets (storefronts are public). Filenames: UUIDs for product images (multiple per product), fixed name `logo.{ext}` for the store logo (overwrite on re-upload).

**Alternative considered**: scope by `owner_id` (`{owner_id}/{store_id}/...`). Rejected — `store_id` is enough and shorter. When 1→N (multi-store, post-MVP) is ever needed, the path doesn't have to change.

**Alternative considered**: Vercel Blob. Rejected up-front (see project decisions) — would split storage off Supabase's RLS model and add a separate billing line.

### 6. Resend integration: thin helper, lazy client init

`lib/resend.ts` exports `sendInviteEmail({ to, token, inviteUrl })` and a few future helpers. The Resend client is constructed inside the function (lazy) so importing the module doesn't crash when `RESEND_API_KEY` is missing during local dev or build. We use a simple HTML template inline for the invite email in this phase; a templating system can come later if we add more transactional mails.

**From-address**: `Wapy <hola@wapy.com.ar>`. Domain verification in Resend is a manual user step — *not done in this change*. The code is wired but won't actually send until the domain is verified. We surface this clearly in the README/env doc.

### 7. Migration ordering: one file per concern, applied via MCP

Migrations live in `supabase/migrations/<timestamp>_<description>.sql`. Order:

1. `<ts>_extensions.sql` — enable `pgcrypto` for `gen_random_uuid()`.
2. `<ts>_users.sql` — `public.users` table + RLS + `handle_new_user` trigger on `auth.users`.
3. `<ts>_whitelist.sql` — table + RLS + `whitelist_check_email()` function.
4. `<ts>_reserved_slugs.sql` — table + seed + RLS (read-only public, superadmin write).
5. `<ts>_stores.sql` — table + RLS + slug constraint + reserved-slug trigger.
6. `<ts>_sections_products.sql` — both tables + RLS (read-public-when-published, owner CRUD).
7. `<ts>_slug_history.sql` — table + RLS + update trigger on `stores` (auto-archive old slug on rename).
8. `<ts>_storage_buckets.sql` — create buckets + policies.
9. `<ts>_updated_at_trigger.sql` — generic `set_updated_at()` function + attach to every relevant table.
10. `<ts>_seed_superadmin.sql` — insert `juanmalosada01@gmail.com` into whitelist with `grant_role='superadmin'`. Idempotent (`on conflict do nothing`).

Each migration is independently committable. The executor applies them via Supabase MCP `apply_migration`, with the MCP-side dry-run output reviewed before each apply.

### 8. Service role key is server-only, never bundled

`lib/supabase/server.ts` is the only file that touches `SUPABASE_SERVICE_ROLE_KEY`. It's a Server Component / Route Handler import. The browser client (`lib/supabase/client.ts`) only sees `NEXT_PUBLIC_SUPABASE_ANON_KEY`. ESLint or a runtime check could enforce this, but for now we rely on file naming + code review — Next.js will throw at build time if you import a server file from a client component.

### 9. Vercel env vars: documented, not pushed

`design.md` (this doc) and `.env.local.example` list the four secrets the user must set in Vercel (Production + Preview). We do not run `vercel env add` from this session because the CLI isn't installed and the user explicitly hasn't set up that flow. The first executor run will surface a clear runtime error if a var is missing.

| Var | Where to find it | Scope |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → wapy → Settings → API → Project URL | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page → Project API keys → `anon public` | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → Project API keys → `service_role` (**never expose**) | Server only |
| `RESEND_API_KEY` | Resend dashboard → API Keys | Server only |
| `NEXT_PUBLIC_APP_URL` | `https://wapy.com.ar` (prod) / preview URL / `http://localhost:3000` (dev) | Public |

For local dev, the user copies `.env.local.example` to `.env.local` and fills in. For Vercel, the user pastes via dashboard.

## Risks / Trade-offs

- **Risk**: Migration applied to prod DB cannot be trivially rolled back if a CHECK constraint rejects existing data. → **Mitigation**: There is no existing data yet (DB is fresh). Future migrations on populated tables need rollback scripts; out of scope here.
- **Risk**: Resend domain not verified yet — sending will fail silently in Fase 2 if not done. → **Mitigation**: Add a startup log warning when `RESEND_API_KEY` is set but no successful test send has been recorded; document the verification steps in the README and in this design.
- **Risk**: Reserved slug list is incomplete — adding routes in later phases could collide. → **Mitigation**: Every new top-level route added in subsequent phases requires a corresponding row in `reserved_slugs`. Make this explicit in the project's CONTRIBUTING / AGENTS notes.
- **Risk**: Public anon read on `stores`, `sections`, `products`, `slug_history` is the platform's largest attack surface. → **Mitigation**: All policies filter on `status = 'published'` and `is_active = true`. RLS is auditable. Supabase advisors will flag any missing policies on next run.
- **Risk**: `handle_new_user` trigger fires inside Supabase Auth's transaction; if it errors the whole signup fails. → **Mitigation**: Trigger uses `coalesce` and explicit error handling, never references missing whitelist as a hard error (it'd be checked separately by the signup flow in Fase 2).
- **Trade-off**: Schema is verbose (6 tables) for an MVP. → **Acceptable**: each table maps cleanly to a user-facing concept and avoids JSON-blob anti-patterns. No table is speculative.
- **Trade-off**: `image_urls text[]` on products vs separate `product_images` table. Chose array for simplicity; max ~10 images per product, no metadata per image needed yet. If we need alt text / ordering metadata later, we migrate to a child table.

## Migration Plan

This is a forward-only setup. There's no existing schema or data to migrate.

**Apply order** (each step verified before next):

1. Apply all 10 migrations via Supabase MCP `apply_migration`, one at a time.
2. After each migration: `list_tables` to confirm the table exists; `get_advisors` to verify RLS is enabled and no security warnings appear.
3. Generate TS types: MCP `generate_typescript_types` → writes `lib/supabase/types.ts`.
4. Install npm deps; ensure `next build` passes.
5. Write `lib/supabase/{client,server}.ts` and `lib/resend.ts`; `next build` still passes.
6. Surgically edit landing components: remove the "ver tienda demo" CTA. Run `next dev` and confirm landing renders without it; confirm `/store/[slug]` route still works (we didn't break it).
7. Commit, open PR against `main`. Vercel will build a Preview — the user verifies it visually.

**Rollback strategy**

- DB: if a migration breaks something, run a reverse migration. No data loss possible — DB is empty.
- Code: PR-level revert.
- Resend: nothing to roll back; we only added wiring, didn't send anything.

## Open Questions

- **Should `reserved_slugs` include localized variations?** (e.g., `panel`, `tienda`, `tiendas`). Recommendation: yes, add Spanish equivalents in the seed. Will include in the migration unless the user objects.
- **Should `image_urls` cap be enforced at DB level?** Recommendation: yes, add `CHECK (array_length(image_urls, 1) <= 10)` to keep blob storage costs predictable.
- **Should the `whitelist_check_email` function return more than a boolean?** Could return `(allowed boolean, invite_token text)` so the signup form can prefill from the token in a magic link. Recommendation: yes, but the design accommodates this without spec changes — it's a Fase 2 detail.
