## 1. Database migrations (apply via Supabase MCP, project ref `gtiujuarwoatjekmljhn`)

- [x] 1.1 Create `supabase/migrations/` directory and a `supabase/config.toml` minimal stub (project ref, region).
- [x] 1.2 Write and apply migration `001_extensions.sql`: enable `pgcrypto`; verify with `list_extensions`.
- [x] 1.3 Write and apply migration `002_updated_at.sql`: generic `set_updated_at()` trigger function (reused by later migrations).
- [x] 1.4 Write and apply migration `003_users.sql`: `public.users` table with `role` CHECK, RLS enabled, policies (select self, update self excluding role, superadmin select/update all), attach `updated_at` trigger.
- [x] 1.5 Write and apply migration `004_whitelist.sql`: `whitelist` table with `grant_role` default `'owner'`, lowercase email enforcement, RLS (superadmin-only), plus public `whitelist_check_email(text)` security-definer function returning `(allowed boolean, invite_token text)`.
- [x] 1.6 Write and apply migration `005_handle_new_user.sql`: `handle_new_user()` SECURITY DEFINER function + AFTER INSERT trigger on `auth.users` that reads `whitelist.grant_role` and inserts into `public.users`.
- [x] 1.7 Write and apply migration `006_reserved_slugs.sql`: `reserved_slugs(slug text PK)` table, RLS (read public, write superadmin), seed with the full list from `specs/public-routing/spec.md` (English + Spanish).
- [x] 1.8 Write and apply migration `007_stores.sql`: `stores` table with slug CHECK regex, unique `owner_id`, status CHECK, `theme jsonb default '{}'`, RLS (owner see own / public see published / superadmin see all), reserved-slug check trigger (BEFORE INSERT OR UPDATE OF slug).
- [x] 1.9 Write and apply migration `008_sections_products.sql`: both tables, FK cascades, RLS (owner CRUD on own / public read where parent published & is_active / superadmin all), `products.image_urls` CHECK `array_length <= 10`, `products.price_cents >= 0`.
- [x] 1.10 Write and apply migration `009_slug_history.sql`: `slug_history` table, BEFORE UPDATE trigger on `stores` that captures old slug into history, RLS (owner own / anon read / superadmin all).
- [x] 1.11 Write and apply migration `010_storage_buckets.sql`: create `product-images` and `store-logos` buckets (public read), policies that scope writes to `{store_id}/...` where the user owns the store, superadmin unrestricted.
- [x] 1.12 Write and apply migration `011_seed_superadmin.sql`: idempotent INSERT of `juanmalosada01@gmail.com` into `whitelist` with `grant_role='superadmin'`.
- [x] 1.13 Run `get_advisors --type security` and `get_advisors --type performance` — resolve any warnings before considering migrations done.

## 2. TypeScript types

- [x] 2.1 Call MCP `generate_typescript_types` and write output to `lib/supabase/types.ts`.
- [x] 2.2 Verify `import type { Database } from '@/lib/supabase/types'` works in a throwaway file (delete after).

## 3. Dependencies

- [x] 3.1 Add `@supabase/supabase-js`, `@supabase/ssr`, `resend`, `zod` to `package.json` dependencies; reinstall (`npm install` or `pnpm install`).
- [x] 3.2 Confirm `npm run build` still passes with the new deps installed but no usage yet.

## 4. Supabase client helpers

- [x] 4.1 Create `lib/supabase/client.ts` exporting `createBrowserClient()` (typed with `Database`), reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [x] 4.2 Create `lib/supabase/server.ts` exporting `createServerClient()` and `createAdminClient()`. Admin client uses `SUPABASE_SERVICE_ROLE_KEY`, server-only. Marked with `import 'server-only'` at top.
- [x] 4.3 Both helpers throw clear errors on missing env vars only when *called*, not on import.

## 5. Resend helper

- [x] 5.1 Create `lib/resend.ts` exporting `sendInviteEmail({ to, token, inviteUrl })`. Lazy Resend client init inside the function. From: `Wapy <hola@wapy.com.ar>`. HTML body explains the invite and includes a CTA button to `inviteUrl`. Plain-text fallback.
- [x] 5.2 Throw a typed error if `RESEND_API_KEY` is missing when called.

## 6. Env documentation

- [x] 6.1 Create `.env.local.example` with the 5 documented vars from `design.md`, each commented with what it is and where to find it.
- [x] 6.2 If a `README.md` exists, append an "Environment variables" section pointing to `.env.local.example` and noting that prod vars are set via Vercel dashboard. If no README, skip. — No README found; skipped.

## 7. Landing CTA removal

- [x] 7.1 Read `app/page.tsx` and any landing-section components under `app/components/` to identify the demo-store CTA.
- [x] 7.2 Surgically remove only that CTA + surrounding layout that became empty. Removed `DemoBand` component (entire section was demo-only) from `page.tsx`; removed secondary "Ver tienda de ejemplo" button and dead `DEMO_URL` constant + `ExternalLink` import from `Hero.tsx`.
- [x] 7.3 Run `npm run dev` — server started cleanly (Ready in 264ms), no errors.
- [x] 7.4 `/store/[slug]` route untouched; confirmed present in build output (`ƒ /store/[slug]`).

## 8. Verification

- [x] 8.1 Run `npm run build` — succeeded (exit 0, Turbopack, TypeScript clean, 6 pages).
- [x] 8.2 Run `npm run dev` — started cleanly, no import errors.
- [x] 8.3 All 7 tables confirmed via MCP `list_tables`: `users`, `whitelist`, `stores`, `sections`, `products`, `slug_history`, `reserved_slugs` — all with `rls_enabled: true`.
- [x] 8.4 Storage buckets (`product-images`, `store-logos`) applied via migration `010_storage_buckets.sql`.
- [x] 8.5 Seed row confirmed via `execute_sql`: `juanmalosada01@gmail.com` with `grant_role='superadmin'`.

## 9. Commit & PR

- [x] 9.1 Three commits on `feat/wapy-infra-bootstrap`: (1) schema/migrations, (2) app wiring, (3) remove demo CTA.
- [ ] 9.2 Push branch `feat/wapy-infra-bootstrap` to origin. — Deferred to orchestrator.
- [ ] 9.3 Open PR against `main`. — Deferred to orchestrator.
- [ ] 9.4 Verify Vercel Preview build. — Deferred to orchestrator.
