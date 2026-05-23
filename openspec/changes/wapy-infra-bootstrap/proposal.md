## Why

Wapy is transitioning from a static landing + hardcoded demo store to a real multi-tenant SaaS: store owners sign up, build their store via an onboarding wizard, and publish at `wapy.com.ar/[slug]` where the checkout button opens a pre-filled WhatsApp message to the owner. Before any of the user-facing flows (auth, onboarding, panels, public storefront) can be built, the platform needs its production data layer, file storage, and transactional mail wired up. This change establishes that foundation so the next five phases have a solid base to build on, and it severs the landing page's dependency on the hardcoded demo store so we stop signaling a fake product.

## What Changes

- **Provision the production data model in Supabase** (project ref `gtiujuarwoatjekmljhn`, region sa-east-1): tables `users`, `whitelist`, `stores`, `sections`, `products`, `slug_history`.
- **Lock down access with Row Level Security** on every table from day one — public anon reads only published-store data, owners see only their own data, superadmins see all.
- **Enforce slug discipline at the DB level**: lowercased, regex-validated, reserved-word blocklist to prevent collisions with system routes (`admin`, `dashboard`, `api`, etc.) once stores live at the URL root.
- **Add Supabase Auth-to-public-users bridge**: trigger that creates a `public.users` row when `auth.users` gets a new row, reading `grant_role` from the whitelist to promote the seed superadmin automatically on first login.
- **Create Storage buckets** `product-images` and `store-logos` with RLS-scoped write policies (each owner can only write under their own `store_id` prefix).
- **Wire the app to Supabase and Resend**: `@supabase/supabase-js` + `@supabase/ssr` clients (browser + server), `resend` SDK with a `sendInviteEmail()` helper, generated TS types, and a documented `.env.local.example`.
- **Remove the landing's CTA to the demo store** — keep the `/store/[slug]` route alive (Fase 6 will delete it), but stop linking to it from the landing so the marketing surface no longer points users at a fake product.
- **Seed the superadmin invite**: insert `juanmalosada01@gmail.com` into `whitelist` with `grant_role='superadmin'` so the role is granted on first signup (in Fase 2).

**Not in this change**: signup/login UI, onboarding wizard, owner panel, superadmin panel, deletion of the hardcoded demo, DNS for `wapy.com.ar`. Vercel env vars are *documented* here for the user to apply manually, not pushed by automation.

## Capabilities

### New Capabilities
- `data-model`: Core Postgres schema for owners, stores, sections, products, whitelist, and slug history — with RLS policies, indexes, triggers, and the reserved-slug constraint.
- `auth-foundation`: The `users` table + `role` column + `handle_new_user` trigger that bridges Supabase Auth to application identity. **Does not** include signup/login flows (Fase 2 owns those).
- `mail-transport`: Resend client configuration and the `sendInviteEmail` helper used by future whitelist-invite flows. From-address `Wapy <hola@wapy.com.ar>`.
- `public-routing`: The rules that govern which path strings can become a store slug — reserved word list, format regex, history-based 301 redirects on rename. Routing implementation comes in Fase 6; this capability documents the contract.
- `file-storage`: Supabase Storage buckets for product images and store logos, with per-owner write policies scoped to their `store_id` prefix.

### Modified Capabilities

None. This is the foundational change — no specs exist yet.

## Impact

- **New deps** in `package.json`: `@supabase/supabase-js`, `@supabase/ssr`, `resend`, `zod`.
- **New code**: `lib/supabase/{client,server,types}.ts`, `lib/resend.ts`, `.env.local.example`, `supabase/migrations/*.sql`.
- **Modified code**: landing page components (surgical removal of the demo CTA only — no visual redesign).
- **Untouched**: `app/store/[slug]/*`, `lib/stores.ts`, all existing styling. Fase 6 will retire these.
- **External systems**: Supabase project `wapy` (DB + Storage), Resend (no domain verification yet — that's a manual user task, but the code is ready). Vercel env vars need to be set manually by the user before deploys after this change merges.
- **Data**: one seed row in `whitelist`. No user data exists yet (no auth flows).
- **Security**: every public-facing query goes through RLS. Service role key is server-only. No table is exposed without policies.
