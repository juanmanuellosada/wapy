---
name: wapy-project-state
description: "Estado actual de Wapy (MVP completado 2026-05-23) — stack, infra, capabilities en producción, y áreas post-MVP."
metadata: 
  node_type: memory
  type: project
  originSessionId: 9367fb09-3813-4586-ab7c-c818d86748d6
---

Wapy es un SaaS donde dueños de tienda crean su catálogo online y el checkout dispara un WhatsApp con el pedido armado al dueño (link `wa.me`, sin API). El usuario es **Juan Manuel Losada** (juanmalosada01@gmail.com), trabaja solo.

Stack y decisiones fundacionales en [[wapy-infra-decisions]].

## 🎉 MVP completado (2026-05-23)

Las 6 fases mergeadas a `main`. Flow end-to-end funcional:

```
superadmin invita mail (vía /admin)
  → owner recibe invite (Resend)
  → /signup?token=... → auto-login
  → /onboarding (wizard 6 pasos con autosave)
  → tienda publicada
  → /dashboard (6 secciones: edit + rename + pause + delete)
  → cliente abre wapy.com.ar/{slug}
  → "Comprar" abre wa.me con pedido pre-armado
```

## Capabilities en producción

| Fase | PR | Capability |
|---|---|---|
| 1 | #1 | infra: 7 tablas + RLS + storage buckets + Resend wired |
| 2 | #5 | auth + whitelist con TTL 7d + middleware en proxy.ts |
| 3 | #6 | /admin: whitelist add/re-invite/remove con auto-send |
| 4 | #7 | /onboarding: 6 steps con autosave, image upload, publish |
| 5 | #8 | /dashboard: 6 secciones, rename slug, pause, delete |
| 6 | #9 | /[slug]: storefront público desde DB, slug_history redirects, maintenance, 404 |

## Rutas en producción

- `/` — landing
- `/signup`, `/login`, `/forgot-password`, `/reset-password` — auth flows
- `/onboarding`, `/onboarding/[step]` — wizard
- `/admin` — superadmin whitelist panel
- `/dashboard`, `/dashboard/[section]` — owner panel
- `/api/auth/logout` — POST handler
- `/[slug]` — storefront público (catch-all en raíz)

## Infra activa

- **Supabase**: project `wapy` (ref `gtiujuarwoatjekmljhn`), org `Juanma's` (id `tdzlasipydzzenzapgxn`), región sa-east-1, Postgres 17. Costo: **$35/mes** ($25 org Pro + $10 compute micro). MCP autorizado. 14 migraciones aplicadas. 0 security advisor warnings.
- **Vercel**: project `wapy` (id `prj_nppHpmiHxjN1Lw286A8AdmJTVDVU`), team `juanmalosada01gmailcoms-projects` (id `team_d1L8JfoUxBmgXdalZGBdF6T6`). Next.js 16, Node 24, Turbopack. MCP autorizado.
- **Resend**: cuenta del usuario, dominio `wapy.com.ar` verificado, from `Wapy <hola@wapy.com.ar>`.
- **NIC.ar + DNS**: `wapy.com.ar` delegado a `ns1.vercel-dns.com` + `ns2.vercel-dns.com`. SSL emitido por Vercel.
- **GitHub**: repo `juanmanuellosada/wapy`.

## Schema actual (post-migración 014)

Tablas en `public`:
- `users` (id ref auth.users, email, role: owner|superadmin)
- `whitelist` (email, grant_role, invite_token con TTL 7d, invited_at, registered_at)
- `stores` (1:1 con users, slug regex+reserved, status: draft|published|paused, description, theme jsonb con accent_color, logo_url, whatsapp_number, onboarding_step, published_at)
- `sections` (FK store_id, name, slug, position, is_active)
- `products` (FK store_id+section_id, name, description, price_cents, currency ARS, stock nullable, image_urls text[] max 5, is_active, position)
- `slug_history` (FK store_id, old_slug unique, changed_at) — trigger `archive_old_slug` BEFORE UPDATE
- `reserved_slugs` (43 entries EN+ES)

Storage buckets: `product-images`, `store-logos`. RLS scope writes a `{store_id}/...`.

## Áreas post-MVP (sugerencias)

Listadas en orden aproximado de valor para el usuario final:

