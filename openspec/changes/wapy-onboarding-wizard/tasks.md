## 1. Dependencies

- [ ] 1.1 Add `react-dropzone` (drag&drop upload) and `@dnd-kit/core` + `@dnd-kit/sortable` (drag-reorder) to `package.json`. Install.
- [ ] 1.2 Confirm `npm run build` still passes with new deps.

## 2. State + schemas + actions

- [ ] 2.1 Create `lib/onboarding/schemas.ts` with zod per step: `basicsSchema`, `lookSchema` (accent_color enum of 6 hex), `sectionsSchema` (min 1), `productsSchema` (min 1, each with price_cents>=0, max 5 images), `whatsappSchema` (E.164 regex). Export inferred types.
- [ ] 2.2 Create `lib/onboarding/palette.ts` exporting the 6 accent colors as a const array (e.g., `['#22c55e','#eab308','#ef4444','#3b82f6','#a855f7','#ec4899']` — final list TBD, pick from `ui-ux-pro-max` palettes for variety + accessibility).
- [ ] 2.3 Create `lib/onboarding/state.ts`:
  - `STEP_NAMES = ['basics','look','sections','products','whatsapp','review'] as const`
  - `stepIndexFor(name)` / `stepNameFor(index)` helpers
  - `getStoreState(userId)` server-side helper: returns `{ store, currentStep, canPublish }`. Uses admin client.
  - `validateForStep(store, step)` boolean — checks pre-requisites for that step.
- [ ] 2.4 Create `lib/onboarding/actions.ts` with `'use server'`:
  - `checkSlugAvailable(slug: string, excludeStoreId?: string)`: server action used by basics for real-time check. Returns `{ available: boolean, reason?: 'invalid'|'reserved'|'taken' }`. **NOT** behind `requireOwner` — needs to be callable from form input.
  - `saveBasics({ name, slug, description })`: requireOwner → validate slug → INSERT or UPDATE store. Sets `onboarding_step=1`. Returns `{ ok: true, storeId } | { error }`.
  - `saveLook({ accent_color, logo_url? })`: requireOwner → UPDATE. Sets onboarding_step=2. (Note: `logo_url` may have been set via separate upload action.)
  - `saveSections({ sections: [{name, slug, position}] })`: requireOwner → UPSERT batch + DELETE removed. Sets onboarding_step=3.
  - `saveProducts({ products: [...] })`: requireOwner → UPSERT batch + DELETE removed. Sets onboarding_step=4.
  - `saveWhatsapp({ whatsapp_number })`: requireOwner → UPDATE. Sets onboarding_step=5.
  - `publishStore()`: requireOwner → re-validate ALL prerequisites → UPDATE status='published', published_at=NOW(), onboarding_step=7. Returns `{ ok: true } | { error: 'missing_prereq', details: [...] }`.
  - Each mutating action calls `revalidatePath('/onboarding', 'layout')`.
- [ ] 2.5 Create `lib/onboarding/storage.ts` with client-side helpers (Client Components import these):
  - `uploadLogo(file: File, storeId: string)` → returns public URL or throws.
  - `uploadProductImage(file: File, storeId: string)` → returns public URL.
  - `deleteImage(url: string)` → extracts path, calls supabase.storage.remove.
  - All use the browser supabase client (which has user session for RLS).

## 3. Routing + smart redirect

- [ ] 3.1 Replace `app/onboarding/page.tsx` (placeholder) with Server Component that calls `getStoreState`, redirects to `/onboarding/{currentStep}` (or `/dashboard` if published).
- [ ] 3.2 Create `app/onboarding/[step]/page.tsx` Server Component:
  - Validate `step` is one of STEP_NAMES (404 if not).
  - Call `getStoreState`.
  - If step requested > currentStep, redirect to `/onboarding/{currentStep}`.
  - Render `<Stepper currentStep={...} completedSteps={...} />` + the appropriate `<Step*>` component based on `step`.
- [ ] 3.3 Update `proxy.ts` PROTECTED_PREFIXES to still cover `/onboarding/:path*` (already does). No changes needed, just verify.

## 4. Stepper component (`ui-ux-pro-max` style)

- [ ] 4.1 Create `app/onboarding/components/Stepper.tsx`:
  - Props: `currentStep`, `completedSteps[]`.
  - Renders 7 step items: 6 wizard + final "Publicar" (which is part of review).
  - Each item: number, label, status indicator (checkmark / current / locked).
  - Click on completed step → Link to `/onboarding/{step}`. Future steps → non-interactive.
  - Responsive: sidebar on lg+, top bar on smaller.

## 5. Step components (Client where forms need it)

For each step, create `app/onboarding/components/Step{Name}.tsx`. All receive `store` prop (current state). All use `react-hook-form` + zodResolver with the matching schema. All have `[← Atrás]` and `[Siguiente →]` buttons; submit calls the corresponding server action; success advances via Next router push.

- [ ] 5.1 `StepBasics.tsx` (Client):
  - Form: name, slug, description.
  - Slug input with onChange handler that debounces (300ms) + calls `checkSlugAvailable`. Shows green/red indicator.
  - Disables "Siguiente" if slug check returns unavailable.
- [ ] 5.2 `StepLook.tsx` (Client):
  - Logo upload component (`<LogoUploader storeId={store.id} initialUrl={store.logo_url} />`).
  - Color swatches: 6 buttons, one per palette color. Click selects. Selected highlighted.
- [ ] 5.3 `StepSections.tsx` (Client):
  - Sortable list of sections (using @dnd-kit).
  - "+ Agregar sección" button at bottom → inline input + Enter to confirm.
  - Each item: name (editable), delete X. Slug derives automatically from name (lowercase + dashes).
  - "Siguiente" disabled if 0 sections.
