## Why

La dueña no tiene forma de sacar un pedido de su vista. Pedidos de prueba, spam o basura quedan en la lista para siempre, y la única herramienta disponible —cancelar— los deja igual de visibles.

Cancelar ya los excluye de las métricas, así que el problema no es que ensucien los números: es que ensucian la pantalla que la dueña usa todos los días para trabajar.

## What Changes

- La dueña puede borrar un pedido, individualmente o en lote. El pedido desaparece del listado, del buscador, de la exportación, de las métricas y de las RPCs públicas del storefront.
- Borrar un pedido que tenía stock comprometido lo repone, y devuelve el uso del cupón si lo había consumido. Sin eso, borrar reintroduciría el stock fantasma que este proyecto acaba de arreglar.
- Borrar un pedido entregado —una venta concretada— reescribe el historial de ingresos, así que ese caso avisa explícitamente antes de proceder.
- El borrado es **invisible para la dueña pero recuperable a nivel de datos**: la fila se marca, no se destruye. No se expone ninguna forma de deshacerlo en la interfaz; existe para que un borrado por error o un reclamo de una compradora no sean irreversibles.
- El pedido borrado conserva su número correlativo, que no se reasigna.

## Capabilities

### New Capabilities

- `order-deletion`: qué significa borrar un pedido — qué se revierte, dónde deja de aparecer, y qué garantías de recuperación existen por detrás.

### Modified Capabilities

- `order-lifecycle`: el criterio de qué cuenta como venta pasa a excluir además los pedidos borrados, en todos los indicadores.
- `order-confirmation-workflow`: el listado, el buscador, la paginación y la exportación dejan de considerar los pedidos borrados.

## Impact

**Código**

- `lib/store/orders/actions.ts` — `listOrders`, `fetchFilteredOrders`, `getOrderById`, `getOrderStats`, `getBacklogPendingCount`, `exportOrdersCsv`, `batchUpdateOrderStatus`, y la reversión de stock y cupón ya existente
- `app/dashboard/components/OrdersPanel.tsx` — acción de borrado individual y en lote, con confirmación
- `app/api/cron/expire-orders/route.ts` y `app/api/cron/pending-orders-digest/route.ts` — no deben considerar pedidos borrados

**Base de datos**

- Migración nueva: marca de borrado en `orders`, e índice acorde
- Las RPCs de `025_storefront_insights_rpcs.sql` ("lo más pedido" y productos relacionados) deben excluir los pedidos borrados. Es el punto más fácil de olvidar, porque son funciones y no consultas del código.
