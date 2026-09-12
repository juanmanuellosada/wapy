## 0. Prerequisito

- [ ] 0.1 Tener `add-product-cost-tracking` implementado y desplegado: este change usa `order_items.cost_at_purchase` y `resolveEffectiveCost`

## 1. Migración

- [ ] 1.1 Crear `043_manual_sales.sql` con cabecera comentada, referenciando el `design.md` de este change
- [ ] 1.2 Ampliar el CHECK de `orders.channel` a `('whatsapp','mercadopago','manual')`
- [ ] 1.3 `orders.sold_at timestamptz NOT NULL DEFAULT now()` con backfill `UPDATE orders SET sold_at = created_at`
- [ ] 1.4 `orders.stock_applied boolean NOT NULL DEFAULT true` (el default describe el comportamiento de todos los pedidos existentes)
- [ ] 1.5 Índice `(store_id, sold_at)` que sirva a las consultas de métricas y al filtro por fecha
- [ ] 1.6 Anotar en la cabecera que el rollback del CHECK exige que no queden filas con `channel = 'manual'`
- [ ] 1.7 Regenerar `lib/supabase/types.ts`

## 2. Migración de `created_at` a `sold_at`

- [ ] 2.1 Barrer el módulo de pedidos buscando `created_at` y cambiar a `sold_at` todo lo que responda "cuándo pasó el negocio": `getOrderStats`, `getRangeStart`, el bucketing por día en zona de Argentina, los filtros de fecha de `fetchFilteredOrders` y `exportOrdersCsv`
- [ ] 2.2 Dejar en `created_at` lo que responda "cuándo se cargó el registro" (auditoría y orden por default del listado)
- [ ] 2.3 Test: una venta con fecha pasada cae en el día correcto de `revenue_by_day`
- [ ] 2.4 Test de no-regresión: las métricas de un rango con pedidos preexistentes dan los mismos valores que antes del cambio

## 3. Creación de la venta manual

- [ ] 3.1 Server action de registro manual con admin client (necesario por el trigger `prevent_order_payment_column_writes`), verificando ownership de la tienda y que los productos referenciados sean suyos
- [ ] 3.2 Asignar número con el RPC `next_order_number`, crear en `confirmed` con `payment_status = 'approved'` y `channel = 'manual'`
- [ ] 3.3 Soportar líneas de catálogo (producto o variante, con precio y costo efectivos precargados) y líneas sueltas (`product_id` nulo, nombre/precio/costo a mano)
- [ ] 3.4 Calcular el total server-side a partir de las líneas, sin confiar en el total enviado, y sin pisar los precios que el dueño haya ajustado (decisión D6)
- [ ] 3.5 Validaciones: al menos una línea, cantidades positivas, precios `>= 0`, fecha no futura, línea suelta con nombre y precio obligatorios
- [ ] 3.6 Descontar stock solo si el checkbox viene activado, y guardar el resultado en `stock_applied`
- [ ] 3.7 Rechazar en el servidor si la tienda no es Pro
- [ ] 3.8 Tests: venta de catálogo; venta con línea suelta; venta mixta; total recalculado; fecha futura rechazada; sin líneas rechazada; producto de otra tienda rechazado; tienda no-Pro rechazada

## 4. Stock y reposición

- [ ] 4.1 Hacer que `replenishOrderStock` consulte `stock_applied` y no reponga nada cuando es `false` — la guarda va en el helper compartido, no en cada caller
- [ ] 4.2 Verificar que cancelar y borrar una venta manual con descuento activado repone correctamente
- [ ] 4.3 Tests: cancelar sin descuento no repone; borrar sin descuento no repone; cancelar con descuento repone una sola vez; las líneas sueltas no tocan stock

## 5. Interfaz

- [ ] 5.1 Formulario de alta de venta manual: fecha (default hoy), cliente opcional, notas, líneas con buscador del catálogo y opción de línea suelta, checkbox de stock prendido por default
- [ ] 5.2 Mostrar el total calculado en vivo mientras se cargan las líneas
- [ ] 5.3 Botón de alta en `app/dashboard/components/OrdersPanel.tsx`, visible solo en Pro
- [ ] 5.4 Tercer valor en el filtro de canal y badge propio para el canal manual
- [ ] 5.5 Que el detalle del pedido muestre la fecha de venta cuando difiere de la de carga, para que no parezca un error

## 6. Gating

- [ ] 6.1 Flag de plan para la carga manual en `lib/plans/limits.ts`, habilitado solo en `pro`
- [ ] 6.2 Pasar el flag desde `app/dashboard/[section]/page.tsx` al panel de pedidos

## 7. Integridad con lo existente

- [ ] 7.1 Test que fije que los crons de expiración no tocan ventas manuales, para que un futuro cambio de filtro no lo rompa en silencio
- [ ] 7.2 Verificar que la venta manual aparece correctamente en `exportOrdersCsv`, en la búsqueda y en el conteo de backlog
- [ ] 7.3 Verificar que las ventas manuales aportan al top de productos y al desglose por sección, y que las líneas sueltas caen en un grupo "sin sección" con una etiqueta clara

## 8. Verificación

- [ ] 8.1 `npx tsc --noEmit`, `npx vitest run` y `npm run build` (con `--webpack`, no Turbopack)
- [ ] 8.2 Probar en el navegador: cargar una venta con fecha de la semana pasada y verificar que cae en el día correcto del gráfico
- [ ] 8.3 Probar el checkbox de stock en ambos sentidos, incluyendo cancelar después
- [ ] 8.4 Comparar las métricas de un rango antes y después de aplicar la migración para confirmar que ningún número se movió
- [ ] 8.5 Aplicar la migración a producción
