## Why

Un clic equivocado en el panel de pedidos es definitivo. `delivered` y `cancelled` son estados terminales en `ALLOWED_TRANSITIONS`, y la única vuelta atrás que existe —revivir un pedido cancelado— está restringida a los que canceló el cron, no a los que cancelaste vos. Si marcás entregado el pedido equivocado, o cancelás uno que era válido, o borrás en lote con un filtro mal puesto, no hay forma de volver: el modal de borrado hoy lo dice con todas las letras, *"La dueña no puede deshacer esto desde el panel"*.

## What Changes

- **Registro de acciones sobre pedidos**: nueva tabla `order_action_log`, una fila por **operación** del dueño (no por pedido), que guarda qué pedidos afectó y en qué estado estaban antes, incluyendo **qué efectos se aplicaron realmente** sobre stock y cupón.
- **Deshacer las últimas 5 operaciones, hasta 24 horas atrás**: se puede revertir confirmar, cancelar, entregar y borrar, tanto individuales como en lote. Un lote se deshace como una sola operación: si marcaste 50 pedidos por error, un clic los devuelve a todos.
- **Deshacer restaura el estado previo, no aplica una transición**: limpia el timestamp que la acción había escrito (`confirmed_at`, `delivered_at`, `cancelled_at`), restaura `cancelled_by` y `deleted_at`, y **no pasa por `ALLOWED_TRANSITIONS`** — si pasara, deshacer un "entregado" sería imposible porque `delivered` es terminal.
- **Los efectos sobre stock y cupón se revierten según lo registrado, no según inferencia**: si la acción repuso stock, el deshacer lo vuelve a descontar reusando `deductOrderStock`, que ya existe y ya maneja el rollback parcial. Si repuso el uso del cupón, lo vuelve a contar. Inferir estos efectos desde el estado actual es ambiguo y llevaría a duplicar unidades de stock.
- **Si el stock ya no alcanza, el deshacer se bloquea y explica por qué**, sin tocar el pedido — el mismo contrato `stock_insufficient` que ya devuelve la reactivación de pedidos expirados.
- **Solo se deshace lo que nadie tocó después**: el deshacer verifica que el pedido siga exactamente como lo dejó la acción registrada. Si cambió en el medio, esa entrada se saltea y se informa, con el mismo contrato de resultado parcial que ya usan las acciones en lote.
- **Dos puntos de entrada**: botón "Deshacer" en el aviso que aparece tras cada acción (sonner ya lo soporta de forma nativa), y una lista de acciones recientes en el panel como red de seguridad cuando el aviso ya se fue.
- **BREAKING** interno: `batchDeleteOrders` hoy devuelve solo `deletedCount`; pasa a devolver también los ids borrados, sin lo cual un borrado en lote no se puede deshacer.
- **Sin gating por plan**: es una red de seguridad sobre datos del negocio, no un diferencial comercial. Disponible en todos los planes.

## Capabilities

### New Capabilities
- `order-action-undo`: el registro de las acciones del dueño sobre pedidos, la reversión de las últimas operaciones dentro de su ventana, la restauración de estado y efectos, y las condiciones bajo las cuales el deshacer se rechaza.

### Modified Capabilities
<!-- Ninguna capability con spec propio cambia de requisito. El ciclo de vida del pedido no se modifica: el deshacer restaura un estado previo en lugar de agregar transiciones nuevas. -->

## Impact

- **DB (nueva migración `044`)**: tabla `order_action_log` con `store_id`, tipo de acción, momento, autor, `undone_at`, y las entradas afectadas con su estado previo y los efectos aplicados. RLS con el patrón de tabla hija de `stores` (`auth.uid() IN (SELECT owner_id FROM stores WHERE id = store_id)`), más la policy de superadmin.
- **Pedidos**: `lib/store/orders/actions.ts` — registrar la operación en `updateOrderStatusInternal`, `batchUpdateOrderStatus`, `deleteOrderInternal` y `batchDeleteOrders`; nueva server action de deshacer; exportar o adaptar `deductOrderStock`, hoy privada del módulo; cambiar el retorno de `batchDeleteOrders`.
- **UI**: `app/dashboard/components/OrdersPanel.tsx` — botón de deshacer en los seis puntos donde ya hay toast (`:241`, `:256`, `:658`, `:660`, `:694`, `:696`), lista de acciones recientes, y **reescribir el copy del modal de borrado** (`:466-467`), que hoy afirma lo contrario.
- **Refresco**: el panel no usa realtime ni estado optimista; se repuebla con `fetchOrders` + `refreshBacklogCount` (`:587`). El deshacer sigue el mismo camino, con cuidado de que el handler del toast no capture filtros viejos por closure.
- **Orden respecto de los otros changes**: es independiente de `add-product-cost-tracking` y `add-manual-sales`, pero toca el mismo archivo, así que conviene no implementarlo en paralelo. Si se adelanta a `add-manual-sales`, hay que renumerar las migraciones.
- **Fuera de alcance**: rehacer (un deshacer no se puede deshacer), historial visible por pedido, deshacer acciones del cron (para eso ya existe "Revivir pedido"), deshacer la creación o edición de productos, y auditoría general del sistema.
