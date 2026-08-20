## Context

El canal `whatsapp` produce pedidos que el sistema no puede confirmar por sí mismo: `handleWhatsApp` crea la fila en `orders` y abre `wa.me/...`, y ahí termina toda la visibilidad. El pago se arregla por transferencia, efectivo o en persona, fuera de Wapy. No hay webhook que escuchar ni señal que consultar.

Eso es una restricción del negocio, no de la implementación: **la confirmación va a seguir siendo un acto humano**. Lo que este change ataca es que hoy ese acto es impracticable —la dueña no se entera del pedido y no puede correlacionar el chat con la fila del panel— y que el sistema no tiene ninguna política para los pedidos que quedan sin tocar.

Estado actual relevante:

- `createPendingOrder` descuenta stock y, para `channel='whatsapp'`, incrementa `coupons.uses_count` **en la creación**. Para `mercadopago` el cupón se cuenta recién al aprobarse el pago.
- `expire-orders` filtra `channel='mercadopago'` con `EXPIRE_AFTER_HOURS = 24` hardcodeado. Los pedidos de WhatsApp no son alcanzados por ningún proceso automático.
- `revertCouponUse` es no-op salvo que el status sea `confirmed`, y solo lo invoca el webhook de Mercado Pago.
- `ALLOWED_TRANSITIONS` ya existe y es correcta: `pending → confirmed|cancelled`, `confirmed → delivered|cancelled`, terminales `delivered` y `cancelled`.
- No existe `stores.settings` jsonb. La convención del repo es una columna por setting.

## Goals / Non-Goals

**Goals:**

- Que confirmar un pedido de WhatsApp no requiera ninguna búsqueda manual.
- Que un pedido de WhatsApp pendiente tenga una política definida en vez de quedar vivo indefinidamente.
- Que el stock y los usos de cupón vuelvan cuando un pedido no se concreta.
- Que los números del dashboard describan lo que realmente pasó.
- Que el historial existente no sea mutado por una suposición del sistema.

**Non-Goals:**

- Confirmación automática basada en evidencia de pago. No existe tal evidencia para este canal.
- Integración con la WhatsApp Business API. Requiere verificación de Meta por tienda y reemplazar el número personal de la dueña; desproporcionado para el segmento, y aun así solo probaría que el mensaje llegó, no que le pagaron.
- Cuentas de comprador y programa de puntos. Este change es prerequisito de eso pero no lo incluye.
- Pedirle datos nuevos a la compradora en el flujo de WhatsApp. La fricción de ese flujo no se toca.

## Decisions

### 1. El deep link va en el mensaje, y exige sesión de dueña

El mensaje de WhatsApp lo compone el sistema y lo envía la clienta. Ahí se incluye una URL al pedido en el dashboard (`/dashboard/orders?order=<uuid>`), que abre el panel con ese pedido ya seleccionado.

**Por qué esto y no un mail de aviso**: el mensaje de WhatsApp *ya es* la notificación. Llega solo, sin construir nada, y aterriza en la app donde la dueña ya está trabajando. Un mail es un segundo canal que puede quedar sin leer.

**Por qué no un link de confirmación con token que no requiera login**: la clienta tiene ese link en su propio chat y podría auto-confirmarse el pedido. Descartado. El link es solo navegación; la autorización la sigue dando la sesión, `requireOwnerStore()` y RLS.

**Consecuencia a manejar**: la dueña va a tocar el link desde el celular, probablemente deslogueada. El flujo de login debe preservar el destino y devolverla al pedido, no al dashboard genérico.

*Alternativa considerada*: solo el número correlativo, sin link. Resuelve menos —sigue habiendo que abrir el panel y buscar— y por eso el número queda como respaldo, no como mecanismo principal.

### 2. Numeración correlativa con contador atómico en `stores`

Columna `stores.order_seq` incrementada con `UPDATE stores SET order_seq = order_seq + 1 RETURNING order_seq` dentro de la creación del pedido, y `orders.store_order_number` para persistirlo.

**Por qué así**: es atómico bajo concurrencia en una sola sentencia. `SELECT max()+1` tiene carrera; las secuencias de Postgres no se crean dinámicamente por tienda; y calcularlo en lectura con `row_number()` da números inestables si se borra una fila.

