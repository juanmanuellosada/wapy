## Context

`fix-whatsapp-order-lifecycle` dejó a la dueña con herramientas para confirmar y cancelar, pero no para limpiar. Un pedido cancelado ya no computa como venta —`getOrderStats` y las RPCs de storefront filtran por `confirmed|delivered`— pero sigue ocupando lugar en la lista.

Restricciones que hereda este change:

- Al crear un pedido se descuenta stock, y para el canal WhatsApp se cuenta el uso del cupón. `updateOrderStatus` ya revierte ambos al cancelar, vía `replenishOrderStock` y `revertCouponUse` (que decide por `orders.coupon_counted`, no por el status).
- El número correlativo se asigna al crear y no se reasigna nunca. Los huecos son un trade-off ya aceptado.
- Las consultas de listado ya son server-side y paginadas, con los filtros resueltos en `fetchFilteredOrders`.
- Las RPCs de `025_storefront_insights_rpcs.sql` son `SECURITY DEFINER` y consultan `orders` por su cuenta, fuera de todo el código de la app.

## Goals / Non-Goals

**Goals:**

- Que la dueña pueda sacar un pedido de su vista de forma definitiva desde su punto de vista.
- Que borrar nunca deje stock retenido ni un uso de cupón consumido de más.
- Que un borrado por error no sea una pérdida irreversible de datos.

**Non-Goals:**

- Papelera, restauración o historial de borrados en la interfaz. El requisito es que desaparezca; exponer un "deshacer" lo contradice.
- Purga o retención automática. Nada borra pedidos por su cuenta.
- Borrado de otras entidades. Solo pedidos.

## Decisions

### 1. Marca de borrado, no `DELETE`

Columna `orders.deleted_at timestamptz`. Toda lectura de la dueña y toda métrica la filtran.

**Por qué no un `DELETE` real**: la decisión de producto fue explícita —invisible para la dueña, recuperable por detrás— y cuesta lo mismo construirlo. Un pedido borrado por error, o una compradora que reclama por algo que la dueña limpió en lote, dejan de ser situaciones sin salida. Todo este proyecto se construyó sobre no destruir datos que alguien puede llegar a necesitar (cancelación reversible, backlog histórico intacto); un `DELETE` sería la única pieza que contradice ese criterio.

**Consecuencia a asumir**: cada lugar que lee `orders` tiene que acordarse de filtrar. Es el costo real de esta decisión y por eso el filtro va **dentro de los helpers compartidos** (`fetchFilteredOrders`, `getOrderById`) en vez de repetirse en cada caller.

*Alternativa considerada*: mover las filas a una tabla `orders_deleted`. Recupera la prolijidad del `DELETE` sin perder datos, pero duplica el esquema y rompe las FK de `order_items`.

### 2. Borrar revierte lo que el pedido tenía comprometido

Borrar un pedido `pending` o `confirmed` repone el stock y devuelve el uso del cupón, reusando `replenishOrderStock` y `revertCouponUse` tal como hace la cancelación. Ambos ya son idempotentes y deciden por estado propio (`coupon_counted`), así que no hace falta lógica nueva.

**Por qué no exigir cancelar primero**: sería más simple de implementar, pero le pide a la dueña que entienda que borrar no repone stock. Nadie lee eso. Un borrado que deja stock retenido es exactamente el bug que este proyecto acaba de arreglar, reintroducido por la puerta de al lado.

### 3. Los pedidos entregados se pueden borrar, con aviso explícito

Un `delivered` es una venta concretada, y borrarlo baja los ingresos históricos. Es dato de la dueña y puede tener motivos legítimos, así que no se prohíbe — pero la confirmación tiene que decir que se está modificando el historial de ingresos, no un genérico "¿estás seguro?".

### 4. Las RPCs del storefront también filtran

`025_storefront_insights_rpcs.sql` alimenta "lo más pedido" y los productos relacionados de la tienda pública. Son funciones `SECURITY DEFINER` que consultan `orders` por fuera del código de la app, así que ningún filtro en TypeScript las alcanza: hay que reescribirlas en la migración.

Es el punto más fácil de pasar por alto, y su síntoma sería silencioso — un producto siguiendo en "lo más pedido" por pedidos que la dueña ya borró.

## Risks / Trade-offs

- **Una lectura de `orders` que se olvide del filtro muestra pedidos borrados** → El filtro vive en los helpers compartidos, no en cada caller. Los tests cubren que listado, métricas, exportación y backlog los excluyan.
- **La dueña borra algo real y no tiene cómo recuperarlo sola** → Es deliberado: la recuperación existe a nivel datos, no en la interfaz. El aviso previo, y que borrar entregados avise distinto, son la única barrera del lado de ella.
- **Borrar en lote sobre una selección de "todos los que coinciden con el filtro" puede abarcar mucho más de lo que la dueña ve** → La confirmación tiene que decir la cantidad exacta, igual que ya hace el resto de las acciones en lote.
- **Los números correlativos quedan con más huecos** → Ya era el comportamiento esperado al cancelar. No se reasignan.

## Migration Plan

1. Migración: `orders.deleted_at`, índice parcial para las consultas de listado, y reescritura de las dos RPCs de `025` para excluir borrados.
2. Sin backfill: ningún pedido existente nace borrado.

**Rollback**: la columna es aditiva. Revertir las RPCs a su versión anterior las deja funcionando como antes; los pedidos marcados volverían a aparecer, que es el estado previo.
