## Context

Las 5 fases anteriores construyeron toda la maquinaria — infra, auth, admin, onboarding, dashboard. La pieza que falta es el destino final: la URL pública donde una tienda recibe pedidos. Esta fase cierra el loop end-to-end del MVP.

La complejidad real está en 3 lugares:
1. **Resolución de slug**: combinar anon-RLS-filtered select + slug_history para redirects + admin-client para diferenciar paused-vs-404.
2. **Conflicto con routes existentes**: `/[slug]` es catch-all en raíz. Cualquier path top-level no claimed por otra route cae acá. Next.js prioriza routes explícitas (app/admin/, app/dashboard/, etc.) y archivos estáticos (favicon.ico, robots.txt) — pero hay que verificar que ningún path importante quede atrapado.
3. **Portar el storefront UI** sin perder el diseño que al usuario le gusta, adaptando data shape (de `lib/stores.ts` JSON al row de Supabase).

## Goals / Non-Goals

**Goals**

- `wapy.com.ar/{slug}` resuelve a la storefront real desde DB para stores `published`.
- `wapy.com.ar/{slug-viejo}` redirige 301 a `wapy.com.ar/{slug-actual}` via `slug_history`.
- `wapy.com.ar/{slug-de-paused}` muestra maintenance page.
- `wapy.com.ar/{slug-no-existe}` muestra 404 con CTA "armá tu tienda en Wapy".
- Storefront mantiene el diseño que ya hicimos: hero con logo + nombre, sections nav, product cards, cart drawer, "Comprar" → WhatsApp pre-armado.
- Footer "Hecho con Wapy" en todas las storefronts.
- Cleanup del demo hardcodeado y subdomain routing.

**Non-Goals**

- Server-side caching custom (cacheTag/cacheLife). Default Vercel CDN headers son suficientes para MVP.
- `next/image` optimization (opcional — se hace si trivial, sino post-MVP).
- Analytics y tracking → post-MVP.
- SEO advanced (sitemap, structured data) → post-MVP; sí incluimos meta tags básicos via `generateMetadata`.
- Edición de productos / cart desde lado público → no, los pedidos van por WhatsApp.
- Multi-idioma → todo en español.

## Decisions

### 1. Routing: catch-all `/[slug]` en raíz, Next.js maneja la precedencia

`app/[slug]/page.tsx` es dynamic route en raíz. Next.js prioriza:

1. Rutas estáticas: `/`, `/admin`, `/dashboard`, `/signup`, `/login`, `/forgot-password`, `/reset-password`, `/onboarding`, `/onboarding/[step]`, `/dashboard/[section]`, `/api/auth/logout` → estos PEGAN antes que `/[slug]`.
2. Archivos en raíz: `favicon.ico`, `apple-icon.png`, `icon.png`, `robots.txt`, etc. → manejados por Next.js antes de routing.
3. `/[slug]` catch-all → para cualquier otro path top-level.
4. La tabla `reserved_slugs` en DB ya bloquea que un owner reclame un slug que coincida con una ruta del sistema. Defense in depth — si por error apareciera una ruta nueva que no está en `reserved_slugs`, el route Next.js sigue tomando precedencia visualmente; el problema es solo que el owner tenga un slug que no sirve (la página existe pero su tienda no se ve ahí).

**Verificación**: al ship Fase 6, hay que verificar manualmente que `/admin`, `/dashboard`, `/signup`, `/login` siguen funcionando y NO disparan el catch-all.

### 2. Resolución de slug: 3-step waterfall

`lib/storefront/resolve.ts` exporta `resolveStoreSlug(slug: string)` que devuelve uno de 4 estados:

```ts
type Resolution =
  | { kind: 'render', store: Store, sections: Section[], products: Product[] }
  | { kind: 'redirect', toSlug: string }
  | { kind: 'maintenance', store: Pick<Store, 'name' | 'logo_url' | 'theme'> }
  | { kind: 'not_found' }
```

Implementación:

