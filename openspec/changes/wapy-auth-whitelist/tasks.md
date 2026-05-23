## 1. DB migration

- [x] 1.1 Write `supabase/migrations/013_revoke_whitelist_check.sql` with `REVOKE EXECUTE ON FUNCTION public.whitelist_check_email(text) FROM anon, authenticated, public;`.
- [x] 1.2 Apply via Supabase MCP `apply_migration` (project ref `gtiujuarwoatjekmljhn`).
- [x] 1.3 Run `mcp__claude_ai_Supabase__get_advisors --type security` and confirm the `whitelist_check_email` warnings (both `anon_security_definer_function_executable` and `authenticated_security_definer_function_executable`) are gone.

## 2. Shared validation + schemas

- [x] 2.1 Create `lib/auth/schemas.ts` exporting zod schemas: `signupSchema` ({ email, password ≥ 8 chars, optional token }), `loginSchema`, `forgotPasswordSchema`, `resetPasswordSchema`. Exports inferred TS types.
- [x] 2.2 Create `lib/auth/validation.ts` exporting `validateWhitelistSignup({ email, token? })` that uses the admin client (from `lib/supabase/server.ts`) to query `whitelist` and returns one of `{ ok: true, grant_role }`, `{ error: 'not_whitelisted' }`, `{ error: 'expired' }`, `{ error: 'already_registered' }`, `{ error: 'invalid_token' }`. Includes 7-day TTL check against `invited_at`.

## 3. Server actions

- [x] 3.1 Create `lib/auth/actions.ts` with `'use server'` directive at top. Implement:
  - `signupAction(formData)`: re-parses with `signupSchema`, calls `validateWhitelistSignup`, on success calls `supabase.auth.signUp()` with email/password and returns redirect based on role.
  - `loginAction(formData)`: re-parses with `loginSchema`, calls `supabase.auth.signInWithPassword()`, on success looks up `public.users.role` and returns redirect.
  - `forgotPasswordAction(formData)`: calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: NEXT_PUBLIC_APP_URL + '/reset-password' })`. Always returns generic success.
  - `resetPasswordAction(formData)`: calls `supabase.auth.updateUser({ password })`, redirects by role.
- [x] 3.2 Each action handles errors gracefully — never throws raw Supabase errors to user. Wrap in try/catch and return `{ error: 'message' }`.

## 4. Logout route handler

- [x] 4.1 Create `app/api/auth/logout/route.ts` exporting a `POST` handler that calls `supabase.auth.signOut()` and returns `NextResponse.redirect(new URL('/', request.url))`.

## 5. Middleware

- [x] 5.1 Auth protection integrated into `proxy.ts` (Next.js 16 uses proxy.ts instead of middleware.ts — they cannot coexist). Uses `@supabase/ssr`'s `createServerClient` to refresh cookies. Protected prefixes: `/onboarding`, `/dashboard`, `/admin`.
- [x] 5.2 For each matched request: if no session → redirect to `/login?redirect=<path>`. If session exists and path starts with `/admin` → fetch `users.role` and redirect to `/onboarding` if not superadmin.
- [x] 5.3 Protected prefixes documented in `PROTECTED_PREFIXES` constant in `proxy.ts` so future phases know where to add new routes.

## 6. Auth pages (use `ui-ux-pro-max` skill)

- [x] 6.1 Create `app/(auth)/layout.tsx` — minimal layout for auth pages: centered card, Wapy logo top, no navbar. Consistent with landing palette (navy/crema/amarillo, Agbalumo for logo, body fonts from existing landing).
- [x] 6.2 Create `app/(auth)/signup/page.tsx`:
  - Reads optional `?token=` from `searchParams`.
  - Form with email (prefilled + readonly if token present) + password + confirm-password.
  - Client validation with `react-hook-form` + `signupSchema`.
  - Submit calls `signupAction`. Shows specific error per `error` code returned.
  - Footer link "Ya tenés cuenta? Entrar".
- [x] 6.3 Create `app/(auth)/login/page.tsx`:
  - Form with email + password.
  - Reads `?redirect=` to honor post-login destination.
  - Generic error on wrong creds.
  - Footer links: "¿Olvidaste tu password?" + "¿Te invitaron? Registrate".
- [x] 6.4 Create `app/(auth)/forgot-password/page.tsx`: form with email. Always shows generic success message after submit ("Si existe una cuenta...").
- [x] 6.5 Create `app/(auth)/reset-password/page.tsx`: client component that reads the Supabase recovery session from URL hash on mount, shows form with new password + confirm. On submit calls `resetPasswordAction`. Error states for invalid/expired token.

## 7. Placeholder destinations

- [x] 7.1 Create `app/onboarding/page.tsx`: server component. Reads session, displays user email + a friendly "Pronto vas a poder armar tu tienda acá" + logout button (form POSTing to `/api/auth/logout`).
- [x] 7.2 Create `app/admin/page.tsx`: server component. Same shape as `/onboarding` but message about whitelist management coming in Fase 3.

## 8. Supabase Auth manual settings (MUST be done before smoke test)

- [ ] 8.1 In Supabase dashboard → Auth → Sign In / Up settings → **disable "Confirm email"**.
- [ ] 8.2 In Auth → URL Configuration → Redirect URLs → add `https://wapy.com.ar/reset-password` and `http://localhost:3000/reset-password`.
- [ ] 8.3 In Auth → URL Configuration → Site URL → ensure it's `https://wapy.com.ar` (not the .vercel.app default).