**Trade-off aceptado**: los pedidos cancelados o abandonados consumen número, así que la secuencia va a tener huecos. Es el comportamiento normal de cualquier numeración tipo comprobante y es preferible a que un número se reasigne.

La migración backfillea los pedidos existentes por `created_at` dentro de cada tienda.

### 3. `orders.coupon_counted` en vez de ramificar por canal

El bug del cupón existe porque *cuándo* se cuenta el uso depende del canal (WhatsApp al crear, Mercado Pago al aprobar) mientras que `revertCouponUse` decide mirando el `status`. Los dos criterios no coinciden.

Se agrega `orders.coupon_counted boolean not null default false`, que se pone en `true` cuando efectivamente se incrementa `uses_count`. La reversión pasa a mirar esa bandera y la baja a `false`, volviéndose idempotente y agnóstica del canal.

*Alternativa considerada*: ramificar por `channel` dentro de `revertCouponUse`. Es exactamente el tipo de lógica implícita que produjo el bug; duplicarla en un segundo lugar garantiza que vuelvan a divergir.

### 4. Política de expiración configurable por tienda, conservadora por default

Dos columnas nuevas en `stores`, siguiendo la convención de columna por setting:

- `wa_pending_ttl_days integer not null default 7` — ventana antes de aplicar la política.
- `wa_auto_confirm boolean not null default false` — qué hacer al vencer.

`expire-orders` deja de filtrar por `channel='mercadopago'` y trata cada canal con su regla: Mercado Pago mantiene su ventana de 24h y cancela; WhatsApp usa `wa_pending_ttl_days` y, al vencer, **cancela** (reponiendo stock y devolviendo el cupón) salvo que la tienda haya prendido `wa_auto_confirm`.

La cancelación automática SHALL ser reversible (ver decisión 9). La manual sigue siendo terminal.

**Por qué auto-confirmar viene apagado**: confirmar sin evidencia inventa ventas en el historial de ingresos, que es un número sobre el que la dueña decide precios y reposición. Y no arregla el stock fantasma —lo que repone stock es cancelar—, así que como default resuelve menos de lo que rompe. Queda disponible para la dueña que sabe que casi todos sus pedidos se concretan y prefiere ese trade-off.

### 5. La política rige por tienda desde una fecha, no retroactivamente

Columna `stores.wa_lifecycle_effective_from timestamptz`, seteada en `now()` por la migración para las tiendas existentes y con default `now()` para las nuevas. El cron solo considera pedidos con `created_at >= wa_lifecycle_effective_from`.

**Por qué**: el backlog de pendientes mezcla ventas reales sin confirmar con carritos abandonados, sin forma de distinguirlos. Cancelarlos en masa borraría ventas reales y repondría stock de cosas vendidas; confirmarlos en masa inflaría los ingresos y ni siquiera tocaría el stock fantasma. El sistema no tiene la información para decidir: la tiene la dueña.

### 6. El backlog histórico se revisa con el panel, no con una herramienta descartable

En vez de construir UI de un solo uso, el backlog se atiende con lo que este mismo change ya agrega —filtro por canal, filtro por status y confirmación en lote— más un banner en el panel que diga cuántos pendientes previos a la fecha de corte hay y filtre a esa vista al tocarlo. El banner no se descarta: desaparece cuando el backlog se vacía.

### 7. La confirmación en lote reporta resultados parciales

Cada pedido se valida individualmente contra `ALLOWED_TRANSITIONS`. Un pedido que no puede transicionar no aborta el lote: la operación devuelve cuántos se confirmaron y cuáles fallaron y por qué. Un lote todo-o-nada sobre un backlog grande es frustrante y esconde el motivo real.

### 8. Resumen diario en cron propio, en horario local razonable

Cron nuevo, separado de `expire-orders` (que corre 05:00 UTC, o sea 02:00 en Argentina). El resumen sale a media mañana local y **solo si hay pendientes**, para que la ausencia de mail signifique algo.

### 9. La cancelación automática es reversible; la manual no

`cancelled` es terminal en `ALLOWED_TRANSITIONS`. Eso es correcto para una cancelación decidida por la dueña, pero inaceptable para una decidida por un cron: el propio motivo de este change es que hoy los pedidos no se confirman, así que el día del release la bolsa de pendientes de cada tienda contiene ventas reales. Con una ventana de 7 días, cancelarlas de forma irreversible es pérdida de datos garantizada, no un riesgo remoto.

