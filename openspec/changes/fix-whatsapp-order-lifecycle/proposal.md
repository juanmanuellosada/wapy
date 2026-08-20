## Why

Un pedido del canal `whatsapp` se crea en `pending` y se queda ahí para siempre: la dueña no recibe ningún aviso de que entró, y el único puente entre el chat y la fila del panel es un `orderRef` de 8 caracteres de UUID que tiene que cruzar a mano. En la práctica los pedidos no se confirman nunca, y eso ya está causando daño en producción: stock reservado de forma permanente, usos de cupón quemados de manera irreversible, e ingresos subestimados en el dashboard.

No es un problema de comodidad. Es que el estado del pedido en la base dejó de describir la realidad del negocio, y todo lo que se apoye encima —empezando por el futuro programa de puntos— hereda ese error.

## What Changes

**Confirmar deja de requerir una búsqueda manual**

- El mensaje de WhatsApp que la clienta le envía a la dueña incluye un link directo al pedido en el dashboard, protegido por sesión de dueña. El mensaje ya es la notificación: llega solo, al lugar donde la dueña ya está trabajando.
- Cada pedido recibe un número correlativo por tienda (`#127`) en lugar de 8 caracteres de UUID, y el buscador del panel lo acepta.
- El panel gana confirmación en lote, filtro por canal, badge visible para WhatsApp (hoy es invisible) y cierre automático del modal al confirmar.

**El pedido de WhatsApp pasa a tener un ciclo de vida definido**

- Se introduce una política de expiración para pedidos `whatsapp` pendientes, que hoy no tienen ninguna: el cron los ignora por completo.
- La auto-confirmación al vencer la ventana es **opt-in por tienda y viene apagada**, porque confirmar sin evidencia contamina el historial de ingresos.
- Resumen diario por email a la dueña con los pendientes, no un mail por pedido.

**Migración conservadora del historial**

- Los pedidos pendientes anteriores al release **no se tocan**. Se traza una línea por fecha y la política nueva rige hacia adelante.
- La dueña recibe una herramienta de revisión en lote para decidir ella qué hacer con ese backlog.
- El cambio de política se comunica por email a las tiendas **antes** de aplicarse.

**Correcciones de comportamiento incorrecto**

- **BREAKING (datos)**: `getOrderStats` deja de sumar `total_cents` bruto y pasa a descontar `discount_cents`. Los ingresos históricos mostrados van a bajar, porque hoy están sobreestimados.
- Cancelar un pedido de WhatsApp devuelve el uso del cupón. Hoy queda consumido para siempre.
- Si la creación del pedido falla, la clienta deja de recibir un `#ref` que no existe en la base.
- `top_products` y `orders_by_section` pasan a usar el mismo criterio que los KPIs de la misma pantalla.

## Capabilities

### New Capabilities

- `order-lifecycle`: qué garantiza el sistema sobre un pedido — transiciones válidas, política de expiración por canal, reversión de stock y de uso de cupón, numeración por tienda, y qué status cuenta como venta en las métricas.
- `order-confirmation-workflow`: cómo la dueña se entera de un pedido y lo confirma — deep link desde el mensaje de WhatsApp, afordancias del panel, confirmación en lote, resumen diario y revisión del backlog histórico.

### Modified Capabilities

- `discount-coupons`: cancelar un pedido debe devolver el uso del cupón. Hoy `revertCouponUse` solo se invoca desde el webhook de Mercado Pago y además es no-op salvo que el status sea `confirmed`, así que un pedido de WhatsApp cancelado desde `pending` lo quema de forma irreversible.
- `public-storefront`: el mensaje de WhatsApp pasa a llevar el link de confirmación y el número correlativo; y el fallo al crear el pedido deja de ser silencioso.

## Impact

**Código**

- `lib/store/orders/actions.ts` — `createPendingOrder`, `updateOrderStatus`, `replenishOrderStock`, `revertCouponUse`, `getOrderStats`, `listOrders`
- `app/api/cron/expire-orders/route.ts` — hoy filtra `channel='mercadopago'` con `EXPIRE_AFTER_HOURS=24` hardcodeado
- `app/dashboard/components/OrdersPanel.tsx`, `OrdersStats.tsx`
- `app/[slug]/StoreClient.tsx` (`handleWhatsApp`), `lib/store/whatsapp/buildMessage.ts`
- `lib/email/index.ts` — Resend ya está cableado

**Base de datos**

- Migración nueva (siguiente a `035_product_price_tiers.sql`) para el número correlativo por tienda y la configuración de expiración por tienda. No existe `stores.settings` jsonb: la convención del repo es una columna por setting.

**Operativo**

- Email de anuncio a las tiendas antes del release.
- Un cron nuevo o extensión del existente para el resumen diario.

**Fuera de alcance**

- Todo lo relativo al programa de puntos y a cuentas de comprador. Este change es prerequisito de eso, pero se sostiene solo.
