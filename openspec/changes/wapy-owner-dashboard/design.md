## Context

Fase 4 dejó al owner en un dead-end: tienda publicada pero sin forma de editar. Esta fase entrega el control room. La complejidad real no está en la UI (la mayoría es replicar formularios del wizard sin el "Siguiente" flow) sino en:

1. **Compartir código entre wizard y dashboard** sin duplicar lógica.
2. **Slug rename** que dispara redirects automáticos via `slug_history` (cosa que ya hicimos a nivel DB en Fase 1 pero nunca usamos en código).
3. **Status toggle published↔paused** que en Fase 6 va a afectar el storefront público.

La constraint clave: el dashboard NO tiene "Siguiente" / orden forzado. Cada sección es un edit panel independiente que persiste al click "Guardar". El sidebar es solo navegación.

## Goals / Non-Goals

**Goals**

- Owner con store published puede editar cualquier campo desde 6 secciones del dashboard.
- Slug rename funciona con confirmación + history automático (sin pérdida de links viejos cuando Fase 6 active los redirects).
- Status toggle entre published y paused.
- Delete store con confirmación fuerte (typing exacto del slug, no solo botón).
- Reuso máximo de componentes y actions de Fase 4 (no duplicar formularios ni schemas).
- Sidebar nav clara con "Ver tienda" link al storefront público (que estará en Fase 6).

**Non-Goals**

- Editor visual / previews live → reuso lo que ya hay en wizard.
- Analytics, métricas, gráficos → post-MVP.
- Multi-store por owner → fuera de scope MVP.
- Bulk operations → fuera de scope.
- Editing de superadmin para otros owners' stores desde /admin → posible en futuro pero no en Fase 5.

## Decisions

### 1. Refactor: extraer "store CRUD actions" a `lib/store/actions.ts`

Hoy `lib/onboarding/actions.ts` mezcla:
- Acciones puras de edit (`saveBasics`, `saveLook`, `saveSection`, `saveProduct`, `saveWhatsapp`)
- Acciones wizard-específicas (`checkSlugAvailable`, `publishStore`, `advanceProductsStep`)

El refactor mueve las puras a `lib/store/actions.ts` (sin lógica de step). El wizard de onboarding sigue siendo dueño de las actions wizard-específicas + llama a las store actions cuando corresponde.

**Cambio adicional**: las store actions ya no incrementan `onboarding_step` por sí solas. Cuando el wizard las usa, antes/después del save hace su propio UPDATE de `onboarding_step`. El dashboard simplemente NO toca `onboarding_step`.

**Alternativa considerada**: parametrizar las actions con `{ advanceStep: boolean }`. Rechazada — sobrecarga conceptual; mejor separar concerns en archivos distintos.

### 2. UI components: extraer a `app/components/store/`

Mover `app/onboarding/components/{ProductModal,ImageUpload,LogoUploader,SortableList}.tsx` → `app/components/store/`. Actualizar imports en `app/onboarding/components/*` para apuntar a la nueva ubicación. Estos componentes pasan a ser compartidos entre `/onboarding` y `/dashboard` sin acoplamiento.

Los Step* (StepBasics, StepLook, etc) quedan en `app/onboarding/components/` — son wizard-specific (tienen "Siguiente" button, validate-before-advance UX). El dashboard usa NUEVOS componentes (`InfoPanel`, `ImagePanel`, etc.) que renderizan los mismos forms pero con "Guardar" estándar.

### 3. Layout: dynamic route `/dashboard/[section]/page.tsx`

Path pattern `/dashboard/[section]` donde `section` ∈ `{ info, image, sections, products, whatsapp, settings }`. `/dashboard` (sin section) redirige a `/dashboard/info` por default. Beneficios:

- Refresh-resistant.
- URL shareable.
- History natural.
- Sidebar Links son cards con `<Link href="/dashboard/{section}">`.

`/dashboard/page.tsx` (sin section) → Server Component que:
1. requireOwner.
2. Carga `getStoreState`. Si `status='draft'` → redirect a `/onboarding`. Si no hay store → redirect a `/onboarding`. Si `status='published' | 'paused'` → redirect a `/dashboard/info`.

`/dashboard/[section]/page.tsx` → carga store + sections + products data + renderiza `<DashboardShell>` con sidebar + el panel correspondiente.

### 4. Sidebar: sticky desktop, drawer mobile

