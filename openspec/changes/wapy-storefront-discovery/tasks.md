## 1. Filtros: módulo puro

- [x] 1.1 Crear `app/[slug]/filters.ts` con tipo `CatalogFilters` y defaults
- [x] 1.2 Implementar `parseFiltersFromSearchParams(sp: URLSearchParams | { [k: string]: string | string[] | undefined }): CatalogFilters`
- [x] 1.3 Implementar `serializeFiltersToSearchParams(f: CatalogFilters): URLSearchParams` que omita defaults
- [x] 1.4 Implementar `applyFilters(products: UIProduct[], variantsByProduct: Record<string, VariantBundle>, f: CatalogFilters): UIProduct[]` respetando: precio (usa price o min variant price), secciones (multi), stock (null = disponible, variantes con al menos una activa con stock>0 cuenta)
- [x] 1.5 Tests unitarios mínimos del módulo (parse/serialize round-trip + applyFilters con 3-4 casos) — **NOTA**: tests escritos en `app/[slug]/filters.test.ts` con sintaxis vitest. No hay test runner configurado en el repo (vitest no está en package.json). Para ejecutarlos: `npm install -D vitest` + agregar `"test": "vitest"` a scripts. El archivo está excluido del tsconfig para no romper el build.

## 2. Server Component: hidratación inicial

- [x] 2.1 En `app/[slug]/page.tsx`, leer `searchParams` y derivar `initialFilters` con `parseFiltersFromSearchParams`
- [x] 2.2 Derivar `initialProductId`: tipo string si `searchParams.p` es string y matchea un producto activo del catálogo; sino `null`
- [x] 2.3 Pasar `initialFilters` e `initialProductId` como props a `<StoreClient />`

## 3. StoreClient: sincronización modal ↔ URL

- [x] 3.1 Aceptar nueva prop `initialProductId: string | null` en `StoreClient`
- [x] 3.2 Inicializar `modalProduct` desde `initialProductId` (lookup en `products`) si no es `null`
- [x] 3.3 Crear helper `updateUrl(partial: Partial<UrlState>)` que use `router.replace(buildUrl(...), { scroll: false })`
- [x] 3.4 En `setModalProduct`, sincronizar el query param `p` (set al id o remover si null)
- [x] 3.5 Verificar que `?p=` coexiste correctamente con `?q=`, `?min=`, `?max=`, `?sec=`, `?stock=` (no se pisan)

## 4. StoreClient: highlight + scroll inicial

- [x] 4.1 Agregar estado `highlightedProductId: string | null`
- [x] 4.2 En mount, si `initialProductId` válido: setear `highlightedProductId`, schedular `scrollIntoView` con `requestAnimationFrame` para el id `product-<id>`, y `setTimeout(() => setHighlightedProductId(null), 2000)`
- [x] 4.3 Pasar `isHighlighted` como prop a la card correcta
- [x] 4.4 En `ProductCardClient`, agregar `id={\`product-\${product.id}\`}` al `<article>` y aplicar estilo `box-shadow: 0 0 0 3px {accent}` cuando `isHighlighted`

## 5. Modal: galería de imágenes

- [x] 5.1 Crear componente `app/[slug]/ProductGallery.tsx` (client). Props: `imageUrls: string[]`, `alt: string`, `accentColor: string`
- [x] 5.2 Si `imageUrls.length <= 1`, renderizar `<Image>` único como hoy
- [x] 5.3 Si > 1, mobile: contenedor con `overflow-x-auto`, scroll-snap-x mandatory, cada slide con `scroll-snap-align: start`; dots indicadores debajo siguiendo el scroll position (IntersectionObserver simple)
- [x] 5.4 Si > 1, desktop (≥640px): imagen grande arriba, fila de thumbnails clicables debajo (4-5 visibles), click cambia la imagen activa
- [x] 5.5 Reemplazar el bloque de `<Image>` actual en `ProductModal` por `<ProductGallery>`
- [x] 5.6 Verificar a11y: arrows con `aria-label`, thumbnails con `aria-label="Imagen N de M"`, focus visible

## 6. Modal: slot de productos relacionados

