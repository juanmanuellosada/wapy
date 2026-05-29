## Context

El storefront en `app/[slug]/` está construido como Server Component (`page.tsx`) que resuelve la tienda via `resolveStoreSlug()` y serializa todo el catálogo a un Client Component (`StoreClient.tsx`). El catálogo entero (productos, secciones, variantes) vive en memoria del cliente desde el primer paint — la búsqueda y futuros filtros operan sobre ese set, sin round-trips.

El modal de detalle de producto ya existe (`StoreClient.tsx:639` — `ProductModal`) y se abre por click en imagen o nombre de card (`ProductCardClient.tsx:266,297`). El estado del modal vive en `StoreClient` como `const [modalProduct, setModalProduct] = useState<UIProduct | null>(null)` (`StoreClient.tsx:1417`). El modal renderiza una imagen única (no galería), aunque `products.image_urls` es `text[]`.

La búsqueda actual es un input de texto que filtra client-side por normalización del nombre (`StoreClient.tsx:189-198, 269-287`). No hay filtros estructurados ni persistencia en URL.

Sin librería de routing extra: usar `useRouter`, `usePathname`, `useSearchParams` de `next/navigation`.

## Goals / Non-Goals

**Goals:**
- Reflejar el modal abierto en la URL como `?p=<id>` y permitir deep-link desde stories/posts.
- Extender el modal existente con galería de imágenes y un slot estructural para "productos relacionados", sin reescribirlo.
- Sumar filtros de catálogo (precio, sección, sólo stock) operando client-side sobre el set ya cargado, con estado persistido en URL.
- Que `?q=`, `?min=`, `?max=`, `?sec=`, `?stock=`, `?p=` puedan coexistir en la URL y todas se hidraten al cargar la página directo.

**Non-Goals:**
- Búsqueda server-side / Postgres full-text — el catálogo es pequeño y vive en cliente.
- Rutas dedicadas por producto (`/[slug]/[product]`) — fuera de scope; el deep-link queda como query param.
- Productos relacionados, "lo más pedido", share viral — van en `wapy-storefront-growth`.
- Cambios al modelo de stock o variantes.
- Cambios al estilo visual del modal (sigue con el look actual; galería se inserta en el slot de imagen).

## Decisions

### D1. Sincronización modal ↔ URL: `router.replace` con scroll preservado

`StoreClient` (client) usa `useSearchParams()` para leer `p` al montar, y dispara `setModalProduct` si el id existe en el catálogo. Toda mutación del modal (`onOpenModal`, `onClose`) llama a `router.replace(buildUrl({ p: nextId }), { scroll: false })` para no ensuciar el historial ni hacer scroll automático.

**Por qué `replace` y no `push`**: el historial del navegador no debe llenarse con cada apertura/cierre de modal; el back del browser sale de la tienda como antes. Si el visitante llega via deep-link, el back va al referrer.

**Alternativa descartada**: usar pathname `/[slug]/p/[id]` con `next/link`. Pro: indexable, accesible sin JS. Contra: requiere ruta paralela, breaks SSR del catálogo (cada producto re-fetch), y el visitante ya está en una SPA-like que carga todo en cliente. No vale el costo ahora.

### D2. Hidratación desde `searchParams` en el Server Component

`page.tsx` (Server Component) lee `searchParams` y los pasa como props iniciales a `StoreClient`:

```ts
// page.tsx
const initialFilters = parseFiltersFromSearchParams(searchParams);
const initialProductId = typeof searchParams.p === "string" ? searchParams.p : null;
// validar que initialProductId existe en el catálogo antes de pasarlo
```

`StoreClient` usa estos como `useState` initial value. Después, el sync ↔ URL ocurre 100% en cliente. Esto evita el flash de "modal cerrado → modal abierto" en el primer paint.

### D3. Highlight de la card al deep-link

Cuando `StoreClient` monta con `initialProductId` válido:
1. Abre el modal con ese producto.
2. Setea un estado `highlightedProductId` con timeout de 2s.
3. La card identifica si es la highlighteada (prop `isHighlighted`) y aplica un ring CSS con el accent color (`box-shadow: 0 0 0 3px {accent}`).
4. Antes de aplicar el highlight, ejecuta `document.getElementById(\`product-\${id}\`)?.scrollIntoView({ block: "center", behavior: "instant" })` para que la card quede visible al cerrar el modal.

**Por qué con `scrollIntoView` y no programmatic scroll**: simple, sin medir offsets, funciona en mobile y desktop. `behavior: "instant"` porque el modal ya está cubriendo la vista; el scroll es preparatorio.

### D4. Galería de imágenes en el modal

Componente nuevo `ProductGallery` que:
- Si `image_urls.length <= 1`, renderiza igual que hoy (`<Image>` cubriendo el slot).
- Si `image_urls.length > 1`:
  - Mobile: scroll horizontal con snap (`scroll-snap-type: x mandatory`), dots indicadores debajo.
  - Desktop: misma imagen grande + thumbnails clicables en una fila debajo (o flechas laterales).
  - Sin librería extra. CSS scroll-snap nativo.
