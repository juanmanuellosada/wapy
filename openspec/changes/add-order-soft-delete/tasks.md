## 1. Migración

- [x] 1.1 Crear `038_orders_soft_delete.sql` con cabecera comentada, siguiendo la convención de `036_whatsapp_order_lifecycle.sql`
- [x] 1.2 Agregar `orders.deleted_at timestamptz` (nullable, sin backfill: ningún pedido existente nace borrado)
- [x] 1.3 Índice que sirva a las consultas de listado, que siempre filtran por tienda y por no borrado
- [x] 1.4 Reescribir las dos RPCs de `025_storefront_insights_rpcs.sql` para excluir pedidos borrados, conservando el resto de su lógica y su `SECURITY DEFINER`
- [x] 1.5 Regenerar los tipos de Supabase

## 2. Lectura: que los borrados no aparezcan en ningún lado

- [x] 2.1 Filtrar borrados dentro de `fetchFilteredOrders` y `getOrderById`, que son los helpers compartidos — no repetir el filtro en cada caller
- [x] 2.2 Excluirlos de `getOrderStats`, en los KPIs y también en `top_products` y `orders_by_section`
- [x] 2.3 Excluirlos de `getBacklogPendingCount` y de `exportOrdersCsv`
- [x] 2.4 Excluirlos de los dos crons: `expire-orders` y `pending-orders-digest`
- [x] 2.5 Tests: un pedido borrado no aparece en listado, búsqueda, exportación, backlog ni métricas

## 3. Borrado

- [x] 3.1 Server action de borrado individual con verificación de ownership
- [x] 3.2 Reponer stock y devolver el uso del cupón reusando `replenishOrderStock` y `revertCouponUse`, sin reimplementar la lógica
- [x] 3.3 Borrado en lote con el mismo contrato de resultado parcial que `batchUpdateOrderStatus`, y soporte del modo "todos los que coinciden con el filtro"
- [x] 3.4 Tests: borrar repone stock; borrar devuelve el cupón; borrar un ya cancelado no repone dos veces; borrar de otra tienda se rechaza

## 4. Interfaz

- [x] 4.1 Acción de borrar en el detalle del pedido y en la barra de acciones en lote
- [x] 4.2 Confirmación con la cantidad exacta de pedidos afectados, incluyendo el caso de "todos los que coinciden con el filtro" donde el total supera lo visible
- [x] 4.3 Advertencia distinta cuando la selección incluye pedidos entregados, diciendo que se modifica el historial de ingresos y no solo que es irreversible
- [x] 4.4 Limpiar la selección después de borrar

## 5. Verificación

- [x] 5.1 `npx tsc --noEmit`, `npx vitest run` y `npm run build`
- [ ] 5.2 Aplicar la migración a producción
- [ ] 5.3 Verificar en producción que un pedido borrado desaparece del panel y deja de contar en "lo más pedido" de la tienda pública
