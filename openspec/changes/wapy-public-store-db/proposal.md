## Why

Cierra el MVP de Wapy. Hoy una tienda creada via wizard queda `status='published'` en DB pero `wapy.com.ar/{slug}` devuelve 404 (o el demo viejo si el slug coincide con `demo-shop`). Esta fase entrega el storefront público real: visitantes anónimos llegan a `wapy.com.ar/{slug}`, ven los productos, agregan al carrito, y al "Comprar" se abre WhatsApp del dueño con el pedido pre-armado. Es el momento en que un dueño puede compartir su link y empezar a recibir pedidos.

## What Changes

- **Nueva ruta `app/[slug]/page.tsx`** — catch-all en raíz. Server Component que:
  - Lee `slug` de params.
  - Intenta resolver via anon client (RLS filtra solo published). Si encuentra → renderiza storefront.
  - Si no, consulta `slug_history` (anon read permitido). Si encuentra → 301 redirect al slug actual.
  - Si tampoco, consulta admin client para diferenciar paused vs not-found. Paused → maintenance page. Not-found → 404.
- **Storefront UI** portado de `app/store/[slug]/StoreClient.tsx` actual: header con logo + accent color, sections nav, product grid, cart drawer, WhatsApp checkout con pedido pre-armado en `wa.me/...`. Mantenemos el diseño que al usuario le gusta — solo cambia el origen de datos (props desde server, no `lib/stores.ts`).
- **Maintenance page** para `status='paused'`: header de la tienda (logo + nombre) + mensaje "Estamos haciendo cambios, volvemos pronto" + footer "Hecho con ✨ Wapy".
- **Footer "Hecho con Wapy"** discreto en todas las storefronts (link a `wapy.com.ar` para growth orgánico).
- **404 page customizada** para slug no existente: redirect/CTA a `wapy.com.ar` ("¿Querés tu tienda en Wapy?").
- **Cleanup**:
  - Borrar `app/store/[slug]/` entero (incluye `StoreClient.tsx`, `layout.tsx`).
  - Borrar `lib/stores.ts` (datos hardcodeados del demo).
  - Remover lógica de subdominios de `proxy.ts` (ya no usamos `demo.localhost`).
  - Remover `NEXT_PUBLIC_DEMO_URL` de `app/components/Hero.tsx` y `.env.local.example`.
  - El "Ver tienda ↗" del Sidebar del dashboard (Fase 5) ahora funciona — los visitantes pueden llegar.

## Capabilities

### New Capabilities
- `public-storefront`: el storefront público (catalog browsing + cart + WhatsApp checkout), incluye routing por slug, redirects de slug_history, maintenance page para paused, 404 para not-found, y el footer de branding.

### Modified Capabilities

None. La capability `public-routing` de Fase 1 documentó el contrato (reserved slugs, regex, slug_history para redirects); esta fase la implementa pero no modifica las requirements.

## Impact

- **DB**: sin migraciones nuevas. El trigger `archive_old_slug` y la policy de anon read en `slug_history` (Fase 1) ya cubren todo.
- **Deps**: ninguna nueva.
- **Código nuevo**:
  - `app/[slug]/page.tsx` — server component con routing + data fetching.
  - `app/[slug]/StoreClient.tsx` — UI portada del demo viejo, adaptada a tipos de Supabase.
  - `app/[slug]/MaintenancePage.tsx` — pantalla de tienda pausada.
  - `app/[slug]/not-found.tsx` — 404 customizado.
  - `app/components/WapyFooter.tsx` — footer compartido "Hecho con Wapy" para storefronts.
  - `lib/storefront/resolve.ts` — helper de resolución de slug (anon → slug_history → admin paused check → 404).
- **Código modificado**:
  - `proxy.ts` — sacar lógica de subdomain routing (`ROOT_DOMAINS`, `getSubdomain`, rewrite a `/store/...`). Mantener solo auth gate.
  - `app/components/Hero.tsx` — remover `NEXT_PUBLIC_DEMO_URL` si todavía está referenciado (debería estar ya removido en Fase 1; verificar).
  - `.env.local.example` — remover `NEXT_PUBLIC_DEMO_URL`.
- **Código borrado**:
  - `app/store/[slug]/StoreClient.tsx`
  - `app/store/[slug]/layout.tsx`
  - `app/store/[slug]/page.tsx`
  - `app/store/` (directorio entero queda vacío y se borra)
  - `lib/stores.ts` (datos hardcodeados del demo)
- **Próximamente funciona**: el link "Ver tienda ↗" del Sidebar del dashboard (Fase 5), que apunta a `{NEXT_PUBLIC_APP_URL}/{slug}`, finalmente devuelve la storefront real.

## Out of scope (futuro post-MVP)

- Server-side caching de storefront (HTTP cache headers + Vercel CDN sí, pero sin Cache Components manual). Si performance se vuelve issue post-launch, agregamos `cacheLife` + `cacheTag` por store.
- Imágenes optimizadas via `next/image` — el demo usaba `<img>` por simplicidad. Migrar a `next/image` con `unoptimized={false}` requiere agregar el dominio de Supabase Storage a `next.config.ts`. Lo hacemos en esta fase si es trivial; sino, post-MVP.
- SEO meta tags por store (Open Graph, Twitter Card) — sí, lo incluimos en esta fase porque es trivial (`generateMetadata` en page.tsx).
- Sitemap dinámico con todas las tiendas published — post-MVP.
- Schema.org structured data — post-MVP.
- Analytics tracking (clicks, vistas, conversiones a WhatsApp) — post-MVP.
- Variantes / talles / colores en productos — fuera de scope MVP.
- Localization (i18n) — todo en español por ahora.