```ts
async function resolveStoreSlug(slug: string): Promise<Resolution> {
  const anon = createAnonClient()  // SSR-safe anon client

  // Step 1: try direct match on published stores
  const { data: pub } = await anon.from('stores').select('...').eq('slug', slug).maybeSingle()
  if (pub) {
    const sections = await anon.from('sections').select('...').eq('store_id', pub.id).eq('is_active', true).order('position')
    const products = await anon.from('products').select('...').eq('store_id', pub.id).eq('is_active', true).order('position')
    return { kind: 'render', store: pub, sections, products }
  }

  // Step 2: try slug_history for 301 redirect
  const { data: hist } = await anon.from('slug_history').select('store_id').eq('old_slug', slug).maybeSingle()
  if (hist) {
    const { data: current } = await anon.from('stores').select('slug, status').eq('id', hist.store_id).maybeSingle()
    if (current && current.status === 'published') {
      return { kind: 'redirect', toSlug: current.slug }
    }
    // If the store was paused or deleted after rename, fall through to step 3
  }

  // Step 3: admin client to differentiate paused vs not found
  const admin = createAdminClient()
  const { data: any } = await admin.from('stores').select('name, logo_url, theme, status').eq('slug', slug).maybeSingle()
  if (any && any.status === 'paused') {
    return { kind: 'maintenance', store: any }
  }
  // Also try via slug_history → admin → paused
  if (hist) {
    const { data: histStore } = await admin.from('stores').select('name, logo_url, theme, status').eq('id', hist.store_id).maybeSingle()
    if (histStore?.status === 'paused') {
      return { kind: 'maintenance', store: histStore }
    }
  }

  return { kind: 'not_found' }
}
```

**Notas**:
- Anon client en Server Components: usar `createServerClient()` de `@supabase/ssr` o `createClient` de `@supabase/supabase-js` con anon key. Si SSR cookies se complican (no hay user logueado), preferir el simple `createClient(URL, ANON_KEY)`.
- El page server component invoca el resolver, switch sobre `kind`:
  - render → pasa data a `<StoreClient>`.
  - redirect → `redirect(`/${toSlug}`, 'permanent')` (Next.js redirect API).
  - maintenance → renderiza `<MaintenancePage>`.
  - not_found → `notFound()` (dispara `app/[slug]/not-found.tsx`).

### 3. Storefront UI: port + adapt, no rewrite

El `app/store/[slug]/StoreClient.tsx` actual tiene ~600 líneas de UI ya pulida (carrousel de productos por sección, cart drawer animado, total en pesos formateado, botón "Comprar" que arma mensaje WhatsApp). Lo portamos a `app/[slug]/StoreClient.tsx` con los siguientes cambios:

- **Data shape**: en lugar de tomar el JSON de `lib/stores.ts` (forma `{ name, sections: [{ items: [...]}] }`), recibe props tipadas desde Supabase: `store: StoreRow`, `sections: SectionRow[]`, `products: ProductRow[]`. Re-asemblamos la estructura agrupada `[section, products[]]` en el server component antes de pasarla.
- **Imágenes**: `lib/stores.ts` usaba `imageUrl` (string). Supabase `products.image_urls` es `text[]`. Tomamos `image_urls[0]` como hero del producto. Si vacío, placeholder.
- **Accent color**: `lib/stores.ts` usaba un solo color hardcoded. Supabase store.theme.accent_color es dinámico. CSS variable inyectada en el wrapper `<div style={{ '--accent': store.theme.accent_color ?? '#22c55e' }}>` y referenciada como `var(--accent)` en clases (con `[var(--accent)]` Tailwind arbitrary).
- **WhatsApp number**: `lib/stores.ts` tenía `whatsappNumber` (string). Supabase `store.whatsapp_number` es nullable. Si null → botón "Comprar" muestra error "El comercio no configuró WhatsApp aún". Si presente → genera `wa.me/{number}?text={mensaje pre-armado}`.

### 4. MaintenancePage: minimalista con branding de la tienda

`app/[slug]/MaintenancePage.tsx`:
- Server Component.
- Recibe `store: { name, logo_url, theme }`.
- Render: hero centrado con logo (si existe) o iniciales del nombre + texto "{name} está en mantenimiento" + subtexto "Estamos haciendo cambios, volvemos pronto" + footer Wapy.
- Usa el `accent_color` para el botón "Volver a Wapy" → link a `wapy.com.ar`.

### 5. 404 page customizada

