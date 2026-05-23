## 1. Migrations + types

- [x] 1.1 Write `supabase/migrations/015_leads.sql`: create `public.leads` table with columns + RLS policy `leads_superadmin_all` + 2 indexes (status, created_at DESC). Apply via MCP.
- [x] 1.2 Write `supabase/migrations/016_whitelist_plan.sql`: ALTER TABLE whitelist ADD COLUMN plan text CHECK (in 'inicial','pro') + ADD COLUMN trial_ends_at timestamptz. Both nullable. Apply via MCP.
- [x] 1.3 `mcp__claude_ai_Supabase__get_advisors --type security` — confirm 0 new warnings.
- [x] 1.4 Regenerate `lib/supabase/types.ts` via MCP `generate_typescript_types`.

## 2. Lead capture (server-side)

- [x] 2.1 Create `lib/leads/schemas.ts`:
  - `leadFormSchema`: email, name (min 2 max 80), whatsapp (regex tolerante + normalize helper), plan enum ('inicial', 'pro'). Export type.
  - `normalizeWhatsapp(input: string): string | null` helper — tries to coerce to E.164, returns null if can't.
- [x] 2.2 Create `lib/leads/actions.ts` with `'use server'`:
  - `createLead(formData)`: re-parse with schema → normalize WhatsApp → INSERT into leads → call internal `sendNewLeadEmail` helper. Returns `{ ok: true } | { error: 'validation' | 'server_error' }`. Generic success even if mail fails (so visitor sees confirmation regardless).
  - `approveLead({ id })`: requireSuperadmin → SELECT lead WHERE id AND status='new' → check email not already in whitelist → INSERT whitelist (lowercased email, grant_role='owner', plan from lead, trial_ends_at = NOW() + 14 days) → UPDATE lead (status='approved', approved_at, approved_by) → sendInviteEmail. Returns `{ ok: true, mail_sent: boolean, mail_error? } | { error: 'invalid_state' | 'already_whitelisted' }`. revalidatePath('/admin', 'layout').
  - `deleteLead({ id })`: requireSuperadmin → DELETE row. revalidatePath.
  - `sendNewLeadEmail({ lead })`: internal helper, calls Resend with HTML inline template to `juanmalosada01@gmail.com`. Hardcoded recipient for MVP.

## 3. LeadFormModal (Client)

- [ ] 3.1 Create `app/components/LeadFormModal.tsx`:
  - Props: `{ open: boolean, onClose, plan: 'inicial' | 'pro' }`.
  - `react-hook-form` + zodResolver.
  - Fields: email, name, whatsapp (with hint "Ej: +54 9 11 1234 5678"), plan (hidden, set from prop).
  - Submit calls `createLead`. Disabled while submitting.
  - Success state: replaces form with check icon + "Te contactamos en menos de 24hs" + close button.
  - Error state: inline error banner above form.
  - Backdrop click + ESC close the modal.

## 4. Pricing section rewrite

- [ ] 4.1 Rewrite `app/components/Pricing.tsx`:
  - Two cards side-by-side on desktop, stacked on mobile (Pro first on mobile).
  - Each card: plan name, price `$X / mes`, "14 días gratis · sin tarjeta" badge, feature list with check icons, CTA button.
  - Pro card visually distinct: "Más popular" badge, brighter border, slight scale or shadow.
  - Both CTAs open `<LeadFormModal>` with respective plan. Modal state managed in this component via `useState`.
  - Features Inicial: "Hasta 15 productos", "Hasta 3 secciones", "Tu link wapy.com.ar/tu-tienda", "Pedidos por WhatsApp", "Panel de control".
  - Features Pro: "Productos ilimitados", "Secciones ilimitadas", "Tu link wapy.com.ar/tu-tienda", "Pedidos por WhatsApp", "Panel de control", "Soporte prioritario".

## 5. Header + Hero + Footer adjustments

- [ ] 5.1 Edit `app/components/Header.tsx`:
  - Add "Ingresar" link → `/login` between nav items and CTA on desktop.
  - Add "Ingresar" in mobile drawer items list.
  - Keep existing CTA "Quiero mi tienda" but change href to `#precios` (it might already be).
- [ ] 5.2 Edit `app/components/Hero.tsx`:
  - Refinar copy: headline shorter and more direct ("Tu tienda online + WhatsApp, lista en 5 minutos" o similar — refinar con ui-ux-pro-max guidance).
  - Primary CTA "Quiero mi tienda" → `#precios`.
  - Secondary CTA optional: "Ver cómo funciona" → `#como-funciona`.
  - Mockup visual: side image (mobile mockup + WhatsApp bubble). Use SVG inline or PNG placeholder in `/public/landing/mockup.png` (if SVG too complex, leave PNG asset reference and note in PR description that asset should be replaced; OR build a CSS-only mockup with divs).
- [ ] 5.3 Edit `app/components/Footer.tsx`:
  - Real anchors for nav links (`#como-funciona`, `#features`, `#precios`, `#faq`).
  - Add "Ingresar" → `/login`.
  - Add "Contacto" → `mailto:hola@wapy.com.ar`.
  - Legal links can keep `#` placeholders.

## 6. FAQ section