## 9. Smoke test (local)

- [ ] 9.1 `npm run dev`. Visit `/signup`. Submit with `juanmalosada01@gmail.com` + a new password (≥8 chars). Verify redirect to `/admin` (because the seeded grant_role is `superadmin`).
- [ ] 9.2 Click logout. Verify redirect to `/`.
- [ ] 9.3 Visit `/login`. Same email + password. Verify redirect to `/admin`.
- [ ] 9.4 Manually deactivate `registered_at` for the row (via Supabase Studio) and re-try signup — confirm `already_registered` error appears.
- [ ] 9.5 Re-set `registered_at` to null and `invited_at` to 8 days ago — confirm `expired` error.
- [ ] 9.6 Visit `/admin` while logged out — confirm redirect to `/login?redirect=/admin`.
- [ ] 9.7 Sign up a second test email (insert manually into whitelist with `grant_role='owner'`), confirm post-login goes to `/onboarding`, and that `/admin` redirects them to `/onboarding`.
- [ ] 9.8 `/forgot-password` with the test email → verify mail arrives → click link → set new password → confirm login.

## 10. Verification + cleanup

- [x] 10.1 `npm run build` — passes cleanly (0 TypeScript errors, all 10 routes generated).
- [ ] 10.2 Run `get_advisors --type security` once more — only the expected zero warnings from Fase 1+2 should remain.
- [ ] 10.3 Verify the new test user(s) created during smoke test exist in `public.users` with the correct role (via `execute_sql`).

## 11. Commits & PR

- [x] 11.1 Commit 1: `Add whitelist+TTL signup validation and revoke whitelist_check_email RPC` (migration 013 + `lib/auth/validation.ts` + `lib/auth/schemas.ts`).
- [x] 11.2 Commit 2: `Add Supabase Auth flows: signup, login, logout, password reset` (server actions, logout route, all auth pages).
- [x] 11.3 Commit 3: `Add session protection and placeholder destinations via proxy.ts` (`proxy.ts` updated, `/onboarding`, `/admin`).
- [x] 11.4 Update `openspec/changes/wapy-auth-whitelist/tasks.md` marking all completed; commit it.
- [ ] 11.5 Push branch `feat/wapy-auth-whitelist` to origin.
- [ ] 11.6 Open PR against `main` (or against `feat/wapy-infra-bootstrap` if Fase 1 is still unmerged at that point — base will need to be updated after Fase 1 merges).