`app/[slug]/not-found.tsx`:
- Hero con el mascot/logo de Wapy + texto "Esta tienda no existe (todavía)" + CTA "Armá tu tienda gratis en Wapy" → link a `/signup` (o landing).
- Esta page se activa cuando el server component llama `notFound()`.

### 6. Footer "Hecho con Wapy"

`app/components/WapyFooter.tsx`:
- Server Component, no props.
- Render: línea horizontal sutil + texto chico "Hecho con ✨ [Wapy](https://wapy.com.ar)" centrado en footer.
- Importado por `StoreClient`, `MaintenancePage`, `not-found.tsx`.

### 7. Subdomain routing: removido de proxy.ts

El `proxy.ts` actual tiene lógica para `xxx.localhost:3000` → rewrite a `/store/xxx/`. Esto era para el demo. En Fase 6:

- Removemos `ROOT_DOMAINS`, `getSubdomain`, y el bloque de rewrite al comienzo del handler.
- Mantenemos solo la lógica de auth gate (`PROTECTED_PREFIXES`).
- `proxy.ts` queda con ~50 líneas — más simple.

**Reverse compat**: cualquier link viejo a `demo.localhost:3000` deja de funcionar. No es un problema: era solo para dev, nunca se usó en prod (no había wildcard DNS configurado).

### 8. Borrado de demo: 3 archivos + 1 dir + 1 file en lib/

- `app/store/[slug]/StoreClient.tsx` — borrar.
- `app/store/[slug]/layout.tsx` — borrar.
- `app/store/[slug]/page.tsx` — borrar.
- `app/store/[slug]/` — directorio vacío, borrar.
- `app/store/` — directorio vacío, borrar.
- `lib/stores.ts` — borrar.

**Importante**: hacer git mv lo más limpio posible para preservar history de `StoreClient.tsx`. Plan:
1. `git mv app/store/[slug]/StoreClient.tsx app/[slug]/StoreClient.tsx` — preserva history.
2. Editar el archivo movido para adaptar a Supabase types.
3. Borrar el resto (`app/store/[slug]/{page,layout}.tsx`, `lib/stores.ts`).

### 9. `NEXT_PUBLIC_DEMO_URL` cleanup

- `app/components/Hero.tsx` — verificar que no quede referencia. Fase 1 sacó el CTA pero quizá quedó la const. Removerla.
- `.env.local.example` — sacar la línea.
- Vercel env: no podemos borrarla nosotros (usuario tiene que hacerlo en dashboard). Documentar en PR description para que la quite.
- `proxy.ts` — ya no se usa.

### 10. SEO meta básico via generateMetadata

`app/[slug]/page.tsx` exporta `generateMetadata`:

```ts
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const resolution = await resolveStoreSlug(slug)
  if (resolution.kind === 'render') {
    const { store } = resolution
    return {
      title: store.name,
      description: store.description ?? `${store.name} — tienda online en Wapy`,
      openGraph: {
        title: store.name,
        description: store.description ?? undefined,
        images: store.logo_url ? [store.logo_url] : undefined,
        type: 'website',
      },
    }
  }
  if (resolution.kind === 'maintenance') {
    return { title: `${resolution.store.name} — En mantenimiento` }
  }
  return { title: 'Esta tienda no existe' }
}
```

**Trade-off**: `generateMetadata` y `page` van a resolver el slug dos veces (una para meta, otra para render). Solución: memoizar con React `cache()` para que segunda llamada use cache de request.

```ts
import { cache } from 'react'
export const resolveStoreSlug = cache(_resolveStoreSlug)
```

### 11. Imágenes: empezamos con `<img>`, opcional next/image post-merge

`next/image` requiere agregar `images.remotePatterns` en `next.config.ts` para permitir el dominio de Supabase Storage (`https://gtiujuarwoatjekmljhn.supabase.co`). Es trivial. Si el storefront se ve bien con `<img>` (como en el demo), lo dejamos así para no agregar surface de bugs. Si performance se nota mal en Lighthouse, migramos post-merge.

Decisión: usar `<img>` (consistente con el demo); next/image si el usuario lo pide específicamente o si encontramos slow LCP en prod.

### 12. Cart state: client-side, no persistido