`<Sidebar>` Component recibe `currentSection`. Renderiza:
- Wapy logo arriba (link to `/`).
- 6 nav items: Info, Imagen, Secciones, Productos, WhatsApp, Configuración. Highlight current.
- Divider.
- "Ver tienda ↗" link (target=_blank to `wapy.com.ar/{slug}`).
- "Cerrar sesión" form (POST a /api/auth/logout).

Desktop (`lg:` Tailwind): fixed left, 240px ancho, sticky.
Mobile: drawer slide-in desde left, abierto via hamburger button arriba del content.

Responsive con Tailwind + un client component para el drawer toggle.

### 5. Slug rename: 2-step modal con preview

`SettingsPanel` tiene una sección "Dirección de tu tienda" con:
- Input slug (controlled).
- Botón "Cambiar slug" disabled hasta que el slug nuevo pase `checkSlugAvailable` (reuso server action de Fase 4).
- Click abre `<RenameSlugModal>`:
  - Title: "¿Cambiar el slug de tu tienda?"
  - Body: "Pasás de **wapy.com.ar/{viejo}** a **wapy.com.ar/{nuevo}**. Los links anteriores se redirigen automáticamente, así que la gente que tenga el link viejo igual llega a tu tienda."
  - Buttons: "Cancelar" / "Sí, cambiar"
- Click confirm → server action `renameSlug({ newSlug })` que:
  - requireOwner + verifica que sea su store.
  - Re-check availability (defense in depth).
  - UPDATE `stores SET slug = $newSlug WHERE id = ...`. El trigger `archive_old_slug` (DB) inserta `(old_slug, store_id)` en `slug_history`.
  - revalidatePath.
- UI muestra toast "Slug cambiado" con preview del nuevo URL.

### 6. Status toggle: switch en Settings

`SettingsPanel` tiene un switch "Tienda activa" mostrando `status === 'published'`. Click:
- Si activa → confirmar "¿Pausar tu tienda? Los visitantes verán 'En mantenimiento' en lugar de productos. Podés volver a activarla cuando quieras."
- Si pausada → "¿Volver a publicar tu tienda?"
- Server action `toggleStoreStatus()`: requireOwner → toggle entre `published` ↔ `paused`. Si la store estaba en `draft` no debe estar acá (redirect a /onboarding desde page).
- `published_at` se setea la primera vez que pasa de draft→published (en `publishStore` de Fase 4). Subsequent toggles no lo cambian.

### 7. Delete store: confirmación con typing del slug

`SettingsPanel` al final tiene una "Zona peligrosa" con botón rojo "Eliminar tienda". Click abre modal:
- Title: "Esto es permanente"
- Body: warning explicando que se borran: la tienda, todas las secciones, todos los productos, todas las imágenes (storage). El slug queda libre para que otro lo use.
- Input "Para confirmar, escribí el slug exacto: **{slug}**".
- Botón "Eliminar" disabled hasta que typing matches exactly.
- Click → server action `deleteStore({ confirmSlug })`:
  - requireOwner.
  - Verify confirmSlug === store.slug.
  - Borra storage files: list de product-images/{store_id}/ + store-logos/{store_id}/, batch remove.
  - DELETE FROM stores WHERE id=store.id → cascade borra sections, products, slug_history (via FK).
  - revalidatePath. Redirect a `/onboarding` (que va a redirect a `/onboarding/basics` para empezar fresh).

**Risk**: usuario borra por accidente. Mitigation: doble confirmación (typing + click) + mensajes claros + irrevocable.

### 8. Edit panels: misma estructura, distintas tablas

Cada `<*Panel>` es Client Component con `react-hook-form` + zod del schema correspondiente. Submit llama a `lib/store/actions.ts`. Differencias entre paneles:

| Panel | Schema | Action | UI |
|---|---|---|---|
| InfoPanel | `basicsSchema` (sin slug — slug está en Settings) | `saveStoreBasics` | name, description |
| ImagePanel | `lookSchema` | `saveStoreLook` | logo upload + 6 swatches |
| SectionsPanel | `sectionsSchema` | `saveStoreSections` (batch) | SortableList |
| ProductsPanel | `productsSchema` | `saveStoreProduct` (per-product) + delete | ProductModal cards |
| WhatsappPanel | `whatsappSchema` | `saveStoreWhatsapp` | input E.164 |
| SettingsPanel | varias actions | rename/pause/delete | composite |

Nota: el slug se edita en Settings, no en Info, porque tiene confirmation flow distinto.

### 9. Reuso de los componentes ProductModal, ImageUpload, LogoUploader, SortableList

Estos cuatro se mueven a `app/components/store/` (no `app/onboarding/components/`). Wizard y Dashboard ambos importan desde ahí. Sin cambios funcionales — solo movimiento + re-import.

