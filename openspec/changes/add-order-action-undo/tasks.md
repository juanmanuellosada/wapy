## 1. Migración

- [ ] 1.1 Crear `043_order_action_log.sql` con cabecera comentada, referenciando el `design.md` de este change
- [ ] 1.2 Tabla `order_action_log`: tienda, tipo de acción, momento, autor, `undone_at`, y las entradas afectadas con estado previo (`status`, `cancelled_by`, `deleted_at`) y los flags `stock_restored` / `coupon_reverted`
- [ ] 1.3 Índice que sirva a la consulta de la ventana: por tienda, no deshechas, ordenadas por momento descendente
- [ ] 1.4 RLS con el patrón de tabla hija de `stores` (`auth.uid() IN (SELECT owner_id FROM stores WHERE id = store_id)`) más la policy de superadmin, siguiendo `019_orders.sql:47`
- [ ] 1.5 Anotar que el rollback es `DROP TABLE` y que no toca ninguna tabla existente
- [ ] 1.6 Regenerar `lib/supabase/types.ts`

## 2. Registro de acciones

- [ ] 2.1 Helper que registre una operación a partir de los pedidos efectivamente afectados y sus estados previos, para usar desde los cuatro puntos de acción
- [ ] 2.2 Capturar el estado previo en `updateOrderStatusInternal` **antes** de aplicar los cambios, incluyendo si se llamó a reponer stock y a revertir el cupón (los flags son hechos, no inferencias — decisión D3)
- [ ] 2.3 Capturar lo mismo en `deleteOrderInternal`, contemplando que borrar un pedido entregado no repone stock ni cupón
- [ ] 2.4 Registrar una sola operación por lote en `batchUpdateOrderStatus` y `batchDeleteOrders`, con las entradas de los pedidos aplicados
- [ ] 2.5 Que un fallo al registrar se loguee sin abortar la acción ya aplicada
- [ ] 2.6 Acotar la cantidad de entradas por operación; superado el tope, registrar la operación como no deshacible con su motivo en lugar de guardar una fila enorme
- [ ] 2.7 No registrar nada desde los crons ni desde los webhooks de pago
- [ ] 2.8 Tests: acción individual; lote como una sola operación; solo los pedidos aplicados; flags correctos al cancelar, al borrar un pendiente y al borrar un entregado

## 3. Cambio de contrato de `batchDeleteOrders`

- [ ] 3.1 Devolver también los ids borrados además de `deletedCount`, sin lo cual el borrado en lote no se puede deshacer
- [ ] 3.2 Actualizar el consumidor en `OrdersPanel.tsx` y los tests que afirmen la forma actual del retorno

## 4. Deshacer

- [ ] 4.1 Server action que liste las operaciones deshacibles: últimas 5, no deshechas, dentro de 24h, de la tienda del dueño
- [ ] 4.2 Server action de deshacer, que verifique ownership y recorra las entradas de la operación
- [ ] 4.3 Por cada entrada, verificar que el pedido siga exactamente como lo dejó la acción (`status` y `deleted_at`); si cambió, saltear con motivo `modified_since` (decisión D2)
- [ ] 4.4 Restaurar estado, limpiar el timestamp que la acción escribió y restaurar `cancelled_by` y `deleted_at` — escribiendo con el admin client, sin pasar por `ALLOWED_TRANSITIONS` (decisión D4)
- [ ] 4.5 Revertir efectos según los flags registrados: volver a descontar stock reusando `deductOrderStock` (hoy privada del módulo, `:1448`) y volver a contar el cupón con `incrementCouponUse`
- [ ] 4.6 Si el stock no alcanza, dejar el pedido intacto y reportar `stock_insufficient` con el detalle, igual que hace hoy la reactivación
- [ ] 4.7 Resultado parcial `{ undone, failed: [{order_id, reason}] }` con motivos `modified_since` / `stock_insufficient` / `not_found`
- [ ] 4.8 Marcar `undone_at` con guard `WHERE undone_at IS NULL` para que dos deshacer simultáneos no se pisen
- [ ] 4.9 `revalidatePath('/dashboard', 'layout')`, igual que el resto de las acciones
- [ ] 4.10 Tests: deshacer cada una de las cuatro acciones; deshacer un lote; pedido modificado después se saltea; stock insuficiente bloquea sin tocar el pedido; deshacer dos veces no duplica efectos; **deshacer el borrado de un pedido pendiente descuenta el stock exactamente una vez** (el caso que rompe cualquier implementación que infiera en vez de leer los flags)

## 5. Interfaz

- [ ] 5.1 Botón "Deshacer" en los avisos de las seis acciones (`OrdersPanel.tsx:241`, `:256`, `:658`, `:660`, `:694`, `:696`), usando el soporte nativo de acción de sonner
- [ ] 5.2 Que el handler del aviso lea filtros y página al momento del click y no los capture al crearse, para que no quede con una closure vieja
- [ ] 5.3 Lista de acciones recientes en el panel, con qué se hizo, a cuántos pedidos y cuándo, con su botón de deshacer
- [ ] 5.4 Refrescar con `fetchOrders` + `refreshBacklogCount` tras deshacer, siguiendo el patrón de `handleStatusChange:587`
- [ ] 5.5 Mostrar el resultado parcial con `summarizeBatchFailures`, agregando las etiquetas de los motivos nuevos
- [ ] 5.6 Reescribir el copy del modal de borrado (`:466-467`), que hoy afirma que no se puede deshacer
- [ ] 5.7 Revisar el resto de los textos de confirmación por la misma razón

## 6. Verificación

- [ ] 6.1 `npx tsc --noEmit`, `npx vitest run` y `npm run build` (con `--webpack`, no Turbopack)
- [ ] 6.2 Probar en el navegador las cuatro acciones y su deshacer, individuales y en lote
- [ ] 6.3 Probar el caso de stock insuficiente y verificar que el mensaje explique cuál producto
- [ ] 6.4 Verificar que deshacer con otra pestaña habiendo modificado el pedido reporta el conflicto en lugar de pisarlo
- [ ] 6.5 Aplicar la migración a producción
