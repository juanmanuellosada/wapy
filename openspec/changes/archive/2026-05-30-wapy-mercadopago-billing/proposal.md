## Why

Hoy las tiendas de Wapy no tienen forma de pagar la suscripción: el modelo de planes (`inicial`/`pro`) existe a nivel de límites, pero no hay cobro real, ni bloqueo por falta de pago, ni exención. Para pasar de demo a SaaS facturable necesitamos cobrar la suscripción mensual de cada dueño vía Mercado Pago, con prueba gratis, reactivación sin doble trial, y corte de servicio automático cuando no se paga.

## What Changes

- Cobro de suscripción mensual por tienda vía Mercado Pago (Preapproval Plans, checkout hosteado por redirect).
- **14 días de prueba gratis** para tiendas nuevas; reactivación **sin** nueva prueba (dos planes de MP por cada plan de app: uno con trial y uno sin trial).
- Nueva máquina de estados de suscripción por tienda: `exento | trial | activo | en_gracia | bloqueado`.
- Webhook de Mercado Pago que registra el estado de la suscripción (no bloquea).
- Cron diario que bloquea tiendas con trial vencido sin suscripción, o con pago fallido luego de **7 días de gracia** (único punto que setea `blocked_at`).
- **Cambio de plan (upgrade/downgrade inicial↔pro)** desde la sección de Suscripción: ajusta el cobro (resuscripción al plan de MP correspondiente) y aplica/levanta los límites del plan de inmediato.
- **Bloqueo dual** cuando la tienda no está al día: la tienda pública muestra mantenimiento/"no disponible" y el dashboard del dueño queda restringido solo a la página de Suscripción.
- **Exención de pago** (grandfathering): tiendas pre-existentes quedan exentas; el superadmin puede marcar/desmarcar cualquier tienda como exenta con un motivo. Una tienda exenta **nunca se bloquea**, pero **puede igualmente ver la sección de Suscripción y vincular un medio de pago real** (útil para probar la integración).
- Nueva sección "Suscripción" en el dashboard del dueño (estado, precio, suscribir/reactivar, cancelar) y banner de aviso de vencimiento/pago pendiente.
- Sección de suscripción/exención por tienda en el panel de superadmin.
- Precios de los planes extraídos a una config compartida (Inicial $9.900, Pro $18.000) para no duplicar la landing.
- Nueva dependencia `mercadopago` v3 y variables de entorno de MP (ya cargadas en Vercel).

## Capabilities

### New Capabilities
- `subscription-billing`: cobro recurrente de la suscripción por tienda vía Mercado Pago — checkout, trial, reactivación, webhook, cron de bloqueo, exención, máquina de estados, y la UI de suscripción en dashboard y superadmin.

### Modified Capabilities
- `public-storefront`: una tienda cuya suscripción no está al día (bloqueada por falta de pago) deja de ser accesible públicamente y muestra el estado de mantenimiento/"no disponible", aunque su `status` sea `published`.

## Impact

- **DB**: nueva migración en `supabase/migrations/` agregando a `stores` los campos de billing (`mp_preapproval_id`, `mp_subscription_status`, `subscription_status_changed_at`, `payment_exempt`, `payment_exempt_reason`, `blocked_at`) + backfill de exención + RLS. (`plan` y `trial_ends_at` ya existen.)
- **Nuevo código server**: `lib/mercadopago.ts`, `lib/subscription/` (actions + lógica de estado + config de precios), `app/api/webhooks/mercadopago/route.ts`, `app/api/cron/check-subscriptions/route.ts`, `vercel.json` (cron).
- **Guards**: `app/dashboard/` (page + layout) y `app/[slug]/` (storefront).
- **UI**: nueva sección `subscription` en el dashboard (Sidebar + VALID_SECTIONS + `SubscriptionPanel`), banner, y sección de exención en `app/admin/`.
- **Config/deps**: `package.json` (`mercadopago`), `.env.example` (nombres de vars MP).
- **Externo**: cuenta/app de Mercado Pago con 4 Preapproval Plans y webhook configurado (ya hecho por el dueño).