- [ ] 5.4 `StepProducts.tsx` (Client):
  - Sortable list of product cards (name, price, thumbnail of first image).
  - "+ Agregar producto" button opens `<ProductModal />`.
  - Click on existing card opens same modal in edit mode.
  - "Siguiente" disabled if 0 active products.
- [ ] 5.5 `ProductModal.tsx` (Client, used inside StepProducts):
  - Form: name, description, price (ARS with thousand separator visual), stock (optional), section (select from current store sections), images (multi-upload to 5).
  - Submit → save to DB via action OR local state until step "Siguiente" (decide: simpler to save per-product immediately so list is always synced).
  - **Decision**: save immediately per-product so the modal close = product persisted. Avoids stale list state.
- [ ] 5.6 `StepWhatsapp.tsx` (Client):
  - Input pre-filled with `+54 9 `. Validation E.164.
  - Below: preview text "Los pedidos llegan a: `wa.me/{normalized-number}`".
- [ ] 5.7 `StepReview.tsx` (Server Component since just renders data):
  - 5 cards (one per prior step) with summary + "Editar" Link to that step.
  - Big "Publicar mi tienda" button at bottom triggering `publishStore()` action.
  - Below button: small text "Tu tienda quedará en https://wapy.com.ar/{slug}".

## 6. Image upload component

- [ ] 6.1 Create `app/onboarding/components/ImageUpload.tsx` (Client):
  - Generic: props `{ bucket, pathPrefix, maxSizeMB, maxCount, onUploaded, accept }`.
  - Uses `react-dropzone` for drag+click.
  - Shows file size + format errors inline.
  - Spinner per-file while uploading.
- [ ] 6.2 Create `app/onboarding/components/LogoUploader.tsx` (Client, wraps ImageUpload):
  - Specialization: single file, replaces, ties to `stores.logo_url`.
- [ ] 6.3 ProductModal uses ImageUpload directly with maxCount=5.

## 7. Publish flow + /dashboard placeholder update

- [ ] 7.1 Verify `publishStore()` server action covers all the spec scenarios.
- [ ] 7.2 Update `app/dashboard/page.tsx` placeholder (NOTE: this file may not exist yet — `dashboard` was never a route in earlier Fases since middleware protects it but no page exists). Create if missing.
  - Server Component, requireOwner.
  - If `store.status='published'`: show celebration card with `https://{NEXT_PUBLIC_APP_URL}/{slug}` link + copy-to-clipboard button + disabled "Editar" with "Próximamente Fase 5".
  - If `status='draft'`: redirect to `/onboarding`.
  - Logout button.

## 8. Cleanup of orphaned files on delete

- [ ] 8.1 `removeProduct` action: before DELETE row, call `supabase.storage.from('product-images').remove([...paths])` for each URL in `image_urls`. Log + continue if remove fails.
- [ ] 8.2 `removeSection` action: rely on FK ON DELETE SET NULL for products. No storage cleanup needed (products' images survive).

## 9. Verification

- [ ] 9.1 `npm run build` — must pass.
- [ ] 9.2 `npm run dev` — verify routes compile:
  - `/onboarding/basics` (Client form)
  - `/onboarding/look` (with upload)
  - `/onboarding/sections` (with drag)
  - `/onboarding/products` (with modal)
  - `/onboarding/whatsapp`
  - `/onboarding/review`
- [ ] 9.3 Zero TypeScript `any`. All store/product/section data typed via `lib/supabase/types.ts`.

## 10. Smoke test (USER — assisted by orchestrator)

- [ ] 10.1 Login as test owner (created via /admin). Land on `/onboarding`. Verify redirect to `/onboarding/basics`.
- [ ] 10.2 Complete basics with valid name/slug/description. Verify real-time slug check. Click Siguiente.
- [ ] 10.3 Complete look: upload a small logo, pick a color. Verify preview. Siguiente.
- [ ] 10.4 Add 2 sections, drag-reorder. Siguiente.
- [ ] 10.5 Add 2 products in different sections, with 1-2 images each. Verify thumbnails. Siguiente.
- [ ] 10.6 Enter WhatsApp number. Verify preview. Siguiente.
- [ ] 10.7 In review, verify all cards show correct data. Click Editar en alguna → vuelve al step. Vuelve a review.
- [ ] 10.8 Click "Publicar mi tienda". Verify redirect to `/dashboard` con mensaje "publicada en wapy.com.ar/{slug}".
- [ ] 10.9 Logout, login de nuevo. Verify `/onboarding` redirects to `/dashboard` (store published).
- [ ] 10.10 (Edge) Como otro owner test: completar basics y abandonar. Cerrar browser. Re-loguear. Verify llega a `/onboarding/look` directamente (no a basics de nuevo).

## 11. Commits & PR

- [ ] 11.1 Commit 1: `Add onboarding state machine, schemas, and server actions` (lib/onboarding/, deps update).
- [ ] 11.2 Commit 2: `Add onboarding wizard pages: stepper, basics, look, sections` (3.x routing + 4.x Stepper + 5.1-5.3 step components + image upload component for logo).
- [ ] 11.3 Commit 3: `Add product CRUD with multi-image upload` (5.4 StepProducts + 5.5 ProductModal + ImageUpload extended).
- [ ] 11.4 Commit 4: `Add whatsapp step, review summary, and publish flow + /dashboard placeholder` (5.6, 5.7, 7.x).
- [ ] 11.5 Update `tasks.md` marking all completed; commit it.
- [ ] 11.6 Push branch + open PR (orchestrator handles).
