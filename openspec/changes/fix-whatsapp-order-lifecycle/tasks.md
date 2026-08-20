## 1. Migración de base de datos

- [x] 1.1 Crear `036_whatsapp_order_lifecycle.sql` con cabecera comentada (motivo, decisiones, backfill, reversibilidad) siguiendo la convención de `035_product_price_tiers.sql`
- [x] 1.2 Agregar `stores.order_seq integer not null default 0` como contador de numeración
- [x] 1.3 Agregar `orders.store_order_number integer` con índice único parcial por `(store_id, store_order_number)`
- [x] 1.4 Agregar `orders.coupon_counted boolean not null default false`
- [x] 1.5 Agregar `stores.wa_pending_ttl_days integer not null default 7`, `stores.wa_auto_confirm boolean not null default false` y `stores.wa_lifecycle_effective_from timestamptz not null default now()`
- [x] 1.6 Backfill de `store_order_number` por `created_at` dentro de cada tienda, y de `stores.order_seq` con el máximo resultante
- [x] 1.7 Backfill de `coupon_counted`: `true` para pedidos de WhatsApp con `coupon_code`, y para pedidos de Mercado Pago con `coupon_code` que estén en `confirmed` o `delivered`
- [x] 1.8 Backfill de `wa_lifecycle_effective_from = now()` en las tiendas existentes para que la política no aplique al historial
- [x] 1.9 Agregar `orders.cancelled_by` con valores `owner` y `system`, y backfill de las cancelaciones existentes como `owner`
- [x] 1.10 Regenerar los tipos de Supabase en `lib/supabase/types.ts`

## 2. Numeración correlativa

- [x] 2.1 Asignar el número en `createPendingOrder` con `UPDATE stores SET order_seq = order_seq + 1 RETURNING order_seq` y persistirlo en `store_order_number`
- [x] 2.2 Verificar con un test que dos creaciones concurrentes de la misma tienda no colisionan
- [x] 2.3 Exponer `store_order_number` en `OrderWithItems` y en `listOrders`

## 3. Corrección del uso de cupón

- [x] 3.1 Setear `coupon_counted = true` en `incrementCouponUse` (path WhatsApp al crear y path Mercado Pago al aprobar)
- [x] 3.2 Reescribir `revertCouponUse` para que decida según `coupon_counted` en vez de según `status`, y baje la bandera al revertir para ser idempotente
- [x] 3.3 Llamar a `revertCouponUse` desde `updateOrderStatus` cuando la transición sea a `cancelled`
- [x] 3.4 Tests: cancelación manual desde `pending` devuelve el uso; doble reversión no baja el contador dos veces; pedido de Mercado Pago nunca aprobado no modifica el contador

## 4. Política de expiración por canal

- [x] 4.1 Reescribir `app/api/cron/expire-orders/route.ts` para dejar de filtrar `channel='mercadopago'` y evaluar cada canal con su regla
- [x] 4.2 Mantener la ventana de 24h para Mercado Pago, extrayendo la constante actual sin cambiar su comportamiento
- [x] 4.3 Aplicar `wa_pending_ttl_days` a los pedidos de WhatsApp, filtrando por `created_at >= stores.wa_lifecycle_effective_from`
- [x] 4.4 Al vencer: cancelar reponiendo stock y devolviendo cupón, salvo que `wa_auto_confirm` esté activo, en cuyo caso confirmar
- [x] 4.5 Registrar `cancelled_by = 'system'` en las cancelaciones automáticas y `owner` en las manuales
- [x] 4.6 Permitir la transición `cancelled → confirmed` solo cuando `cancelled_by = 'system'`, volviendo a descontar stock y a contabilizar el uso del cupón
- [x] 4.7 Rechazar la reactivación con motivo explícito si ya no hay stock suficiente, dejando el pedido como estaba
- [x] 4.8 Exponer la reactivación en el panel solo para pedidos cancelados por el sistema
- [x] 4.9 Tests: pedido anterior a la fecha de corte no se toca; pedido dentro de la ventana no se toca; pedido vencido sigue la política de su tienda; cancelado por sistema se puede revivir; cancelado por la dueña no

## 5. Deep link desde el mensaje de WhatsApp

- [x] 5.1 Incluir en `lib/store/whatsapp/buildMessage.ts` el número correlativo y la URL al pedido en el panel — hecho en el helper y en el flujo de Mercado Pago (`checkout/success/page.tsx`); `createPendingOrder` ahora devuelve `store_order_number` (insert, select e idempotencia) y `StoreClient.tsx` lo pasa al mensaje de WhatsApp nativo.
- [x] 5.2 Soportar `?order=<uuid>` en el panel de pedidos: abrir ese pedido al cargar, con su detalle y la acción de confirmar disponible
- [x] 5.3 Verificar que la autorización sigue dependiendo de `requireOwnerStore()` y RLS, y que un usuario ajeno o sin sesión no accede
- [x] 5.4 Preservar el destino en el flujo de login para que la dueña vuelva al pedido y no al dashboard genérico
- [x] 5.5 Tests de acceso: dueña con sesión llega al pedido; dueña de otra tienda no; sin sesión redirige a login y vuelve al pedido