Se distingue el origen de la cancelación (`cancelled_by`: `owner` o `system`). Una cancelación de origen `system` admite volver a `confirmed`, y al revivirla se vuelve a descontar stock y a contabilizar el uso del cupón. Una cancelación de origen `owner` se mantiene terminal.

*Alternativa considerada*: un estado `expired` separado de `cancelled`. Es más expresivo pero agrega un estado a una máquina que hoy es simple y obliga a revisar todos los lugares que filtran por status. La bandera de origen consigue lo mismo con menos superficie.

### 10. La paginación obliga a mover los filtros al servidor

`listOrders` trae 100 pedidos con `.limit(100)` y aplica los filtros de sección y de búsqueda **en memoria, después de la consulta**. Paginar sobre eso daría resultados incorrectos: filtrar la página en vez de filtrar el conjunto.

Por eso paginar no es agregar un `offset`. Los filtros de sección, búsqueda, canal, status y rango de fechas pasan todos a la consulta, y la paginación se aplica sobre el conjunto ya filtrado. La exportación a CSV SHALL exportar el conjunto filtrado completo y no la página visible.

## Risks / Trade-offs

- **El auto-cancelar destruye ventas reales que la dueña todavía no confirmó** → Es el riesgo más serio del change, porque en el release la bolsa de pendientes está llena de ventas reales precisamente por el problema que estamos arreglando. Mitigación: la cancelación automática es reversible y el aviso previo por email explicita la ventana de 7 días.
- **La corrección de `getOrderStats` baja los ingresos que la dueña ve hoy** → Es la cifra correcta, pero se percibe como una pérdida. Va anunciada en el email previo al release, explicando que antes se sumaba el bruto sin descontar cupones.
- **`wa_auto_confirm` contamina el historial de la tienda que lo prenda** → Default apagado, y la UI tiene que decir explícitamente qué implica en vez de venderlo como comodidad.
- **La dueña toca el deep link deslogueada desde el celular y pierde el destino** → El redirect de login preserva el `next`; es parte del criterio de aceptación, no un detalle de implementación.
- **La numeración correlativa queda con huecos** → Aceptado y documentado. Reasignar números sería peor.
- **Cancelar en masa el backlog repone stock de cosas que quizá se vendieron** → Por eso el sistema nunca lo hace solo: la acción en lote es siempre de la dueña, sobre una vista filtrada y explícita.
- **El deep link expone el UUID del pedido a la clienta** → Ya es su propio pedido, los UUID no son enumerables y la autorización sigue siendo la sesión de dueña. Sin impacto.

## Migration Plan

1. Migración (siguiente a `035`): `stores.order_seq`, `stores.wa_pending_ttl_days`, `stores.wa_auto_confirm`, `stores.wa_lifecycle_effective_from`, `orders.store_order_number`, `orders.coupon_counted`. Backfill de `store_order_number` por `created_at` dentro de cada tienda y de `coupon_counted` según canal y status.
2. Email de anuncio a las tiendas, **antes** de habilitar la política nueva: qué cambia, que no tienen que hacer nada, qué pasa con los pendientes viejos, y que los ingresos mostrados se corrigen.
3. Release del código con la política activa solo desde `wa_lifecycle_effective_from`.
4. Banner de backlog visible hasta que la dueña lo descarte.

**Rollback**: el cron nuevo se desactiva sin tocar datos. Las columnas agregadas son aditivas y no rompen el código anterior. Lo único no trivialmente reversible es el backfill de `store_order_number`, que igual es información derivada de `created_at`.

## Open Questions

Las tres preguntas abiertas de la primera versión quedaron resueltas:

- **Ventana de `wa_pending_ttl_days`**: 7 días por default. Decidido con el usuario, y es lo que motiva la reversibilidad de la decisión 9.
- **Número correlativo vs. identificador interno**: no conviven en la interfaz. El UUID es clave primaria y dirección de URL; el número correlativo es el identificador de negocio y lo único que se muestra. Conviven solo en el buscador, porque los pedidos anteriores al change ya circularon con el ref corto de UUID en chats reales y tienen que seguir siendo encontrables.
- **Descarte del banner de backlog**: no se descarta. No es un aviso sino un indicador de estado, y desaparece cuando el backlog se vacía. Se elimina así la necesidad de persistir el descarte.