Esto es un refactor: el commit debería ser separado de la implementación nueva del dashboard para que el diff sea legible.

### 10. Slug rename trigger ya existente: no requiere código nuevo

El trigger `archive_old_slug` (de migración 009 de Fase 1) ya hace el INSERT en `slug_history` automáticamente cuando UPDATE de stores.slug. Verificable con `SELECT * FROM slug_history` después del primer rename.

El consumer (storefront público que usa slug_history para resolver redirects) es Fase 6. Acá solo confirmamos que el trigger funciona y la data se acumula bien.

### 11. Live preview link en sidebar: anchor a wapy.com.ar/{slug}

`<Sidebar>` muestra "Ver tienda ↗" con link target=_blank a `${NEXT_PUBLIC_APP_URL}/${slug}`. Cuando se mergee Fase 6, este link va a funcionar. Hasta entonces, abre 404 (o el demo viejo si el slug coincide con "demo-shop"). Aceptable — el link existe y queda preparado.

## Risks / Trade-offs

- **Risk**: El refactor de mover componentes a `app/components/store/` rompe imports del wizard si algo se desincroniza. → **Mitigación**: hacer el refactor como commit 1 separado. Si rompe build, fix antes de seguir.
- **Risk**: Delete store irrecuperable. Si el owner se equivoca borra TODO (incluyendo imágenes en storage que son grandes). → **Mitigación**: doble confirmación + typing del slug + advertencia visual fuerte. Aceptable; no implementamos soft-delete porque sin un panel admin de "restaurar tiendas" no aporta.
- **Risk**: Slug rename en uso por bots/scrapers genera 404s temporales mientras propaga el cache. → **Mitigación**: slug_history + 301 redirect en Fase 6 resuelve. En Fase 5 (sin Fase 6 aún) el rename es bastante seguro porque el storefront público todavía no existe.
- **Risk**: El owner pausa la tienda, los visitantes existentes con la URL en bookmark ven "En mantenimiento". → **Aceptable**: es exactamente el comportamiento deseado. Mostrar "agotado en todos los productos" sería confuso.
- **Trade-off**: 6 secciones separadas significa más navegación para hacer cambios menores. → **Aceptable**: cada sección tiene contenido suficiente para justificar su espacio. Single-page sería claustrofóbico.
- **Trade-off**: Reuso de schemas/actions del wizard significa que cambios al schema (ej. agregar variantes de producto en futuro) propagan automáticamente al dashboard. → **Beneficio**, no risk.

## Migration Plan

Sin migración SQL.

**Smoke test post-implementación** (local):
1. Como owner publicado (que ya hizo el wizard): login → `/dashboard` debería redirect a `/dashboard/info`.
2. Editar info: cambiar name o description → Guardar → toast OK → recargar la página → verificar persistido.
3. Editar imagen: subir logo nuevo → cambiar color de acento → Guardar.
4. Editar secciones: agregar una, borrar otra, reordenar drag → Guardar.
5. Editar productos: editar uno existente, agregar uno nuevo, borrar uno.
6. Editar whatsapp: cambiar número → Guardar.
7. Settings: cambiar slug → confirmación modal → confirmar. Verificar en DB `slug_history` tiene el row.
8. Settings: pausar tienda → status='paused' en DB. Re-activar.
9. Settings: delete store (en una tienda de prueba) → typing del slug → confirmar. Verificar tienda + sections + products borrados + storage limpio.
10. Click "Ver tienda" en sidebar → abre nueva tab a `wapy.com.ar/{slug}` (404 por ahora; Fase 6 lo arregla).

## Open Questions

- **¿La sección "Productos" del dashboard debe permitir cambiar `is_active` per-product?** Útil para "agotado temporalmente" sin borrar el producto. Recomendación: SÍ, agregar toggle visible en cada card. Es trivial — el campo ya existe.
- **¿Mostrar `created_at` y `published_at` en algún lado del dashboard?** Útil para context. Recomendación: SÍ, en Settings, sección "Datos de la tienda" read-only.
- **¿Permitir cambiar `accent_color` desde una sección distinta de Imagen?** Actualmente en Imagen junto con logo. Si separamos podría confundir. Recomendación: dejarlo en Imagen.
- **¿"Despublicar" (pasar a draft de nuevo) vs solo "pausar"?** Recomendación: solo pause/published toggle. "Volver a draft" implica que pueda volver a hacer el wizard, lo cual es más complejo. Si necesita rehacer, mejor delete + create de cero.