## 6. Panel de pedidos

- [x] 6.1 Hacer visible el badge de canal para WhatsApp en `OrdersPanel.tsx` (hoy `ChannelBadge` devuelve `null`)
- [x] 6.2 Agregar filtro por canal, incluyendo `channel` en `ListOrdersFilters`
- [x] 6.3 Buscar por número correlativo además de por identificador interno
- [x] 6.4 Aceptar en el buscador también la referencia corta de UUID, para encontrar pedidos previos al change que circularon con ese formato en chats reales
- [x] 6.5 Mostrar el número correlativo como identificación visible del pedido en la fila y en el detalle
- [x] 6.6 Cerrar el detalle y volver al listado actualizado al confirmar, en vez de dejar el modal abierto

## 7. Confirmación en lote

- [x] 7.1 Agregar server action de cambio de estado en lote que valide cada pedido contra `ALLOWED_TRANSITIONS` individualmente
- [x] 7.2 Devolver resultado parcial: cuántos cambiaron, cuáles no y por qué, sin abortar el lote ante un pedido inválido
- [x] 7.3 Aplicar las mismas reversiones de stock y cupón que el path individual
- [x] 7.4 Selección múltiple en el listado y acción de confirmar o cancelar sobre la selección
- [x] 7.5 Tests: lote homogéneo confirma todo; lote con un pedido ya cancelado confirma el resto e informa el fallo

## 8. Métricas

- [x] 8.1 Corregir `getOrderStats` para calcular ingresos sobre el monto neto, descontando `discount_cents`
- [x] 8.2 Alinear `top_products` y `orders_by_section` al mismo criterio `confirmed|delivered` que usan los KPIs de la vista
- [x] 8.3 Tests sobre el cálculo de ingresos netos y sobre la consistencia entre indicadores

## 9. Fallo de creación de pedido

- [x] 9.1 Reemplazar el catch silencioso de `handleWhatsApp` en `StoreClient.tsx` para no abrir WhatsApp con una referencia inexistente
- [x] 9.2 Mostrar a la compradora que el pedido no pudo registrarse, en línea con el manejo de errores del storefront
- [x] 9.3 Registrar el error para diagnóstico en vez de descartarlo

## 10. Resumen diario y backlog

- [x] 10.1 Agregar sender de resumen de pendientes en `lib/email/index.ts`, con enlace directo a cada pedido
- [x] 10.2 Crear la ruta de cron del resumen y registrarla en `vercel.json` en horario de media mañana en Argentina, separada de `expire-orders`
- [x] 10.3 Enviar solo si la tienda tiene pedidos pendientes
- [x] 10.4 Banner en el panel con la cantidad de pendientes previos a `wa_lifecycle_effective_from`, que lleve a esa lista filtrada
- [x] 10.5 El banner no lleva acción de descarte: desaparece solo cuando no quedan pendientes previos

## 11. Configuración por tienda

- [x] 11.1 Exponer `wa_pending_ttl_days` y `wa_auto_confirm` en la configuración del dashboard
- [x] 11.2 Redactar la advertencia de `wa_auto_confirm` diciendo explícitamente que registra como ventas pedidos que pueden no haberse concretado
- [x] 11.3 Validar server-side los valores de configuración y verificar ownership

## 12. Paginación del listado

- [x] 12.1 Mover a la consulta los filtros que hoy se aplican en memoria después del `.limit(100)`: sección, búsqueda, canal, estado y rango de fechas
- [x] 12.2 Reemplazar el tope fijo de 100 por paginación real sobre el conjunto ya filtrado
- [x] 12.3 Controles de paginación en el panel, preservando los filtros activos al navegar
- [x] 12.4 Hacer que `exportOrdersCsv` exporte el conjunto filtrado completo y no la página visible
- [x] 12.5 Tests: filtrar sobre una tienda con más pedidos que una página devuelve todas las coincidencias, no solo las de la página actual

## 13. Comunicación y release

- [x] 13.1 Redactar el cuerpo del email de anuncio: que los pedidos pendientes de más de 7 días pasan a cancelarse automáticamente y que esa cancelación es reversible, que no tienen que hacer nada, que los pendientes anteriores al release quedan intactos, y que los ingresos mostrados se corrigen porque antes se sumaba el bruto sin descontar cupones
- [x] 13.2 Agregar el sender del anuncio en `lib/email/index.ts` usando Resend, con el mismo transporte y remitente que el resto de los emails del sistema
- [x] 13.3 Resolver la lista de destinatarios: todos los dueños de tienda registrados
- [x] 13.4 Script de envío puntual que recorra los destinatarios, tolere fallos individuales sin abortar la tanda y deje registro de a quién se le envió
- [ ] 13.5 **Gate de aprobación**: mostrarle el cuerpo del email al usuario y esperar su visto bueno explícito antes de enviar nada
- [ ] 13.6 Enviar el anuncio, ya aprobado, antes de aplicar la migración
- [ ] 13.7 Aplicar la migración a producción
- [ ] 13.8 Verificar en producción: numeración asignada y sin huecos inesperados, cron corriendo sobre ambos canales, deep link funcionando desde un celular sin sesión, y reactivación de un pedido cancelado por el sistema
