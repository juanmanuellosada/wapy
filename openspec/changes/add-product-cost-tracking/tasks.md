## 0. Prerequisito

- [x] 0.1 Verificar el estado de la migración `038` en producción — verificado 2026-09-11 contra la base: está aplicada (`orders.deleted_at`, su índice y el filtro de borrados en `storefront_top_sellers` y `storefront_co_purchased`). No bloquea a `041`.

## 1. Migración

- [x] 1.1 Crear `041_product_cost.sql` con cabecera comentada siguiendo la convención de `035_product_price_tiers.sql`, referenciando el `design.md` de este change
- [x] 1.2 `products.cost_cents int NULL CHECK (cost_cents IS NULL OR cost_cents >= 0)`
- [x] 1.3 `product_variants.cost_override int NULL` con el mismo CHECK
- [x] 1.4 `order_items.cost_at_purchase int NULL` con el mismo CHECK, sin backfill (los pedidos anteriores quedan sin costo por diseño)
- [x] 1.5 Dejar anotado en la cabecera que es aditiva y que el rollback es `DROP COLUMN` en las tres
- [x] 1.6 Regenerar `lib/supabase/types.ts` (editado a mano con la misma forma que generaría el CLI — sin acceso a la base para correr `supabase gen types`; migración aún no aplicada)

## 2. Costo efectivo

- [x] 2.1 `resolveEffectiveCost(product, variant?)` en `lib/store/pricing.ts`, con la misma forma que `resolveEffectivePrice`: override de variante, si no el del producto, si no ausente
- [x] 2.2 Tests en `lib/store/pricing.test.ts`: hereda del producto, la variante pisa, sin costo en ningún nivel devuelve ausente, y costo `0` se distingue de ausente

## 3. Carga del costo

- [x] 3.1 Agregar el costo a `ProductInput` y a `saveStoreProduct` (`lib/store/actions.ts`) respetando el patrón `undefined` = no tocar, para que ningún guardado existente borre un costo cargado
- [x] 3.2 Validación en `lib/store/product-validation.ts`: entero, `>= 0`, opcional — sin relación de orden con el precio de venta (vender a pérdida es legítimo y no se bloquea)
- [x] 3.3 Agregar `cost_override` a `updateVariant` (`lib/variants/actions.ts`) con el mismo criterio
- [x] 3.4 Rechazar en el servidor cualquier escritura de costo si la tienda no es Pro
- [x] 3.5 Tests: guardar sin tocar el costo lo preserva; costo negativo se rechaza; costo `0` se guarda; tienda no-Pro es rechazada (los dos primeros cubiertos como tests de validación puras en `product-validation.test.ts`; el gating server-side de `saveStoreProduct`/`updateVariant` no tiene test automatizado — ver nota en el reporte)
- [x] 3.6 `bulkUpdateProducts` (`lib/store/actions.ts`) acepta el costo en el mismo lote — respaldo server-side de la columna de costo de la grilla de edición masiva (6.3), sin el cual esa columna no tiene dónde guardar. Mismo gating y validación que 3.1/3.2/3.4; además, dentro de un lote viaja para todas las filas o para ninguna, para no arriesgar que el upsert en lote complete con NULL las filas que no lo mandaron. Sin test automatizado, mismo criterio que 3.5.

## 4. Snapshot en el pedido

- [x] 4.1 En `createPendingOrder` (`lib/store/orders/actions.ts`), resolver el costo efectivo por línea y guardarlo en `cost_at_purchase` al insertar los ítems
- [x] 4.2 Traer el costo en el fetch de productos/variantes que ya hace la función, sin agregar una query extra
- [x] 4.3 Confirmar que el snapshot se escribe sin importar el plan de la tienda (decisión D6 del design)
- [x] 4.4 Tests: se congela el costo vigente; cambiar el costo después no altera la línea ya creada; producto sin costo crea el pedido igual con la línea en ausente

## 5. Métricas

- [x] 5.1 En `getOrderStats`, sumar sobre la query de ítems que ya existe: `costed_revenue_cents`, `cost_cents`, `profit_cents`, `margin_pct` y `cost_coverage_pct`, calculados solo sobre líneas con costo (decisión D4)
- [x] 5.2 Verificar que el KPI de ingresos existente sigue saliendo de `total_cents` y no cambia de valor
- [x] 5.3 Excluir del cálculo los pedidos borrados y los que no estén `confirmed`/`delivered`, igual que hace hoy el resto de las métricas
- [x] 5.4 Extraer el cálculo de costo/ganancia/margen a un helper que sirva tanto para el agregado del período como para un pedido individual, que lo necesita la exportación
- [x] 5.5 Tests: ganancia con costo completo; ganancia que ignora líneas sin costo; cobertura parcial; cobertura cero; pedidos cancelados y borrados que no aportan

