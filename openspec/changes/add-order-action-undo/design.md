## Context

El panel de pedidos tiene cuatro acciones destructivas o semi-destructivas —confirmar, cancelar, entregar, borrar— disponibles de a uno y en lote. Ninguna es reversible hoy:

- `ALLOWED_TRANSITIONS` (`lib/store/orders/actions.ts:1435`) deja `delivered: []` y `cancelled: []`. Son terminales.
- La única vuelta atrás, `cancelled → confirmed`, exige `canReactivateOrder(cancelled_by)`, que es literalmente `cancelledBy === 'system'` (`lib/store/orders/expiry.ts:41`). Una cancelación hecha por el dueño escribe `cancelled_by = 'owner'` y queda fuera.
- No existe ninguna auditoría en el proyecto: ninguna de las 41 migraciones crea tablas de log, eventos o historial, ni hay triggers que registren cambios. El único rastro son los timestamps del propio pedido.

La mecánica de reversión, en cambio, **ya está escrita**: la rama de reactivación (`:1544-1552`) vuelve a descontar stock con `deductOrderStock` y vuelve a contar el cupón con `incrementCouponUse`, abortando limpiamente si el stock no alcanza. Lo que falta no es la mecánica, es saber **a qué estado volver**.

## Goals / Non-Goals

**Goals:**
- Que un error de clic sea recuperable durante un plazo razonable, incluso si cerraste la pestaña.
- Que deshacer un lote sea una sola acción, no una por pedido.
- Que el stock y los cupones queden exactamente como estaban, o que el deshacer falle diciendo por qué — nunca un estado intermedio silencioso.

**Non-Goals:**
- Rehacer. Un deshacer es definitivo y sale de la lista.
- Historial visible por pedido. El registro queda guardado y habilita construirlo después, pero no se muestra en esta versión.
- Deshacer acciones automáticas del cron: para eso ya existe "Revivir pedido".
- Auditoría general del sistema (productos, tienda, suscripción). Solo pedidos.

## Decisions

### D1 — Se registra la operación, no el pedido

Una fila de `order_action_log` por clic del dueño, con las entradas afectadas adentro. Un lote de 50 pedidos es **una** fila con 50 entradas, y las "últimas 5 operaciones" del usuario son 5 filas, no 250.

Las entradas viven como JSON dentro de la fila en lugar de en una tabla hija. Lo que normalmente justifica la tabla hija es consultar por `order_id` —"¿cuál fue la última acción sobre este pedido?"—, y D2 elimina esa necesidad. Sin esa consulta, la tabla hija agrega una migración, una RLS y un join a cambio de nada.

Cada entrada guarda: el pedido, su `status` anterior y el resultante, `cancelled_by` anterior, `deleted_at` anterior, y **dos flags de efectos: si esa acción repuso stock y si revirtió el uso del cupón**.

### D2 — El permiso para deshacer se verifica contra el estado actual, no contra el log

Al deshacer, cada entrada compara el estado actual del pedido con el estado que esa acción dejó (`status`, `deleted_at`). Si no coinciden, alguien lo modificó después y esa entrada se saltea.

**Alternativa descartada**: consultar el log para ver si hay acciones posteriores sobre ese pedido. Requiere indexar por `order_id` dentro del JSON o normalizar en una tabla hija, y además no detecta cambios hechos fuera del panel (el cron, un webhook de pago). Comparar contra la realidad los detecta todos, con una condición más simple.

Es control de concurrencia optimista, el mismo principio que el `.gte('stock', quantity)` que el proyecto ya usa para el stock.

### D3 — Los efectos se revierten por lo registrado, nunca por inferencia

Este es el punto donde un diseño ingenuo rompe el stock.

