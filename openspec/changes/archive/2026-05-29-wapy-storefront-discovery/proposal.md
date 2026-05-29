## Why

El storefront `/[slug]` hoy permite descubrir productos pero le faltan tres palancas de conversión visibles desde el cliente final:

1. **El dueño no puede mandar tráfico a un producto específico**: el modal de detalle existe pero la URL no lo refleja. Pegar la tienda en una story de Instagram obliga al visitante a scrollear y encontrar el producto manualmente.
2. **El modal sólo muestra una imagen** aunque el schema permite múltiples (`products.image_urls text[]`). Una galería ayuda a cerrar la venta sin salir del catálogo.
3. **La búsqueda sólo filtra por nombre client-side**. Con catálogos de 20+ productos, los visitantes piden filtrar por precio y categoría — sin eso, abandonan.

## What Changes

- **Deep-link a producto via `?p=<id>`**: el modal de detalle existente (`StoreClient.tsx:639`) se sincroniza con el query param `p`. Entrar a `/[slug]?p=<id>` directamente abre el modal sobre el catálogo cargado. Cerrar el modal limpia el query param. Si el `<id>` no existe en el catálogo activo, se ignora silenciosamente y se muestra el catálogo normal.
- **Scroll + highlight a la card de fondo**: al abrir un modal desde deep-link, la card del producto en el grid de fondo recibe un highlight visual (ring/glow del accent color por ~2s) y la página scrollea para que esa card quede visible bajo el modal (útil al cerrar).
- **Galería en el modal**: el modal renderiza todas las imágenes de `product.image_urls` (no sólo la primera) con un carrusel simple (swipe en mobile, arrows en desktop). Si hay sólo una imagen, render se mantiene como hoy.
- **Slot reservado para "productos relacionados"**: el modal incluye un contenedor vacío (con prop opcional) debajo del bloque de "Agregar al carrito", listo para que `wapy-storefront-growth` lo llene. En este change no se renderiza nada; sólo queda el hueco estructural.
- **Filtros de catálogo en URL**: además del input de texto actual, se agregan:
  - Rango de precio (`?min=&max=`, en pesos).
  - Multi-select de sección (`?sec=id1,id2`).
  - Checkbox "Sólo con stock" (`?stock=1`). Incluye productos con `stock IS NULL` (sin tracking) como disponibles.
  - El input de texto existente también se persiste como `?q=`.
- **Layout responsive de filtros**: mobile = botón "Filtrar" que abre un panel collapsible bajo el header. Desktop = barra horizontal de "pills" sobre el grid (o sidebar — decisión final va en design.md).
- **Filtros aplicados se reflejan en URL inmediatamente** (replace state, no push) para no ensuciar el historial. La URL es compartible.

## Capabilities

### New Capabilities
- _none_

### Modified Capabilities
- `public-storefront`: agrega deep-link a producto via query param, galería de imágenes en el modal de detalle, slot estructural para "productos relacionados", y filtros de catálogo (precio, sección, sólo stock) persistidos en URL.

## Impact

- **Código afectado**:
  - `app/[slug]/page.tsx` — leer `searchParams` (es Server Component) y pasar `initialProductId` + `initialFilters` a `StoreClient`.
  - `app/[slug]/StoreClient.tsx` — hidratar `modalProduct` desde `initialProductId`, sincronizar `modalProduct ↔ URL` con `router.replace`, hidratar filtros y aplicarlos sobre el set de productos en memoria.
  - Nuevo: `app/[slug]/ProductGallery.tsx` (carrusel para múltiples imágenes dentro del modal existente).
  - Nuevo: `app/[slug]/CatalogFilters.tsx` (UI de filtros + sync con URL).
  - `ProductCardClient.tsx` — soportar `data-product-id` (para scroll/highlight) y prop `isHighlighted`.
- **Datos**: sin migración. Se consume `products.image_urls` y `products.stock` ya existentes, más `sections` ya cargadas via `resolveStoreSlug()`.
- **SEO**: el deep-link `?p=<id>` no genera URLs indexables por sí solo (es query param). Si en el futuro se quiere SEO por producto, requerirá rutas `/[slug]/[product]` — fuera de scope.
- **Performance**: filtros + búsqueda se mantienen client-side sobre el set ya cargado. No hay round-trips nuevos. La sincronización modal↔URL usa `router.replace` (sin re-fetch).
- **Lo que NO se toca**:
  - Modal estructural (ya existe; sólo se extiende con galería y slot).
  - Validación de stock client-side (ya implementada en card, modal y carrito).
  - Stock badges visuales en card ("Sin stock" / "Quedan N") — ya existen.
  - Share por WhatsApp existente (al dueño con orden) — el share viral del cliente a amigos va en `wapy-storefront-growth`.
  - Schema de DB, RLS, Server Actions.
