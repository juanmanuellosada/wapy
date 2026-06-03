## Why

Hoy el trial vive en dos lugares a la vez: la app (`trial_ends_at`, 14 días) y Mercado Pago (los planes `preapproval_plan` tienen `free_trial = 14d` estático). El `free_trial` de MP arranca al suscribirse, no al alta de la tienda, así que quien vincula la tarjeta tarde en su trial acumula el trial de la app **más** otro trial fresco de MP — hasta ~28 días gratis (doble-trial). Este cambio hace que la app sea la **única** dueña del trial, eliminando el doble-trial por construcción.

## What Changes

- **BREAKING (interno):** El alta de suscripción deja de redirigir al checkout hosteado de MP con `preapproval_plan_id` y pasa a crear el `preapproval` **por API sin plan asociado** (`preApproval.create`), con `free_trial` **dinámico en días** = días restantes del trial de la app (`ceil((trial_ends_at - now)/día)`, UTC). Así el primer cobro cae exacto al fin del trial.
- **Captura de tarjeta in-app con MP Bricks/CardForm** (tokenización client-side): la tarjeta nunca toca el server; solo viaja el `card_token_id` (un solo uso, expira 7 días) a una server action que crea el `preapproval` (`status: "authorized"`).
- Cuando el trial ya venció al vincular (`díasRestantes <= 0`) se **omite** `free_trial` → cobro inmediato (reactivación tras bloqueo).
- **Removal:** se eliminan los 6 `preapproval_plan` del flujo (`inicial/medio/pro` × `_RETURNING`), el helper `pickPlanId` y la dependencia de las 6 env `MP_PREAPPROVAL_PLAN_ID_*`. El monto pasa al payload (`transaction_amount = PLAN_PRICES[store.plan]`, ARS).
- **Nueva env pública** `NEXT_PUBLIC_MP_PUBLIC_KEY` para Bricks (hoy no hay public key de MP en el repo).
- Suscripciones existentes (creadas por plan) **conviven sin migración**: siguen activas y el webhook las sigue sincronizando.

## Capabilities

### New Capabilities
<!-- ninguna -->

### Modified Capabilities
- `subscription-billing`: cambia el mecanismo de alta/reactivación de suscripción (de checkout hosteado por plan a `preapproval` por API sin plan con `free_trial` dinámico + captura in-app con Bricks); se elimina la selección de plan por historial y la dependencia de los `preapproval_plan`. El trial pasa a ser fuente de verdad exclusiva de la app. El webhook firmado, el cron de bloqueo/grace, la máquina de estados, la exención por superadmin y los límites por plan **no cambian** su contrato.

## Impact

- **Código:** `lib/mercadopago.ts` (nueva función de creación de `preapproval` por API; se conserva `verifyWebhookSignature`/firma, `parseMpSubscriptionStatus`, cancelación de preapproval; se elimina `pickPlanId`), `lib/subscription/actions.ts` (se elimina `getMyCheckoutUrl`; nueva server action que recibe `card_token_id` y crea la suscripción), UI de la sección Suscripción (CTA de redirect → componente Bricks).
- **Dependencias:** se agrega `@mercadopago/sdk-js` en el cliente; `mercadopago@3.0.0` (server) ya está.
- **Config:** alta de `NEXT_PUBLIC_MP_PUBLIC_KEY`; baja de las 6 env `MP_PREAPPROVAL_PLAN_ID_*` (al final del rollout). El dueño borra los 6 planes del dashboard de MP tras el deploy.
- **Datos:** sin cambios de schema/migración — los campos (`mp_preapproval_id`, `mp_subscription_status`, `trial_ends_at`, etc.) ya existen (migración 027).
- **Sin cambios de contrato:** webhook firmado, cron de block/grace, exención superadmin, límites por plan.