`replenishOrderStock` (`:670`) es idempotente **solo respecto de `status === 'cancelled'`**: relee el pedido y no hace nada si ya está cancelado. Pero borrar un pedido `pending` repone stock y **no cambia el status** (`deleteOrderInternal` solo escribe `deleted_at`). Resultado: un pedido `pending` con stock ya repuesto es indistinguible de uno con stock sin reponer. Cualquier undo que deduzca "estaba pending, entonces el stock nunca se repuso" duplica unidades.

Por eso cada entrada guarda `stock_restored` y `coupon_reverted` como hechos: la acción que los aplicó es la que sabe. El deshacer invierte exactamente lo que dice el registro:

| Acción | Al deshacer |
|---|---|
| Confirmar (`pending→confirmed`) | Vuelve a `pending`, limpia `confirmed_at`. Sin efectos. |
| Entregar (`confirmed→delivered`) | Vuelve a `confirmed`, limpia `delivered_at`. Sin efectos. |
| Cancelar (`X→cancelled`) | Vuelve a `X`, limpia `cancelled_at` y `cancelled_by`; si `stock_restored`, `deductOrderStock`; si `coupon_reverted`, `incrementCouponUse`. |
| Borrar | Limpia `deleted_at`; mismos efectos condicionales que cancelar. |

Nótese que borrar un pedido `delivered` no repone stock ni cupón (decisión explícita del código, `:1708-1716`): su entrada queda con ambos flags en `false` y el deshacer solo limpia `deleted_at`. Sale gratis precisamente porque se registra el hecho en vez de deducirlo.

### D4 — Deshacer limpia los timestamps; no es una transición más

El deshacer escribe directo con el admin client y **no pasa por `ALLOWED_TRANSITIONS`**. Si pasara, deshacer un "entregado" sería imposible: `delivered` es terminal.

Y a diferencia de la reactivación actual —que escribe `confirmed_at` pero deja `cancelled_at` con el valor viejo y `cancelled_by` en `'system'`, dejando residuo— el deshacer limpia el timestamp que la acción había escrito. El objetivo es que el pedido quede como estaba, no que acumule marcas de un viaje de ida y vuelta.

### D5 — Resultado parcial, como el resto de las acciones en lote

Deshacer un lote de 50 donde 3 cambiaron después y 1 no tiene stock devuelve `{ undone: 46, failed: [{order_id, reason}] }`, con `reason` en `'modified_since' | 'stock_insufficient' | 'not_found'`. Es el contrato que `batchUpdateOrderStatus` ya usa y que el panel ya sabe resumir con `summarizeBatchFailures` (`OrdersPanel.tsx:185`).

Una operación deshecha, completa o parcialmente, se marca con `undone_at` y sale de la lista: no se puede deshacer dos veces ni rehacer. Las entradas que fallaron quedan sin revertir y se informan; no se reintenta solo.

### D6 — Ventana: últimas 5 operaciones no deshechas, dentro de 24 horas

Query directa sobre la tabla, filtrando por tienda, `undone_at IS NULL` y `performed_at >= now() - 24h`, ordenada descendente con `LIMIT 5`.

El límite temporal no es cosmético: sin él, un pedido entregado hace tres meses podría volver a `confirmed` y mover los ingresos de un período ya cerrado — y con el change de costo, también su margen. Las filas viejas no se borran (son el insumo de un historial futuro); simplemente dejan de ofrecerse.

### D7 — Qué se registra y qué no

Se registran las cuatro acciones del dueño desde el panel, individuales y en lote. **No** se registran: la creación de pedidos, las transiciones del cron de expiración, ni los cambios disparados por webhooks de pago. Ninguna es un clic del dueño, y ofrecer deshacerlas invitaría a pelearse con procesos automáticos que van a volver a correr.

El registro se escribe **después** de que la acción se aplicó con éxito, y solo para los pedidos efectivamente afectados. Que falle el registro no debe abortar una acción ya aplicada: se loguea y sigue, porque perder la posibilidad de deshacer es mucho menos grave que dejar la operación a medias.