1. **Analytics básico** — tracking de pedidos generados (click "Comprar"), vistas por tienda. Útil para que dueños vean ROI. Idealmente sin pesar (PostHog OSS o tablas propias).
2. **Búsqueda + filtros en storefront** — input de búsqueda + filter por sección/precio. Crítico para tiendas con 50+ productos. **→ Cubierto por change `wapy-storefront-discovery` (propuesto 2026-05-28).**
3. **`next/image` optimization** — agregar `images.remotePatterns` con dominio Supabase. Mejora LCP en mobile (Argentina = mucho mobile).
4. **Variantes de producto** — talles, colores. Schema: tabla `product_variants` con price override. **→ Change `wapy-product-variants` 91/92 (sólo manual QA pendiente).**
5. **SEO avanzado** — sitemap dinámico, structured data (Product schema.org), robots.txt dinámico.
6. **localStorage del carrito** — persistir entre refreshes.
7. **Botón "Compartir tienda"** en dashboard — copia el link + abre WhatsApp/Twitter share intents.
8. **Email templates customizables** en Resend (vs templates inline actuales).
9. **Audit log** en /admin — quién agregó/removió qué, útil cuando haya >1 superadmin.
10. **Bulk import productos (CSV)** — para owners con catálogos grandes que ya tienen una hoja Excel.
11. **Multi-tienda por owner** — refactor schema: `stores.owner_id` deja de ser UNIQUE, dashboard tiene store selector.
12. **Pagos integrados** — MercadoPago, Stripe. Saca la dependencia de WhatsApp como único canal.
13. **Cleanup job de drafts** — borrar `stores` en draft >30d sin actividad.
14. **Custom color picker + theming completo** — para owners que quieren más control.

## Changes archivados 2026-05-29 (customer-facing storefront)

Tres changes implementados, pusheados a `main` y archivados. Specs vivos en `openspec/specs/{public-storefront,product-variants}/spec.md`. Migraciones 025 y 026 aplicadas en Supabase prod.

- **`wapy-storefront-discovery`** — deep-link a producto via `?p=<id>` (modal sync con URL via `router.replace`), galería de imágenes en modal (CSS scroll-snap), slot `relatedSlot` en `ProductModal`, filtros de catálogo (precio, sección, sólo stock) en `CatalogFilters` con persistencia URL, highlight + scrollIntoView de card al deep-link.
- **`wapy-storefront-growth`** — `ShareCartButton` viral (navigator.share + wa.me fallback, sin DB), `TopSellers` automático (RPC `storefront_top_sellers`, últimos 30d confirmed/delivered, render condicional ≥3 productos), `RelatedProducts` por co-pedidos (RPC `storefront_co_purchased`) en el slot del modal. Migración 025 trae las 2 RPCs `SECURITY DEFINER` con validación de `stores.status='published'`.
- **`wapy-product-min-qty`** — `min_quantity` y `qty_step` en `products` (defaults 1/1, CHECK ≥ 1). UI: sub-label "Mín. N, de a M" en card y modal, "-" se transforma en "Quitar" en CartDrawer al llegar al floor. Validación server-side en `createPendingOrder` devuelve `qty_violation` que bloquea checkout y share. Form del dashboard (`app/components/store/ProductModal.tsx`) suma dos inputs. Aplica a nivel producto, NO por variante (decisión de scope).

QA manual de cada change quedó en sus `tasks.md` (grupos 9.x/10.x) bajo `openspec/changes/archive/2026-05-29-*/`.

## Decisiones técnicas notables aprendidas

- **Next.js 16 reemplazó `middleware.ts` por `proxy.ts`** (no pueden coexistir). El auth gate + cookie refresh viven ahí.
- **Stacked PRs en GitHub son complicados** — borrar la BASE branch CIERRA la PR dependiente (no la retargetea). Solo borrar la HEAD branch retargetea. Lesson: mergear secuencial, branch off main después de cada merge.
- **Auto-mode classifier bloquea apply_migration en executor** — orchestrator puede hacerlo directo.
- **Supabase MCP NO expone service_role keys** (by design). User debe copiarlas manualmente al .env.local + Vercel.
- **Vercel MCP es read-mostly + deploy** — no expone add_domain ni DNS management. User configura desde dashboard.
- **Slug uniqueness check real-time** debe ser server action callable by anon (no requireOwner) para que funcione durante signup/onboarding antes de tener store_id.

## CLI no instaladas

- `gh` (GitHub CLI) — usar MCP `mcp__github__*`.
- `vercel` (Vercel CLI) — usar MCP `mcp__plugin_vercel_vercel__*` (read+deploy, no domain mgmt).

## Skills de UI

- `ui-ux-pro-max` commiteada en `.claude/skills/` — usada en todo el frontend del MVP.

## Relacionado

- [[wapy-infra-decisions]] — auth/storage/routing/whitelist fundacionales (2026-05-23).
