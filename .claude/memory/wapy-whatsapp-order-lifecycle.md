---
name: wapy-whatsapp-order-lifecycle
description: Change fix-whatsapp-order-lifecycle implementado 2026-08-19; migraciones 036/037 aplicadas a prod, código sin deployar.
metadata:
  type: project
---

Auditado el 2026-08-19. El pedido del canal `whatsapp` queda `pending` para siempre porque la dueña **no tiene forma razonable de confirmarlo**: no le llega ningún aviso, y el único puente entre el chat y la fila del panel es un `orderRef` de 8 caracteres de UUID que tiene que cruzar a mano.

**Why:** esto no es solo tedio — genera stock fantasma permanente (el cron `expire-orders` filtra `channel='mercadopago'`), quema usos de cupón de forma irreversible, y subestima los ingresos (`getOrderStats` solo cuenta `confirmed|delivered`).

**How to apply:**
- La mejor solución encontrada es meter un **link directo al pedido en el mensaje de WhatsApp** que la clienta le manda a la dueña, protegido por sesión de dueña. El mensaje ya *es* la notificación — llega solo, no hay que construirla. Esto vuelve secundarios el mail de aviso y el número correlativo.
- **No confirmar en masa los pendientes históricos.** Se evaluó y se descartó: mezcla ventas reales con carritos abandonados, infla el historial de ingresos, y encima no arregla el stock fantasma (lo que repone stock es *cancelar*, no confirmar). En su lugar: trazar una línea por fecha de release, dejar el historial intacto, y dar una herramienta de revisión en lote por única vez.
- Cualquier política nueva de expiración se **anuncia por mail a las tiendas antes** de aplicarse, no después.

Es prerequisito de [[wapy-loyalty-points-program]] pero tiene valor solo. Relacionado: [[wapy-mp-known-gaps]].

**Estado al 2026-08-19**: change `fix-whatsapp-order-lifecycle` implementado (65/69 tareas; las 4 restantes son envío del mail, deploy y verificación en prod). Migraciones **036 y 037 aplicadas a producción** (proyecto Supabase `gtiujuarwoatjekmljhn`), backfill verificado sin huecos ni duplicados. **El código NO está deployado todavía** — mientras tanto, los pedidos nuevos entran sin `store_order_number` porque el código viejo no llama al RPC `next_order_number`; conviene un backfill corto después del deploy.

Dato que cuantifica el problema: **40 de 59 pedidos** en prod eran pedidos de WhatsApp pendientes sin confirmar (68%). Por eso se descartó tocar el backlog en masa.

Política final: TTL de 7 días por tienda (`stores.wa_pending_ttl_days`), auto-confirmar opt-in y apagado (`wa_auto_confirm`), y **la cancelación automática es reversible** (`orders.cancelled_by` distingue `owner` de `system`) — sin eso, el release habría destruido ventas reales.
