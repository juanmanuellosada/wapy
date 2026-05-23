## Why

Fase 4 dejó al owner en `/dashboard` con un placeholder "🎉 publicada en wapy.com.ar/{slug}" y un botón Editar disabled con "Próximamente Fase 5". Esta fase entrega ese editar: el owner puede modificar cualquier cosa de su tienda (info, imagen, secciones, productos, WhatsApp), pausar la tienda, o renombrarla preservando los links viejos. Es la otra mitad del producto — sin esto, una tienda publicada es estática y los owners no pueden ajustar precios, agregar productos nuevos, ni cambiar de número de WhatsApp.

## What Changes

- **`/dashboard` se vuelve panel real** con sidebar nav (desktop) / top tabs (mobile) y 6 secciones: **Info, Imagen, Secciones, Productos, WhatsApp, Configuración**.
- **Edit panels libres** — el owner navega entre secciones sin orden forzado (a diferencia del wizard de Fase 4). Cada sección tiene su propio submit + autosave on click.
- **Reuso de schemas + actions de `lib/onboarding/`** — los zod schemas y server actions ya son CRUD-capable. Agregamos solo nuevas actions específicas del dashboard (rename slug, toggle status, delete store).
- **Slug rename con confirmación**: input + modal que muestra "wapy.com.ar/{viejo} → wapy.com.ar/{nuevo}" + advertencia "los links viejos se redirigen automáticamente". El trigger `archive_old_slug` (Fase 1) ya inserta en `slug_history`.
- **Toggle "Tienda activa"** en Configuración: switch que cambia `status` entre `'published'` y `'paused'`. Pausada significa que el storefront público (Fase 6) mostrará "En mantenimiento" en vez de productos.
- **Productos**: misma lógica que el wizard pero acceso libre. Click en card → modal de edit (reuso `ProductModal`). Botón "+ Agregar" agrega nuevo.
- **Secciones**: misma lógica que el wizard (drag-sort, agregar inline, borrar). Reuso `SortableList`.
- **Imagen**: re-upload de logo + cambio de color de acento. Mismos componentes que `StepLook`.
- **Link "Ver tienda"** en el footer del sidebar — abre `wapy.com.ar/{slug}` en nueva tab. El link existe pero el storefront real es Fase 6 (en Fase 5 abrirá 404 o el demo placeholder — aceptable hasta Fase 6).
- **`/onboarding` redirect actualizado**: si el owner con store published intenta volver al wizard, se va a `/dashboard` (ya estaba implementado en Fase 4, lo re-verificamos).
- **`/admin` ahora deep-links a `/dashboard` para el superadmin**? No — el superadmin sigue teniendo su propio `/admin` (whitelist mgmt). El superadmin no tiene tienda por design (puede invitarse a sí mismo con `grant_role='owner'` si quiere).

## Capabilities

### New Capabilities
- `owner-dashboard`: las 6 secciones de edit + slug rename + status toggle + delete store. Cubre todas las interacciones post-publicación del owner con su tienda.

### Modified Capabilities

None. La capability `data-model` y `image-upload` no cambian (reusamos lo de Fase 1 y Fase 4). `session-routing` no cambia (el middleware ya protege `/dashboard`).

## Impact

- **Sin migración DB**. El schema actual cubre todo (slug_history ya tiene el trigger desde Fase 1).
- **Sin deps nuevas**. `@dnd-kit`, `react-dropzone`, `react-hook-form` ya están.
- **Nuevo código**:
  - `lib/dashboard/actions.ts` — nuevas server actions: `renameSlug`, `toggleStoreStatus`, `deleteStore`. Las actions de edit (saveBasics, saveLook, etc.) se reusan de `lib/onboarding/actions.ts` pero adaptadas — el wizard incrementa `onboarding_step`, el dashboard NO (la tienda ya está publicada, no hay step que avanzar). Decisión: extraer los UPDATE puros a `lib/store/actions.ts` y que ambos (wizard + dashboard) los usen.
  - `app/dashboard/page.tsx` — **reemplaza** el placeholder. Server Component que carga la store del owner y renderiza el layout con sidebar.
  - `app/dashboard/[section]/page.tsx` — dynamic route por sección (`info`, `image`, `sections`, `products`, `whatsapp`, `settings`).
  - `app/dashboard/components/Sidebar.tsx` — sidebar nav con "Ver tienda" + logout.
  - `app/dashboard/components/{Info,Image,Sections,Products,Whatsapp,Settings}Panel.tsx` — un componente por sección.
  - `app/dashboard/components/RenameSlugModal.tsx` — modal de confirmación específico.
- **Refactor**: extraer las server actions de edit puro de `lib/onboarding/actions.ts` a `lib/store/actions.ts` (compartidas con dashboard). Las actions específicas del wizard (con `onboarding_step` increment) se quedan en `lib/onboarding/`.
- **Reuso de UI components**: `app/onboarding/components/{ProductModal,ImageUpload,LogoUploader,SortableList}.tsx` → mover a `app/store/components/` o `app/components/store/` para que ambos /onboarding y /dashboard los importen sin cross-feature dependency. Decisión final en design.

## Out of scope (futuro)
- Analytics (clicks, vistas, etc.) → post-MVP cuando haya métricas reales.
- Múltiples tiendas por owner → post-MVP, requiere refactor del schema.
- Bulk import / export de productos (CSV) → post-MVP.
- Variantes de producto (talles, colores) → post-MVP.
- Programación de cambios ("publicar este producto a las 9am") → post-MVP.
- Notificaciones in-app para el owner → post-MVP.
- Delete store: lo incluimos en Configuración con confirmación fuerte (typing del slug). Borra cascading toda la data + storage files.
