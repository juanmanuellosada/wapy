## Why

Hoy una tienda que fue bloqueada por falta de pago **nunca se desbloquea sola** aunque el dueño reactive y pague: el webhook de Mercado Pago actualiza `mp_subscription_status = 'authorized'` pero ningún código en todo el proyecto vuelve a poner `blocked_at` en `NULL`, y como `blocked_at` tiene precedencia sobre `active` en el estado, la tienda queda cerrada para siempre. Tampoco hay acción manual de desbloqueo. El ciclo de billing tiene que ser 100% automático, sin intervención manual.

## What Changes

- **Desbloqueo automático al pagar (nuevo comportamiento):** cuando el webhook re-lee el preapproval desde MP y confirma `status = 'authorized'`, además de registrar el estado, limpia `blocked_at = NULL`. La regla del webhook pasa de "nunca toca `blocked_at`" a **"nunca BLOQUEA, pero SÍ puede DESBLOQUEAR"** (desbloquear es seguro; bloquear no, porque una sola notificación no debe cerrar una tienda).
- **Reconciliación en el cron (red de seguridad):** el cron diario agrega una fase que limpia `blocked_at = NULL` en cualquier tienda con `mp_subscription_status = 'authorized'` y `blocked_at IS NOT NULL`, por si el webhook se perdió o falló. Idempotente.
- **Período de gracia de 7 → 5 días:** se reduce la constante `GRACE_DAYS` en sus dos definiciones (`lib/subscription/state.ts` y el cron).

Sin cambios de esquema de base de datos (se sigue usando `blocked_at`, ya protegido por el trigger `stores_protect_billing_fields`; solo el service role escribe).

## Capabilities

### New Capabilities
<!-- Ninguna capability nueva; se modifican requirements existentes. -->

### Modified Capabilities
- `subscription-billing`: (1) el requirement de la máquina de estados cambia la gracia de 7 a 5 días; (2) el requirement del webhook deja de prohibir tocar `blocked_at` y pasa a permitir el desbloqueo cuando la suscripción está autorizada, manteniendo la prohibición de bloquear; (3) el requirement del cron cambia la gracia a 5 días y suma la reconciliación que desbloquea tiendas ya autorizadas.

## Impact

- **Código:**
  - `app/api/webhooks/mercadopago/route.ts` — al confirmar `authorized`, incluir `blocked_at: null` en el update.
  - `app/api/cron/check-subscriptions/route.ts` — fase de reconciliación que desbloquea `authorized` + bajar `GRACE_DAYS` a 5.
  - `lib/subscription/state.ts` — bajar `GRACE_DAYS` a 5.
- **Spec:** `openspec/specs/subscription-billing/spec.md` (requirements de máquina de estados, webhook y cron).
- **Datos:** las tiendas hoy bloqueadas que ya tengan `mp_subscription_status = 'authorized'` se auto-desbloquearán en la próxima corrida del cron (backfill implícito, sin migración).
- **Sin cambios** en dependencias externas ni en el esquema de DB.
