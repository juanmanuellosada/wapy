## 1. Cleanup of demo and subdomain legacy

- [x] 1.1 `grep -r "from '@/lib/stores'\|from '@/lib/stores.ts'"` to confirm no live imports of `lib/stores.ts`. If hits, address before delete.
- [x] 1.2 `git rm lib/stores.ts`.
- [x] 1.3 `git mv app/store/[slug]/StoreClient.tsx app/[slug]/StoreClient.tsx` (preserves git history of the UI work).
- [x] 1.4 `git rm app/store/[slug]/page.tsx app/store/[slug]/layout.tsx` (and the empty dir).
- [x] 1.5 Edit `proxy.ts`: remove `ROOT_DOMAINS`, `getSubdomain`, and the subdomain rewrite block. Keep only the auth gate logic. Update file comment.
- [x] 1.6 Edit `.env.local.example` to remove the `NEXT_PUBLIC_DEMO_URL` lines. (Was already absent — confirmed.)
- [x] 1.7 `grep -r "NEXT_PUBLIC_DEMO_URL"` to confirm no live refs. None found.
- [x] 1.8 `npm run build` — passes.

**Note on commit ordering**: collapsed into one commit since new page.tsx + adapted StoreClient + deleted legacy all land together with a green build.

## 2. Resolver helper

- [x] 2.1 Create `lib/storefront/resolve.ts` exporting `resolveStoreSlug(slug: string)` returning the `Resolution` discriminated union (`render | redirect | maintenance | not_found`).
- [x] 2.2 Wrap with React `cache()` so the second call within the same request (from `generateMetadata`) reuses the result.
- [x] 2.3 Use anon client (`createClient` with URL + ANON_KEY) for steps 1+2; admin client (`createAdminClient`) for step 3.
- [x] 2.4 In step 1 (render path), fetch sections + products in parallel via `Promise.all`.

## 3. Routing + page

- [x] 3.1 Create `app/[slug]/page.tsx` Server Component:
  - `await params` → get slug.
  - Call `resolveStoreSlug(slug)`.
  - Switch on `kind`: render → `<StoreClient ...>`; redirect → `redirect()` from `next/navigation` with `'permanent'` flag; maintenance → `<MaintenancePage store={...}>`; not_found → `notFound()`.
- [x] 3.2 Create `app/[slug]/not-found.tsx`:
  - Hero with Wapy mascot/logo + "Esta tienda no existe (todavía)".
  - CTA button "Armá tu tienda gratis en Wapy" → link to `/signup`.
  - Include `<WapyFooter />`.
- [x] 3.3 Export `generateMetadata` from `page.tsx`:
  - Re-call `resolveStoreSlug` (cached, free).
  - Return Metadata based on kind: render → store-specific title/description/og; maintenance → "{name} — En mantenimiento" + `robots: { index: false }`; not_found → "Esta tienda no existe".

## 4. StoreClient adaptation

- [x] 4.1 Edit `app/[slug]/StoreClient.tsx` (just moved from `app/store/[slug]/`):
  - Change props from JSON-shape to typed Supabase rows: `store: StoreRow`, `sections: SectionRow[]`, `products: ProductRow[]`.
  - Group products by section_id in client (use `useMemo`).
  - Replace `imageUrl` with `image_urls[0]` (fallback to placeholder if empty array).
  - Inject `--accent` CSS variable from `store.theme.accent_color` (fallback to default green).
  - Adapt `whatsappNumber` logic: if `store.whatsapp_number` is null, show "Comprar" button as disabled with tooltip "El comercio no configuró WhatsApp aún".
  - Wa.me URL: `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`.
- [x] 4.2 Insert `<WapyFooter />` at the bottom of the page layout.

## 5. MaintenancePage

- [x] 5.1 Create `app/[slug]/MaintenancePage.tsx` Server Component:
  - Props: `store: { name: string; logo_url: string | null; theme: Json }`.
  - Render: centered card with logo + name + message + accent-colored button "Volver a Wapy" → `/`.
  - Include `<WapyFooter />`.

## 6. Wapy footer

- [x] 6.1 Create `app/components/WapyFooter.tsx`:
  - Server Component.
  - Render: `<footer>` with subtle border-top, centered small text "Hecho con ✨ [Wapy](https://wapy.com.ar)".

## 7. Verification

- [x] 7.1 `npm run build` — passes (0 errors, TypeScript clean).
- [x] 7.2 Routing precedence confirmed from build output: `/admin`, `/dashboard`, `/signup`, `/login`, `/onboarding`, `/forgot-password`, `/reset-password` all appear as named routes before `/[slug]`.
- [x] 7.3 Static assets (`favicon.ico`, `apple-icon.png`, `icon.png`) appear as static routes — not caught by `/[slug]`.
- [x] 7.4 No TypeScript `any` — Json type from types.ts used where needed; theme is typed via type-guard helper `getAccentColor`.

## 8. Smoke test (USER post-merge)

- [ ] 8.1 Como visitante anon, hit `wapy.com.ar/{tu-slug-publicado}` → debería renderizar la storefront con productos.
- [ ] 8.2 Click en "Comprar" tras agregar productos al carrito → debería abrir WhatsApp con mensaje pre-armado.
- [ ] 8.3 Renombrar slug desde dashboard → visitar URL vieja → 301 redirect al nuevo slug.
- [ ] 8.4 Pausar tienda desde dashboard → visitar URL → maintenance page con tu logo + nombre.
- [ ] 8.5 Re-activar tienda → visitar URL → vuelve la storefront completa.
- [ ] 8.6 Visitar `wapy.com.ar/slug-que-no-existe` → 404 con CTA a /signup.
- [ ] 8.7 Click "Ver tienda ↗" desde dashboard del owner → abre la storefront real (no 404).
- [ ] 8.8 Verificar que `/admin`, `/dashboard`, `/signup`, `/login` siguen funcionando (NO catch-all).
- [ ] 8.9 Vercel: borrar manualmente el env var `NEXT_PUBLIC_DEMO_URL` del dashboard (ya no se usa, aunque nunca existió en .env.local.example).

## 9. Commits & PR

- [x] 9.1 Commit `8bbac5f`: `Add public storefront route /[slug] reading from Supabase` — all new files + adapted StoreClient + deleted legacy + proxy.ts cleanup + OpenSpec artifacts. Single commit (collapsed 2→1 since build was green with everything together).
- [ ] 9.2 ~~Commit 2: Remove legacy demo code~~ (merged into commit 1 — see above).
- [x] 9.3 Update tasks.md marking complete; commit.
- [ ] 9.4 Push branch + open PR (orchestrator).
