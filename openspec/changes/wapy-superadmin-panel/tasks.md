## 1. Schemas and server actions

- [x] 1.1 Create `lib/admin/schemas.ts` with zod schema `addEmailSchema` ({ email, grant_role: 'owner' | 'superadmin' }). Export the inferred TS type.
- [x] 1.2 Create `lib/admin/actions.ts` with `'use server'`:
  - `requireSuperadmin()` helper that does session + role check, throws on failure.
  - `addWhitelistEntry(formData)`: re-parses with `addEmailSchema`, calls `requireSuperadmin`, INSERTs into `whitelist`, calls `sendInviteEmail`. Returns `{ ok: true, mail_sent: boolean, mail_error?: string }` or `{ error: 'duplicate' | 'validation' | ... }`.
  - `reinviteEntry({ id })`: guard, UPDATE invite_token + invited_at + return new token, call sendInviteEmail. Returns similar shape.
  - `removeWhitelistEntry({ id })`: guard, DELETE row by id. Returns `{ ok: true }`.
  - Each mutating action calls `revalidatePath('/admin')` on success.

## 2. UI components (`ui-ux-pro-max` style)

- [x] 2.1 Replace `app/admin/page.tsx` placeholder with real panel:
  - Server Component.
  - `requireSuperadmin` check at top (redirects if not — though middleware already handles, defense in depth).
  - Fetch whitelist via admin client, sorted by `invited_at DESC`.
  - Layout: header with "Wapy Admin" + logged-in email + logout button (form POST to `/api/auth/logout`).
  - Render `<AddEmailForm />` then `<WhitelistTable rows={...} />`.
- [x] 2.2 Create `app/admin/AddEmailForm.tsx` (Client Component):
  - `react-hook-form` + zod resolver with `addEmailSchema`.
  - Email input + role select (`owner` / `superadmin`).
  - Submit calls `addWhitelistEntry`.
  - Show inline feedback: success (with "mail sent" or "mail failed: ..." sub-message), validation errors, duplicate error.
- [x] 2.3 Create `app/admin/WhitelistTable.tsx` (Server Component, receives rows as prop):
  - Renders table with columns: email, role, status badge, invited_at (relative), registered_at (relative or "—"), actions.
  - Status derived in TS via helper `getStatus(row)` (`registered` | `expired` | `invited`).
  - Dates formatted with `Intl.RelativeTimeFormat` (es-AR locale).
  - Action column delegates to `<RowActions row={row} />`.
- [x] 2.4 Create `app/admin/RowActions.tsx` (Client Component):
  - "Re-invitar" button: visible only if `!registered_at`. Calls `reinviteEntry`, shows inline feedback.
  - "Quitar" button: shows `window.confirm(...)` with the email; on OK calls `removeWhitelistEntry`.
  - Disable buttons while pending; show error toast/inline if action fails.

## 3. Verification (no smoke test until step 4)

- [x] 3.1 `npm run build` — must pass.
- [ ] 3.2 `npm run dev` — visit `/admin` while logged out → expect redirect to /login. Login as superadmin → expect panel renders with the seeded `juanmalosada01@gmail.com` row showing status "Registrado".
- [x] 3.3 Confirm TypeScript types from `lib/supabase/types.ts` are used (no `any` for whitelist rows).

## 4. Smoke test (full happy-path)

- [ ] 4.1 Login as superadmin. Go to `/admin`. Confirm your own row shows status "Registrado".
- [ ] 4.2 Add `juanmalosada01+test@gmail.com` with role `owner`. Confirm new row appears with status "Invitado".
- [ ] 4.3 Check inbox — invite mail should arrive from `Wapy <hola@wapy.com.ar>`.
- [ ] 4.4 Click the link in the mail → opens `/signup?token=...` with email prefilled.
- [ ] 4.5 Complete signup with a password. Confirm redirect to `/onboarding` (since role is owner).
- [ ] 4.6 Logout. Login as superadmin again. Refresh `/admin` — the test row now shows status "Registrado".
- [ ] 4.7 Add another test alias, this time click "Re-invitar" right after. Confirm a second mail arrives with different token.
- [ ] 4.8 Click "Quitar" on a pending row. Confirm the dialog appears. Confirm. Row disappears.

## 5. Commits & PR

- [x] 5.1 Commit 1: `Add superadmin server actions and schemas for whitelist management` (`lib/admin/{schemas,actions}.ts`).
- [x] 5.2 Commit 2: `Build /admin whitelist panel with add, re-invite, remove` (`app/admin/page.tsx` rewritten + 3 new components).
- [x] 5.3 Commit 3: `Mark Phase 3 tasks complete` (`openspec/.../tasks.md`).
- [ ] 5.4 Push branch `feat/wapy-superadmin-panel` to origin.
- [ ] 5.5 Open PR against `feat/wapy-auth-whitelist` (base auto-changes to main when Fase 2 merges).
