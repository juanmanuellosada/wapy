## 1. Base de datos

- [x] 1.1 Crear `supabase/migrations/040_section_sort_modes.sql`:
  - `ALTER TABLE public.sections ADD COLUMN sort_mode text` con `CHECK (sort_mode IS NULL OR sort_mode IN ('manual','price_asc','price_desc','name_asc','newest','best_selling'))` y un `COMMENT ON COLUMN` que aclare que **NULL = heredar el default de la tienda**, distinto de `'manual'`
  - `ALTER TABLE public.stores ADD COLUMN default_product_sort text NOT NULL DEFAULT 'manual'` con el mismo CHECK sin el NULL
  - `ALTER TABLE public.stores ADD COLUMN out_of_stock_last boolean NOT NULL DEFAULT true`
- [x] 1.2 Verificar que el trigger `prevent_billing_column_writes` (migración 027) no bloquee el UPDATE de las dos columnas nuevas de `stores` — **no las alcanza**: enumera solo las 6 columnas de facturación y además deja pasar todo lo que viene por `service_role`, que es el cliente que usa la acción
- [x] 1.3 Aplicar la migración a Supabase — **aplicada a prod 2026-09-01** (proyecto `gtiujuarwoatjekmljhn`, vía MCP). Verificado: `sections.sort_mode` text nullable sin default, `stores.default_product_sort` text NOT NULL default `'manual'`, `stores.out_of_stock_last` boolean NOT NULL default `true`, y los dos CHECK con los seis valores. Sin backfill: 100 secciones todas en NULL, 7 tiendas todas en `'manual'` y con `out_of_stock_last` en true
- [x] 1.4 Regenerar `lib/supabase/types.ts` y verificar los tres campos nuevos — se editó a mano y después se **contrastó contra el generador real** post-migración: `sections.sort_mode: string | null`, `stores.default_product_sort: string` y `stores.out_of_stock_last: boolean` coinciden exactamente, en la misma posición alfabética y con el mismo tipado en Row/Insert/Update

## 2. Módulo de orden

- [x] 2.1 Crear `lib/storefront/sorting.ts` con el tipo `SortMode` y la constante `SORT_MODES` (id + label en español), única fuente de verdad para la UI y para el parseo
- [x] 2.2 `resolveSortMode(section, store)`: devuelve `section.sort_mode ?? store.default_product_sort`, con fallback a `'manual'` ante cualquier valor desconocido (una fila vieja o corrupta no puede romper el catálogo)
- [x] 2.3 Implementar los seis comparadores. Todos desempatan por `position` asc y después por `id`; `manual` **es** ese desempate. `price_asc`/`price_desc` usan `resolveEffectivePrice` a nivel producto; `name_asc` usa `localeCompare` con locale `es` y `sensitivity: 'base'` (que "Ñandú" y "nandu" ordenen como espera un hispanohablante); `newest` usa `created_at` desc
- [x] 2.4 `best_selling` recibe el ranking de ids ya resuelto; los productos sin ventas van después de todos los que vendieron, entre sí en orden manual
- [x] 2.5 `sortCatalog(products, { sections, store, variantsByProduct, topSellerRank })`: agrupa por `section_id`, ordena cada grupo con su modo efectivo y devuelve el array plano. Los productos sin sección usan el default de tienda
- [x] 2.6 Aplicar la partición por stock antes del comparador cuando `store.out_of_stock_last`, usando `isInStock`
- [x] 2.7 Tests en `lib/storefront/sorting.test.ts` (vitest, como `lib/store/pricing.test.ts`): un caso por modo; herencia NULL → default de tienda; `'manual'` explícito no se ve afectado por el default; promo ordena por el precio con promo; partición de stock combinada con precio ascendente; producto con variantes agotado en todas cuenta como sin stock; estabilidad ante empate de precio; valor de `sort_mode` desconocido cae a manual

## 3. Cableado del storefront

- [x] 3.1 En `app/[slug]/filters.ts`, exportar `isInStock` (hoy privada). No duplicar el predicado — se movió a `lib/storefront/stock.ts` y `filters.ts` la importa de ahí: importar de `app/` hacia `lib/` sería invertir la dirección de las dependencias
- [x] 3.2 En `app/[slug]/page.tsx`, calcular si alguna sección resuelve a `best_selling`; si sí, llamar `getTopSellers(storeId, 30, 500)` y derivar la fila de destacados con `.slice(0, 10)`; si no, dejar la llamada actual. Una sola RPC en los dos casos
- [x] 3.3 Ordenar `resolution.products` con `sortCatalog` antes de pasarlo a `StoreClient`, sin tocar `StoreClient`
- [x] 3.4 Verificar que `visibleProductsBySection` y la grilla plana filtrada heredan el orden, y que el deep-link `?p=<id>` sigue abriendo y resaltando la card correcta — verificado a nivel código: ambas derivan del array con `filter`, que preserva el orden, y el deep-link resuelve por id, no por posición. Falta la pasada en navegador (7.3)

## 4. Dashboard — orden por sección

- [x] 4.1 Sumar `sort_mode` a `SectionDraft` en `SectionsPanel.tsx` y al estado inicial que sale de las filas
- [x] 4.2 Agregar el select de orden en cada fila de sección (top-level y subsección), con la opción "Como en la tienda (X)" para el valor NULL, que muestre cuál es el default heredado
- [x] 4.3 Extender `sectionItemSchema` y `saveStoreSections` en `lib/store/actions.ts` para validar y persistir `sort_mode`; NULL tiene que sobrevivir el viaje y no convertirse en `'manual'`
- [x] 4.4 Verificar que el arrastre de secciones sigue funcionando después del cambio de layout de la fila — el `setNodeRef` y los `listeners` siguen donde estaban (wrapper externo y handle); lo que cambió es que la tarjeta pasó de `flex` a bloque con una fila interna. Falta la pasada en navegador (7.3)

## 5. Dashboard — preferencias de tienda

- [x] 5.1 En `SettingsPanel.tsx`, agregar el select de orden por defecto y el toggle "Mostrar los productos sin stock al final"
- [x] 5.2 Acción `saveCatalogSortPreferences` en `lib/store/actions.ts` con `requireOwnerStore`, validación por Zod contra `SORT_MODES` y `revalidatePath('/dashboard', 'layout')`
- [x] 5.3 Explicar en la UI que el default aplica a las secciones que están en "Como en la tienda", no a las que tienen un orden propio

## 6. Dashboard — arrastre condicionado

- [x] 6.1 En `ProductsPanel.tsx`, resolver el modo efectivo de cada grupo y pasar el resultado al render
- [x] 6.2 Si el grupo no está en manual, renderizar la lista sin `SortableList` y con una nota que diga en qué orden está y dónde se cambia. El `position` guardado no se toca
- [x] 6.3 Actualizar el texto "Podés arrastrarlos para cambiar el orden" para que no prometa algo que en esa sección no aplica

## 7. Verificación

- [x] 7.1 `npx tsc --noEmit` y `npm run build` (con `--webpack`, `next build` a secas usa Turbopack y falla)
- [x] 7.2 `npx vitest run` — los tests nuevos y los existentes de `filters.test.ts`, que tocan el módulo que exporta `isInStock`
- [ ] 7.3 Prueba manual en una tienda con secciones, subsecciones, un producto con promo, uno con variantes y uno agotado: cambiar el modo de una sección, verificar que la tienda refleja el orden nuevo, que el toggle de sin-stock se combina con él, y que volver a manual devuelve el orden arrastrado
