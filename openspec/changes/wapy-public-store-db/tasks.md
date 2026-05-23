## 1. Cleanup of demo and subdomain legacy

- [ ] 1.1 `grep -r "from '@/lib/stores'\|from '@/lib/stores.ts'"` to confirm no live imports of `lib/stores.ts`. If hits, address before delete.
- [ ] 1.2 `git rm lib/stores.ts`.
- [ ] 1.3 `git mv app/store/[slug]/StoreClient.tsx app/[slug]/StoreClient.tsx` (preserves git history of the UI work).
- [ ] 1.4 `git rm app/store/[slug]/page.tsx app/store/[slug]/layout.tsx` (and the empty dir).
- [ ] 1.5 Edit `proxy.ts`: remove `ROOT_DOMAINS`, `getSubdomain`, and the subdomain rewrite block. Keep only the auth gate logic. Update file comment.
- [ ] 1.6 Edit `.env.local.example` to remove the `NEXT_PUBLIC_DEMO_URL` lines.
- [ ] 1.7 `grep -r "NEXT_PUBLIC_DEMO_URL"` to confirm no live refs. If hits, remove.
- [ ] 1.8 `npm run build` — must pass before committing. (Expected: build passes with the moved StoreClient temporarily broken if it imported from `lib/stores.ts` — that's fine for THIS commit since the new page.tsx is in next commit. If breaks, may need to stub StoreClient or skip move until commit 3.)

**Note on commit ordering**: if `git mv` of StoreClient + delete of stores.ts breaks the build (because StoreClient imports from stores.ts), reorder:
- Commit 1: remove subdomain logic from proxy.ts + remove NEXT_PUBLIC_DEMO_URL refs only.
- Commit 2: add new page.tsx + new StoreClient (rewritten, doesn't import old stores.ts) → build passes.
- Commit 3: delete old `app/store/` and `lib/stores.ts`.

## 2. Resolver helper

- [ ] 2.1 Create `lib/storefront/resolve.ts` exporting `resolveStoreSlug(slug: string)` returning the `Resolution` discriminated union (`render | redirect | maintenance | not_found`).
- [ ] 2.2 Wrap with React `cache()` so the second call within the same request (from `generateMetadata`) reuses the result.
- [ ] 2.3 Use anon client (`createClient` with URL + ANON_KEY) for steps 1+2; admin client (`createAdminClient`) for step 3.
- [ ] 2.4 In step 1 (render path), fetch sections + products in parallel via `Promise.all`.

## 3. Routing + page

- [ ] 3.1 Create `app/[slug]/page.tsx` Server Component:
  - `await params` → get slug.
  - Call `resolveStoreSlug(slug)`.
  - Switch on `kind`: render → `<StoreClient ...>`; redirect → `redirect()` from `next/navigation` with `'permanent'` flag; maintenance → `<MaintenancePage store={...}>`; not_found → `notFound()`.
- [ ] 3.2 Create `app/[slug]/not-found.tsx`:
  - Hero with Wapy mascot/logo + "Esta tienda no existe (todavía)".
  - CTA button "Armá tu tienda gratis en Wapy" → link to `/signup`.
  - Include `<WapyFooter />`.
- [ ] 3.3 Export `generateMetadata` from `page.tsx`:
  - Re-call `resolveStoreSlug` (cached, free).
  - Return Metadata based on kind: render → store-specific title/description/og; maintenance → "{name} — En mantenimiento" + `robots: { index: false }`; not_found → "Esta tienda no existe".

## 4. StoreClient adaptation

- [ ] 4.1 Edit `app/[slug]/StoreClient.tsx` (just moved from `app/store/[slug]/`):
  - Change props from JSON-shape to typed Supabase rows: `store: StoreRow`, `sections: SectionRow[]`, `products: ProductRow[]`.
  - Group products by section_id in client (use `useMemo`).
  - Replace `imageUrl` with `image_urls[0]` (fallback to placeholder if empty array).
  - Inject `--accent` CSS variable from `store.theme.accent_color` (fallback to default green).
  - Adapt `whatsappNumber` logic: if `store.whatsapp_number` is null, show "Comprar" button as disabled with tooltip "El comercio no configuró WhatsApp aún".
  - Wa.me URL: `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`.
- [ ] 4.2 Insert `<WapyFooter />` at the bottom of the page layout.

## 5. MaintenancePage

- [ ] 5.1 Create `app/[slug]/MaintenancePage.tsx` Server Component:
  - Props: `store: { name: string; logo_url: string | null; theme: any }`.
  - Render: centered card with logo + name + message + accent-colored button "Volver a Wapy" → `/`.
  - Include `<WapyFooter />`.

## 6. Wapy footer

- [ ] 6.1 Create `app/components/WapyFooter.tsx`:
  - Server Component.
  - Render: `<footer>` with subtle border-top, centered small text "Hecho con ✨ [Wapy](https://wapy.com.ar)".

## 7. Verification

- [ ] 7.1 `npm run build` — must pass.
- [ ] 7.2 Verify Next.js precedence: hit `/admin`, `/dashboard`, `/signup`, `/login`, `/onboarding`, `/forgot-password` in dev — they should NOT trigger the `/[slug]` catch-all.
- [ ] 7.3 Verify the favicon.ico, robots.txt, apple-icon.png still serve correctly (not caught by `/[slug]`).
- [ ] 7.4 Sin TypeScript `any` (excepto donde Json type lo requiere).

## 8. Smoke test (USER post-merge)

- [ ] 8.1 Como visitante anon, hit `wapy.com.ar/{tu-slug-publicado}` → debería renderizar la storefront con productos.
- [ ] 8.2 Click en "Comprar" tras agregar productos al carrito → debería abrir WhatsApp con mensaje pre-armado.
- [ ] 8.3 Renombrar slug desde dashboard → visitar URL vieja → 301 redirect al nuevo slug.
- [ ] 8.4 Pausar tienda desde dashboard → visitar URL → maintenance page con tu logo + nombre.
- [ ] 8.5 Re-activar tienda → visitar URL → vuelve la storefront completa.
- [ ] 8.6 Visitar `wapy.com.ar/slug-que-no-existe` → 404 con CTA a /signup.
- [ ] 8.7 Click "Ver tienda ↗" desde dashboard del owner → abre la storefront real (no 404).
- [ ] 8.8 Verificar que `/admin`, `/dashboard`, `/signup`, `/login` siguen funcionando (NO catch-all).
- [ ] 8.9 Vercel: borrar manualmente el env var `NEXT_PUBLIC_DEMO_URL` del dashboard (ya no se usa).

## 9. Commits & PR

- [ ] 9.1 Commit 1: `Add public storefront route /[slug] reading from Supabase` (lib/storefront/, app/[slug]/page.tsx, StoreClient adapted, MaintenancePage, not-found, WapyFooter).
- [ ] 9.2 Commit 2: `Remove legacy demo code and subdomain routing` (delete app/store/, lib/stores.ts, NEXT_PUBLIC_DEMO_URL refs, proxy.ts cleanup).
- [ ] 9.3 Update tasks.md marking complete; commit.
- [ ] 9.4 Push branch + open PR (orchestrator).
