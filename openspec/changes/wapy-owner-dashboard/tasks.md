## 1. Refactor: shared store components + actions

- [ ] 1.1 Move `app/onboarding/components/ProductModal.tsx` → `app/components/store/ProductModal.tsx`. Update all imports.
- [ ] 1.2 Move `app/onboarding/components/ImageUpload.tsx` → `app/components/store/ImageUpload.tsx`. Update imports.
- [ ] 1.3 Move `app/onboarding/components/LogoUploader.tsx` → `app/components/store/LogoUploader.tsx`. Update imports.
- [ ] 1.4 Move `app/onboarding/components/SortableList.tsx` → `app/components/store/SortableList.tsx`. Update imports.
- [ ] 1.5 Create `lib/store/actions.ts` with `'use server'`. Move from `lib/onboarding/actions.ts` the pure edit actions:
  - `saveStoreBasics({ name, description })`: requireOwner + UPDATE name + description. Does NOT touch slug (that's in `renameSlug`). Does NOT touch `onboarding_step`.
  - `saveStoreLook({ accent_color, logo_url? })`: UPDATE.
  - `saveStoreSection({ id?, name, slug, position })`: UPSERT.
  - `deleteStoreSection({ id })`: DELETE (cascades products' section_id to NULL).
  - `saveStoreProduct({ id?, ...fields })`: UPSERT.
  - `deleteStoreProduct({ id })`: DELETE row + remove image files from storage.
  - `saveStoreWhatsapp({ whatsapp_number })`: UPDATE.
  - Each calls `revalidatePath('/dashboard', 'layout')` on success (use `'page'` if dashboard layout is light; verify build).
- [ ] 1.6 Update `lib/onboarding/actions.ts` to import from `lib/store/actions.ts` for the edit operations. Keep `checkSlugAvailable`, `publishStore`, and any step-increment helpers locally. Wizard step actions wrap the store actions + advance `onboarding_step` separately.
- [ ] 1.7 `npm run build` — must pass after refactor.

## 2. Dashboard-specific actions

- [ ] 2.1 Create `lib/dashboard/actions.ts` with:
  - `renameSlug({ newSlug })`: requireOwner → re-call `checkSlugAvailable(newSlug, excludeStoreId=store.id)` → if available, UPDATE `stores.slug`. Returns `{ ok: true, oldSlug, newSlug }`. The DB trigger `archive_old_slug` writes to `slug_history` automatically.
  - `toggleStoreStatus()`: requireOwner → toggle `published` ↔ `paused`. Reject if current status is `draft` (caller shouldn't be in dashboard).
  - `deleteStore({ confirmSlug })`: requireOwner → verify confirmSlug === store.slug → list all storage files under `product-images/{store_id}/` and `store-logos/{store_id}/` → batch `.remove([...paths])` → DELETE stores row (FK cascades sections, products, slug_history). Returns `{ ok: true }` and the page should redirect to `/onboarding` after.

## 3. Dashboard routing

- [ ] 3.1 Replace `app/dashboard/page.tsx` with Server Component: requireOwner → `getStoreState` → if no store or status='draft' → redirect `/onboarding` → else redirect `/dashboard/info`.
- [ ] 3.2 Create `app/dashboard/[section]/page.tsx` Server Component:
  - Validate section ∈ `{ info, image, sections, products, whatsapp, settings }` (404 otherwise).
  - requireOwner + load store + load sections + load products via admin client.
  - Render `<DashboardShell store={store}>` containing `<Sidebar currentSection={section} />` + the right `<*Panel>`.
- [ ] 3.3 Verify `proxy.ts` already protects `/dashboard/:path*` (it does — `PROTECTED_PREFIXES` includes `/dashboard`). No change needed.

## 4. Shell + Sidebar

- [ ] 4.1 Create `app/dashboard/components/DashboardShell.tsx` (Server Component): layout div with sidebar (lg:fixed) + content area. Pass `currentSection` to sidebar.
- [ ] 4.2 Create `app/dashboard/components/Sidebar.tsx`:
  - 6 nav items as `<Link>` to `/dashboard/{section}` with active highlight.
  - Wapy logo at top (link to `/`).
  - "Ver tienda ↗" external link to `{NEXT_PUBLIC_APP_URL}/{store.slug}` (target=_blank, rel=noopener).
  - Logout form (POST to `/api/auth/logout`).
  - Desktop: sticky sidebar, 240px. Mobile: a button at top that opens a drawer (use `<MobileSidebar>` client wrapper for drawer state).

## 5. Panels (Client where forms need it)

For each panel, use `react-hook-form` + zodResolver with reused schemas. Submit calls store action, shows toast on success/error.

- [ ] 5.1 `InfoPanel.tsx` (Client): name + description form. Calls `saveStoreBasics`. Schema: subset of `basicsSchema` (no slug).
- [ ] 5.2 `ImagePanel.tsx` (Client): LogoUploader + 6 swatch palette. Calls `saveStoreLook`.
- [ ] 5.3 `SectionsPanel.tsx` (Client): SortableList of sections. Add inline + delete + reorder. Calls `saveStoreSection` per change.
- [ ] 5.4 `ProductsPanel.tsx` (Client): SortableList of product cards with active toggle + ProductModal for edit/add. Calls `saveStoreProduct` and `deleteStoreProduct`.
- [ ] 5.5 `WhatsappPanel.tsx` (Client): E.164 input with preview. Calls `saveStoreWhatsapp`.
- [ ] 5.6 `SettingsPanel.tsx` (Client): composite with subsections:
  - Slug rename: input + `<RenameSlugModal>` for confirmation. Calls `renameSlug`.
  - Pause/unpause toggle: switch + confirm modal. Calls `toggleStoreStatus`.
  - Read-only info: created_at, published_at.
  - Danger zone: delete with typing confirmation + `<DeleteStoreModal>`. Calls `deleteStore`.

## 6. Modals

- [ ] 6.1 Create `app/dashboard/components/RenameSlugModal.tsx` (Client): shows old→new preview + confirm/cancel. Triggers `renameSlug` action.
- [ ] 6.2 Create `app/dashboard/components/DeleteStoreModal.tsx` (Client): typing-confirmation pattern. Triggers `deleteStore` action.

## 7. Verification

- [ ] 7.1 `npm run build` — must pass.
- [ ] 7.2 `npm run dev` — verify all 6 dashboard sections compile.
- [ ] 7.3 No TypeScript `any`. Tipos del schema importados.

## 8. Smoke test (USER)

- [ ] 8.1 Login as published owner. `/dashboard` redirects to `/dashboard/info`. Verify sidebar muestra 6 secciones.
- [ ] 8.2 Editar info: cambiar name → Guardar → reload → persiste.
- [ ] 8.3 Imagen: subir logo nuevo + cambiar color → Guardar → reload → persiste.
- [ ] 8.4 Secciones: agregar nueva + drag-reorder + borrar una → cambios persisten.
- [ ] 8.5 Productos: editar un producto existente (cambiar precio/imagen) → agregar nuevo → toggle is_active off → toggle on → borrar uno → todo persiste.
- [ ] 8.6 WhatsApp: cambiar número → Guardar.
- [ ] 8.7 Settings → slug rename: cambiar slug. Confirmar modal con preview. Verificar `SELECT * FROM slug_history WHERE store_id=...` — debe haber row con old_slug.
- [ ] 8.8 Settings → pausar tienda. status='paused' en DB. Reactivar. status='published'.
- [ ] 8.9 (Otro owner test) Settings → delete: typing slug exacto → confirmar → redirect a /onboarding/basics. Verificar DB: store + sections + products + slug_history del store removidos. Storage: ls bucket — vacío para ese store_id.
- [ ] 8.10 Click "Ver tienda ↗" en sidebar → nueva tab a wapy.com.ar/{slug} (404 esperado hasta Fase 6).

## 9. Commits & PR

- [ ] 9.1 Commit 1: `Refactor: extract shared store components and actions for dashboard reuse` (lib/store/actions.ts + app/components/store/ + updates a lib/onboarding/actions.ts y app/onboarding/components/* imports).
- [ ] 9.2 Commit 2: `Add owner dashboard layout, sidebar, and routing` (DashboardShell, Sidebar, [section] router, /dashboard root redirect).
- [ ] 9.3 Commit 3: `Add dashboard panels for info, image, sections, products, whatsapp` (5.1-5.5 panels).
- [ ] 9.4 Commit 4: `Add settings panel with rename, pause, and delete actions` (5.6 SettingsPanel + 2.x actions + 6.x modals).
- [ ] 9.5 Update tasks.md marking all complete; commit.
- [ ] 9.6 Push branch; orchestrator opens PR.