Como el demo: cart vive en `useState` del cliente. Refresh = se pierde. Persistir en localStorage sería una mejora chica pero out of scope MVP (los pedidos van por WhatsApp inmediatamente, no hay flujo de "guardar carrito para después").

## Risks / Trade-offs

- **Risk**: La query inicial a anon puede ser lenta si hay muchas tiendas (no hay índice especializado en `stores.slug` para queries published). → **Mitigación**: el índice `stores_slug_idx` (Fase 1) cubre lookups por slug. Para MVP con <100 tiendas, performance es trivial.
- **Risk**: 3 queries seriales (stores, sections, products) en el server component agregan latencia. → **Mitigación**: usar `Promise.all` para sections + products (paralelo). Stores tiene que ir primero porque necesitamos el store_id.
- **Risk**: Reserved slugs en DB pueden quedar desincronizados con rutas reales (ej. agregamos una ruta nueva en Fase 7 y olvidamos updatear `reserved_slugs`). → **Mitigación**: documentar en AGENTS.md / CONTRIBUTING. La query Next.js precedence salva visualmente, pero un owner podría reclamar el slug y tener una página rota.
- **Risk**: `generateMetadata` + `page` resuelven 2x. → **Mitigación**: `cache()` de React. Verificado en Next.js docs.
- **Risk**: Borrar `lib/stores.ts` rompe builds si quedó algún import vivo. → **Mitigación**: `grep -r "from '@/lib/stores'"` antes de borrar. Si aparece algo, fix antes.
- **Trade-off**: Sin caching custom de página, cada request hace 3 queries. Para MVP suficiente (~100ms total para tiendas chicas). Si necesitamos optimizar, agregamos `unstable_cache` o Cache Components (Next 16).
- **Trade-off**: El demo viejo de `lib/stores.ts` se pierde permanentemente. → Aceptable: ya está en git history; si algún día necesitamos un demo público real, lo armamos como una tienda real en DB con un owner ficticio.
- **Trade-off**: Cleanup de subdomain routing en `proxy.ts` rompe cualquier link interno que dependía. No hay tales links — confirmado con grep.

## Migration Plan

Sin migración SQL.

**Apply order**:

1. Cleanup primero (commit 1): borrar `lib/stores.ts`, `app/store/`, `NEXT_PUBLIC_DEMO_URL` refs, subdomain routing de `proxy.ts`. Verificar `npm run build` pasa (sin nueva ruta funcional aún — solo cleanup).
2. Implementar resolver + page (commit 2): `lib/storefront/resolve.ts`, `app/[slug]/page.tsx` con resolución completa.
3. Portar StoreClient + MaintenancePage + not-found (commit 3): UI portada del demo.
4. Footer Wapy + meta tags (commit 4): `app/components/WapyFooter.tsx`, `generateMetadata`.
5. Verificación final + tasks.md update.

**Smoke test post-merge** (USER en prod):
1. Login como owner publicado, copiar el link "Ver tienda ↗" del sidebar → debería abrir la storefront real (no 404).
2. Como visitante anon, ir a `wapy.com.ar/{slug-de-tu-tienda}` → debería renderizar.
3. Agregar productos al carrito → click "Comprar" → debería abrir WhatsApp con mensaje pre-armado.
4. Cambiar slug desde dashboard → visitar URL vieja → debería 301 redirigir al nuevo.
5. Pausar tienda → visitar URL → debería ver maintenance page.
6. Visitar `wapy.com.ar/no-existe-este-slug` → 404 con CTA a /signup.

## Open Questions

- **¿`next/image` ahora o post-merge?** Recomendación: post-merge. Migración trivial pero suma surface. El usuario puede pedirlo cuando vea Lighthouse scores en prod.
- **¿LocalStorage persistence del carrito?** Recomendación: NO en MVP. Si los clientes piden "guardar carrito para después" agregamos en futuro.
- **¿Botón "Compartir tienda" en el storefront para que owners compartan facilmente?** Útil pero no MVP. Defer.
- **¿Tracking de "pedido enviado" (al click "Comprar")?** Sería el primer event analítico real. Útil para que el dueño sepa cuántos pedidos genera. Defer post-MVP — requiere armar pipeline de analytics.