- [x] 6.1 Agregar prop opcional `relatedSlot?: React.ReactNode` a `ProductModal`
- [x] 6.2 Renderizar `{relatedSlot}` después del botón "Agregar al carrito", dentro del scroll del modal
- [x] 6.3 No pasar nada desde `StoreClient` en este change (queda listo para growth)

## 7. CatalogFilters component

- [x] 7.1 Crear `app/[slug]/CatalogFilters.tsx` (client). Props: `filters: CatalogFilters`, `onChange: (next: CatalogFilters) => void`, `sections: SectionLite[]`
- [x] 7.2 Sub-componente: pill row para filtros activos (visible siempre). Cada pill: label + X. "Limpiar todos" si hay 2+
- [x] 7.3 Sub-componente: popover desktop (≥1024px) con controles: input de búsqueda, dos inputs número para precio min/max, checkboxes multi-select de secciones, checkbox "Sólo con stock"
- [x] 7.4 Sub-componente: bottom-sheet mobile (<1024px) con los mismos controles; footer con "Limpiar todos" + "Aplicar" (cierra sheet)
- [x] 7.5 El input de búsqueda existente en el header se mantiene y se sincroniza con `filters.q` (decisión: mantener input en header, sincronizarlo con `filters.q`)

## 8. StoreClient: integración de filtros

- [x] 8.1 Aceptar prop `initialFilters: CatalogFilters`
- [x] 8.2 Reemplazar el `searchQuery` actual por estado `filters: CatalogFilters` (incluye `q`)
- [x] 8.3 Calcular `visibleProducts = applyFilters(products, variantsByProduct, filters)` con `useMemo`
- [x] 8.4 Cuando `filters` cambia: actualizar URL con `serializeFiltersToSearchParams` + `router.replace({ scroll: false })`, preservando `?p=` si está
- [x] 8.5 Renderizar `<CatalogFilters>` después del header de secciones
- [x] 8.6 Si `visibleProducts` está vacío: mostrar mensaje "No encontramos productos con esos filtros" + botón "Limpiar filtros"

## 9. Edge cases y polish

- [x] 9.1 Deep-link a producto eliminado/despublicado: validar en `page.tsx` que `initialProductId` existe en el catálogo activo; si no, pasar `null` a `StoreClient`
- [x] 9.2 Cerrar modal con Escape sigue funcionando (ya implementado, verificar que también remueve `?p=`)
- [x] 9.3 Click fuera del modal sigue cerrando (verificar)
- [x] 9.4 Filtro de stock respeta variantes: producto con todas las variantes en `stock=0` queda fuera de "Sólo con stock"; producto sin variantes y `stock=null` queda dentro
- [x] 9.5 Pill de "Sección" muestra el `name` de la sección (no el id)
- [x] 9.6 Asegurar que `formatARS` se reutiliza en inputs de precio (no formatear el value del input, sólo placeholder/label)

## 10. QA manual (preview deploy)

- [ ] 10.1 Smoke: cargar `/[slug]` sin params → ve catálogo completo, sin modal
- [ ] 10.2 Click en card → modal abre, URL se actualiza a `?p=<id>`, back del navegador NO entra al estado anterior (replace)
- [ ] 10.3 Recargar con `?p=<id>` válido → modal abierto en primer paint, card de fondo con highlight ~2s, scrolleada a la vista
- [ ] 10.4 Recargar con `?p=<id-falso>` → catálogo normal sin error
- [ ] 10.5 Cerrar modal → URL pierde `?p=`, otros params preservados
- [ ] 10.6 Aplicar filtro de precio → URL refleja `?min=&max=`, grid se filtra
- [ ] 10.7 Aplicar combinación de filtros + deep-link → modal abre incluso si el producto está fuera del filtro
- [ ] 10.8 Producto con múltiples `image_urls` → galería navegable en mobile (swipe) y desktop (thumbs/flechas)
- [ ] 10.9 Producto con `image_urls` único → idéntico al render actual
- [ ] 10.10 Variantes: modal sigue mostrando "Elegí una variedad en la card" (no se rompe la integración con variantes)