- Estado local del índice activo, sin sync con URL (el `?p=` ya identifica el producto; la imagen activa no necesita ser deep-link).

**Por qué CSS scroll-snap y no carousel lib**: keep dependencies tight; el feature es chico.

### D5. Slot de productos relacionados

`ProductModal` recibe una nueva prop opcional `relatedSlot?: React.ReactNode`. En este change, `StoreClient` no le pasa nada → el slot no renderiza. En `wapy-storefront-growth`, se pasará un componente `RelatedProducts` que reciba `product.id` y dispare la query/lookup.

**Por qué slot y no fetch propio dentro del modal**: el modal es un componente de presentación; el data-fetching de relacionados es responsabilidad de quien orquesta (StoreClient). Permite que growth haga la query centralizada en page.tsx (server) y la pase como prop.

### D6. Modelo de filtros: estado único + serializadores

Estado en `StoreClient`:

```ts
type CatalogFilters = {
  q: string;
  priceMin: number | null;   // pesos (entero)
  priceMax: number | null;   // pesos (entero)
  sectionIds: string[];
  inStockOnly: boolean;
};
```

Helpers puros en un módulo nuevo `app/[slug]/filters.ts`:
- `parseFiltersFromSearchParams(sp): CatalogFilters`
- `serializeFiltersToSearchParams(f): URLSearchParams`
- `applyFilters(products, f): UIProduct[]`

`applyFilters` debe respetar variantes: un producto está "en stock" si alguna variante activa lo está, o si `stock IS NULL` (sin tracking).

### D7. UI de filtros: pill row + drawer mobile

- Desktop (≥1024px): fila de pills debajo del header (después de las secciones). Cada filtro activo aparece como pill con X para limpiar. Botón "Filtros" abre un popover con los controles completos.
- Mobile (<1024px): botón "Filtros" sticky junto al input de búsqueda. Click abre un bottom-sheet con todos los controles. Aplicar = cerrar sheet.

**Por qué no un sidebar desktop permanente**: el grid de productos es la estrella; un sidebar restaría ancho. Los filtros son acción ocasional, no permanente.

### D8. URL canonization

Cuando un filtro vuelve a su default (ej. `inStockOnly = false`), se elimina del query string. Esto mantiene URLs limpias y comparables:
- `?q=remera&sec=verano` ✅
- `?q=remera&sec=verano&stock=0&min=&max=` ❌

`serializeFiltersToSearchParams` se encarga de omitir defaults.

## Risks / Trade-offs

- **[Riesgo]** Un deep-link a un `?p=<id>` que ya no existe (producto eliminado o despublicado) podría romper la UX → **Mitigación**: si el id no matchea ningún producto activo, ignorar el query param silenciosamente (no abrir modal, no error). El visitante ve el catálogo normal.
- **[Riesgo]** El highlight de la card es invisible si el modal cubre toda la pantalla en mobile → **Mitigación**: el highlight tiene un timeout de ~2s + scrollIntoView preparatorio; queda visible cuando el usuario cierra el modal.
- **[Trade-off]** Filtros client-side no escalan a catálogos enormes (1000+ productos) → **Aceptado**: el target de Wapy son tiendas chicas/medianas. Si en el futuro crecen los catálogos, se introduce un cursor de paginación + server filters.
- **[Trade-off]** El query param `?p=` no es indexable por buscadores como una URL canónica → **Aceptado**: el objetivo es compartir por mensajería (WhatsApp/IG), no SEO. SEO por producto se evalúa por separado.
- **[Riesgo]** Coexistencia de `?p=` con filtros: si un visitante con filtros aplicados clickea un producto que el filtro oculta, ¿se respeta el filtro o se muestra? → **Decisión**: el modal se abre **siempre** que el id matchee un producto del catálogo, independiente de los filtros. Los filtros sólo afectan el grid de fondo.

## Migration Plan

No hay migración de datos. El despliegue es código only:
1. Mergear el PR. Sin feature flag (es UI aditiva: no rompe el comportamiento actual).
2. Verificar manualmente en preview que:
   - Click en card abre modal y la URL se actualiza con `?p=<id>`.
   - Recargar la página con `?p=<id>` abre el modal directo y la card del fondo está visible.
   - Cerrar el modal limpia la URL.
   - Filtros se reflejan en URL y persisten al recargar.
3. Sin rollback complejo: revertir el PR vuelve al estado previo (modal sin sync, sin filtros estructurados).

## Open Questions

- ¿Mantenemos el umbral de "Quedan N" warning en 5 (actual) o lo bajamos a 3 como dice el feature request original? Default: dejar 5; el usuario puede revisar si quiere cambiarlo durante implementación.
- ¿El popover/sheet de filtros tiene un botón "Limpiar todos" además del por-pill? Default: sí, en el footer del sheet/popover.