## Risks / Trade-offs

- **Se duplica stock por revertir un efecto que no ocurrió** → Es el riesgo central y lo resuelve D3: flags registrados, nunca inferencia. Merece tests explícitos sobre el caso del pedido `pending` borrado.
- **El handler del toast captura filtros viejos por closure** → `fetchOrders` se llama con `filters`/`page` como argumentos y el toast puede sobrevivir a un cambio de filtro; el `onClick` tiene que leer los valores al momento del click, con ref, no capturarlos al crear el toast.
- **`batchDeleteOrders` no devuelve los ids borrados** → Hay que cambiar su retorno. Es un cambio de contrato interno con un solo consumidor (el panel), pero rompe cualquier test que afirme la forma actual.
- **Dos deshacer simultáneos sobre la misma operación** → El `UPDATE` que marca `undone_at` lleva guard `WHERE undone_at IS NULL`; el segundo no afecta filas y se resuelve como "ya deshecha".
- **El copy del modal de borrado afirma lo contrario** (`OrdersPanel.tsx:466`) → Reescribirlo es parte del change, no un detalle de redacción: hoy le dice al usuario que no puede deshacer.
- **Deshacer una cancelación puede fallar por el CHECK de stock en variantes** → `product_variants.stock` tiene `CHECK (stock >= 0)`, `products.stock` no. `deductOrderStock` ya valida con `.gte` y devuelve `stock_insufficient` antes de escribir, así que el CHECK no debería alcanzarse nunca; si se alcanza, es un bug y conviene que el test lo cubra.
- **El JSON de entradas crece con lotes grandes** → Un lote sobre miles de pedidos genera una fila grande. Acotar la cantidad de entradas registradas y, superado el tope, guardar la operación como no deshacible con su motivo, en vez de escribir una fila gigante.

## Migration Plan

1. Aplicar `043_order_action_log.sql`: tabla nueva más sus policies. No toca `orders` ni ninguna tabla existente, así que no hay riesgo sobre datos actuales.
2. Desplegar. Sin operaciones registradas la lista de acciones recientes está vacía y el panel se comporta como hoy.
3. El registro empieza a poblarse con el uso; no hay backfill posible ni deseable.
4. **Rollback**: `DROP TABLE order_action_log`. Se pierde la posibilidad de deshacer, no se pierde ningún pedido. El cambio de retorno de `batchDeleteOrders` es de código y se revierte con el despliegue.

## Open Questions

- ¿Conviene que el registro también capte las acciones del superadministrador cuando opera sobre una tienda? Hoy no hay un flujo así en el panel; si aparece, el `performed_by` ya está en la tabla para distinguirlo.
- ¿Cuánto tiempo conservar las filas ya deshechas o vencidas? No molestan a esta escala y son el insumo de un historial por pedido, así que por ahora no se limpian. Si crecen, un cron de retención es trivial de agregar.
- **"Revivir pedido" no queda registrada como deshacible en esta versión.** La reactivación de un pedido cancelado por el sistema (`cancelled → confirmed` vía `canReactivateOrder`) vuelve a *comprometer* stock y a *contar* el cupón — el efecto inverso al de las cuatro acciones estándar de la tabla D3, que siempre reponen/revierten. El registro de esta versión modela un solo sentido de efecto (`stock_restored`/`coupon_reverted` como reposición), así que encajar la reactivación exigiría una segunda dimensión de flags o una entrada con semántica opuesta — se deja fuera para no complicar D3 antes de que haya un caso de uso real que lo pida (D7/Non-Goals ya la excluye explícitamente). Consecuencia práctica: si alguien revive un pedido por error y lo cancela a mano para corregirlo, ese pedido queda con `cancelled_by = 'owner'` (D4/`updateOrderStatusInternal`) y ya no cumple `canReactivateOrder` — pierde la posibilidad de volver a revivirse por cualquiera de los dos caminos.