- [ ] 6.1 Create `app/components/FAQ.tsx`:
  - 8 preguntas hardcodeadas (ver design.md §11 para texto exacto, refinar copy).
  - Accessible accordion: each question is a `<button>` with `aria-expanded`. Only one open at a time (state in component).
  - Anchor `id="faq"`.
- [ ] 6.2 Edit `app/page.tsx`: import + insert `<FAQ />` between `<Pricing />` and `<Footer />`.

## 7. /admin sub-routes split

- [ ] 7.1 Edit `app/admin/page.tsx`: replace current content with `requireSuperadmin` + `redirect('/admin/leads')`.
- [ ] 7.2 Create `app/admin/_components/AdminShell.tsx` (Server Component): header with "Wapy Admin" + email + logout, + `<AdminNav currentTab={tab} />`.
- [ ] 7.3 Create `app/admin/_components/AdminNav.tsx`: pills/tabs with "Leads" and "Whitelist" links to `/admin/leads` and `/admin/whitelist`. Highlight current.
- [ ] 7.4 Create `app/admin/whitelist/page.tsx`: move logic from old `app/admin/page.tsx`. Render `<AdminShell tab='whitelist'>` + existing `<AddEmailForm />` + `<WhitelistTable rows={...} />`. Update WhitelistTable to also render `plan` badge + "trial ends in" column.
- [ ] 7.5 Update `app/admin/WhitelistTable.tsx` (current location, will be moved to `app/admin/whitelist/` or shared):
  - Add `plan` column showing badge "Inicial" or "Pro" (or "—" if null).
  - Add "Trial" column showing "Vence en X días" / "Venció hace X días" / "—" based on `trial_ends_at`.

## 8. Leads panel

- [ ] 8.1 Create `app/admin/leads/page.tsx`: Server Component. requireSuperadmin → fetch all leads (sorted by created_at DESC) → render `<AdminShell tab='leads'>` + `<LeadsTable rows={...} />`.
- [ ] 8.2 Create `app/admin/leads/LeadsTable.tsx`: table with columns name, email, whatsapp, plan badge, status badge, "hace X días" (relative time), actions. Pass row to `<LeadRowActions>`.
- [ ] 8.3 Create `app/admin/leads/LeadRowActions.tsx` (Client): "Aprobar" button (visible if status='new') → calls `approveLead` → toast/inline feedback ("Lead aprobado, invite enviado" or warning if mail failed). "Borrar" button → window.confirm → `deleteLead`. Disable while pending.

## 9. Verification

- [ ] 9.1 `npm run build` — must pass.
- [ ] 9.2 Verify dev: lead form opens from Pricing CTAs, submits to actions correctly. No console errors.
- [ ] 9.3 Confirm `/admin` redirects to `/admin/leads`. Tab nav works between Leads and Whitelist.
- [ ] 9.4 Sin TypeScript `any`.
- [ ] 9.5 Run `get_advisors --type security` — 0 warnings (the new RLS policies for leads should be clean).

## 10. Smoke test (USER post-merge)

- [ ] 10.1 Anon visit `wapy.com.ar` → Pricing muestra 2 cards con $12k/$20k + badge 14 días gratis.
- [ ] 10.2 Click "Quiero el Inicial" → modal con plan='inicial' pre-set. Llenar y submit con mail real.
- [ ] 10.3 Verificar tu inbox → te llega mail "🆕 Nuevo lead en Wapy".
- [ ] 10.4 Login como superadmin → `/admin` redirige a `/admin/leads`. Ver el lead.
- [ ] 10.5 Click "Aprobar" → mail invite llega al lead. Verificar `whitelist` tiene row con plan + trial_ends_at.
- [ ] 10.6 Como ese lead (incognito), click invite → /signup prefilled → completar → /onboarding.
- [ ] 10.7 Volver a `/admin/whitelist` → ver columna Trial ("Vence en 13 días" o similar).
- [ ] 10.8 Borrar otro lead test → desaparece.
- [ ] 10.9 Header: link "Ingresar" abre `/login`.
- [ ] 10.10 Mobile: drawer abre, "Ingresar" presente.
- [ ] 10.11 FAQ: click cada pregunta, abre/cierra correctamente.
- [ ] 10.12 (Cross-check) `/admin/whitelist` mantiene Add/Re-invite/Remove funcional (no regresión Fase 3).

## 11. Commits & PR

- [ ] 11.1 Commit 1: `Add leads schema, types, and lead capture server actions` (migrations 015+016, types.ts regen, lib/leads/*).
- [ ] 11.2 Commit 2: `Add lead form modal and rewrite pricing with two plans` (LeadFormModal, Pricing rewrite).
- [ ] 11.3 Commit 3: `Add FAQ section and login link in header + footer` (FAQ component, Header + Footer edits, page.tsx update).
- [ ] 11.4 Commit 4: `Refine Hero copy and add mockup visual` (Hero + HowItWorks + Features pulido).
- [ ] 11.5 Commit 5: `Split /admin into sub-routes with leads management` (sub-routes, AdminShell, AdminNav, LeadsTable, LeadRowActions, WhitelistTable updates).
- [ ] 11.6 Update tasks.md; commit.
- [ ] 11.7 Orchestrator: push + open PR.