## 5b. Exportación

- [x] 5b.1 Agregar costo, ganancia y margen por pedido a `exportOrdersCsv`, reusando el helper de 5.4
- [x] 5b.2 Ubicar las columnas al final del CSV, sin mover ni renombrar ninguna existente
- [x] 5b.3 Dejar las celdas vacías (no en cero) cuando el pedido no tiene ningún costo congelado
- [x] 5b.4 Incluir las columnas solo para tiendas Pro
- [x] 5b.5 Tests: encabezados previos intactos; pedido sin costo con celdas vacías; tienda no-Pro sin columnas nuevas
- [x] 5b.6 Gatear `getOrderStats` server-side: antes calculaba y devolvía el margen para cualquier plan y dejaba que la UI lo ocultara; ahora una tienda sin `allowCostTracking` recibe el margen "vacío" (mismo shape que cobertura 0) sin importar el costo realmente congelado. Test agregado en `lib/store/orders/actions.test.ts`.

## 6. Interfaz

- [x] 6.1 Campo de costo en `app/components/store/ProductModal.tsx`, junto al precio, con texto de ayuda que aclare que es interno y no se muestra al comprador
- [x] 6.2 Columna de costo en la grilla inline de `app/components/store/VariantsSection.tsx`, con el valor heredado visible como placeholder para que se note que hereda
- [x] 6.3 Columna de costo en `app/dashboard/components/BulkEditGrid.tsx`
- [x] 6.4 Tarjetas de costo, ganancia y margen en `app/dashboard/components/OrdersStats.tsx`, con la cobertura en la misma tarjeta que la ganancia
- [x] 6.5 No renderizar ninguna tarjeta de margen cuando la cobertura es cero
- [x] 6.6 Mostrar costo, ganancia y margen del pedido en su detalle dentro del panel, reusando el helper de 5.4, con el mismo criterio de vacío cuando el pedido no tiene costo congelado
- [x] 6.7 Ocultar campos, tarjetas y margen del detalle cuando la tienda no es Pro

## 7. Gating

- [x] 7.1 Nuevo flag en `PlanLimits` / `PLAN_LIMITS` (`lib/plans/limits.ts`) siguiendo el precedente de `allowBulkProducts`, habilitado solo en `pro` (adelantado desde la tanda de grupos 1-5b porque 3.4 y 5b.4 lo necesitaban para el chequeo server-side; el cableado a UI de 7.2 sigue pendiente)
- [x] 7.2 Pasar el flag desde `app/dashboard/[section]/page.tsx` a los componentes que lo necesiten

## 8. Confidencialidad del costo

- [x] 8.1 Auditar todos los `select` del camino público (`lib/storefront/resolve.ts`, `app/[slug]/`) y reemplazar cualquier `select('*')` sobre `products` o `product_variants` por una lista explícita de columnas — encontrado y corregido un `select('*')` real sobre `products` en `lib/storefront/resolve.ts` que viajaba tal cual como prop a `StoreClient` (client component); `product_variants` ya estaba explícito y además se reconstruye campo a campo antes de llegar al cliente
- [x] 8.2 Confirmar que los ítems enviados a MercadoPago no incluyen costo — verificado en `createPendingOrder`/`mp-client.ts`: `mp_items` solo lleva `title`/`quantity`/`unit_price`/`currency_id`
- [x] 8.3 Test de regresión sobre el payload público serializado —no sobre la query— que falle si aparece cualquier clave de costo (`lib/storefront/resolve.test.ts`)

## 9. Verificación

- [x] 9.1 `npx tsc --noEmit`, `npx vitest run` y `npm run build` (con `--webpack`, no Turbopack)
- [ ] 9.2 Probar en el navegador: cargar costo en un producto con variantes, hacer un pedido, confirmarlo y ver la ganancia con su cobertura
- [ ] 9.3 Verificar con una tienda sin costos que la pantalla de métricas se ve exactamente igual que antes
- [x] 9.4 Aplicar la migración a producción
- [x] 9.4b Regenerar `lib/supabase/types.ts` desde la base ya migrada — las columnas nuevas se escribieron a mano porque la migración todavía no estaba aplicada; regenerado 2026-09-11, diff sin sorpresas (ver reporte)
- [ ] 9.5 Verificar en producción que el HTML de una tienda publicada no contiene ningún dato de costo
