## Context

Wapy es un SaaS de tiendas WhatsApp (Next.js 16 App Router + Supabase). Cada dueño tiene una tienda (`stores`, relación 1:1 con `users` → `auth.users`). Ya existen `stores.plan ('inicial'|'pro')` y `stores.trial_ends_at`, y `lib/plans/limits.ts`. El proyecto usa Server Actions (`lib/{feature}/actions.ts`); **no** hay `app/api/` todavía. Los clientes Supabase viven en `lib/supabase/server.ts`: `createServerClient` (sesión, respeta RLS) y `createAdminClient` (service role, bypassa RLS — único que escribe el estado de billing).

Replicamos el patrón ya probado en el proyecto hermano "wody": suscripciones recurrentes de Mercado Pago vía **Preapproval Plans** con checkout hosteado, webhook que solo registra estado, y cron diario que aplica los bloqueos.

Restricción conocida (memoria infra): el Storage worker de Supabase no verifica JWT ES256, por lo que `auth.uid()` puede quedar NULL en algunos contextos server; por eso **toda escritura de estado de billing se hace con el admin client**, nunca dependiendo de RLS para el write.

## Goals / Non-Goals

### Goals
- Cobrar la suscripción mensual de cada tienda vía Mercado Pago.
- Trial de 14 días para nuevas; reactivación sin doble trial.
- Bloquear automáticamente (tienda pública + dashboard) cuando no se paga.
- Permitir exención manual (superadmin) y grandfathering de tiendas existentes.
- UI clara de suscripción para el dueño y de control para el superadmin.

### Goals (cont.)
- Permitir al dueño **cambiar de plan (upgrade/downgrade inicial↔pro)** ajustando tanto el cobro como los límites del plan.
- Permitir que una tienda **exenta** vincule un medio de pago real sin perder la exención (para pruebas y para futura transición a no-exenta).

### Non-Goals
- Pagos únicos / addons (solo suscripción mensual recurrente).
- Prorrateo fino propio: el ajuste de monto al cambiar de plan lo resuelve Mercado Pago vía la nueva suscripción.
- Facturación electrónica / emisión de comprobantes AFIP.
- Cobrar a los **clientes** de la tienda (esto es el cobro al **dueño**; el checkout de productos sigue por WhatsApp).
- Webhooks de eventos de pago individuales más allá de lo necesario para el estado de la suscripción.

## Decisions

### Decision 1: Preapproval Plans con checkout hosteado (redirect), sin SDK de cliente
**Qué**: Suscribir redirigiendo a `https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=<PLAN_ID>&external_reference=<store_id>`. No usamos Public Key ni Brick/SDK de browser.
**Por qué**: Es el flujo más simple y el ya validado en wody; MP hostea la captura de tarjeta (menos superficie PCI), y el `external_reference` nos devuelve el `store_id` en el webhook.
**Alternativas**: (a) Preapproval por API creando la suscripción server-side con `card_token` (requiere SDK de cliente + tokenización, más complejo); (b) Checkout Pro de pago único recurrente manual (reinventar la recurrencia). Descartadas por complejidad.

### Decision 2: Dos planes de MP por plan de app (con/sin trial) y selección por historial
**Qué**: 4 Preapproval Plans en MP → 4 env vars. `pickPlanId(appPlan, isReturning)`:
- primera suscripción (`mp_preapproval_id IS NULL`) → plan **con** trial (`..._INICIAL` / `..._PRO`).
- reactivación (`mp_preapproval_id IS NOT NULL`) → plan **sin** trial (`..._INICIAL_RETURNING` / `..._PRO_RETURNING`).
**Por qué**: MP fija el `free_trial` a nivel de plan; no se puede anular por-suscripción. Sin el plan "returning", quien cancela y vuelve obtendría otra prueba gratis.
**Alternativas**: un solo plan + lógica de trial propia (MP igual respetaría el free_trial del plan → trial duplicado). Descartada.

### Decision 3: Máquina de estados derivada, no persistida como un único enum
**Qué**: El estado efectivo se **computa** con un helper puro `getSubscriptionState(store, now)` a partir de campos crudos (`payment_exempt`, `trial_ends_at`, `mp_subscription_status`, `subscription_status_changed_at`, `blocked_at`). Estados: `exempt | trial | active | grace | blocked`.
- `exempt`: `payment_exempt = true`.
- `blocked`: `blocked_at IS NOT NULL`.
- `active`: `mp_subscription_status = 'authorized'`.
- `trial`: sin suscripción autorizada y `now < trial_ends_at`.
- `grace`: `mp_subscription_status IN ('paused','cancelled')` y `now - subscription_status_changed_at < 7d` (o trial vencido aún dentro de margen, ver Migration).
- en otro caso, candidato a `blocked` (lo aplica el cron).
**Por qué**: Una sola fuente de verdad para guards (dashboard + storefront) y UI; evita estados inconsistentes entre webhook y app. El `blocked_at` persistido es el "latch" que solo el cron levanta.
**Alternativas**: persistir un enum `subscription_status` único actualizado en cada lectura (riesgo de drift, writes en GET). Descartada.

### Decision 4: El webhook registra; el cron bloquea
**Qué**: `POST /api/webhooks/mercadopago` valida firma HMAC (`WebhookSignatureValidator` con `MP_WEBHOOK_SECRET`, headers `x-signature`/`x-request-id` + `data.id`), hace `preApproval.get({id})`, y actualiza `mp_preapproval_id`, `mp_subscription_status`, `subscription_status_changed_at`. **No** setea `blocked_at`. El cron diario `GET /api/cron/check-subscriptions` (auth `Bearer ${CRON_SECRET}`) aplica los bloqueos.
**Por qué**: Los webhooks de MP pueden llegar desordenados/repetidos; concentrar el efecto destructivo (bloqueo) en un proceso idempotente y único evita cortar servicio por un evento transitorio. Da naturalmente el período de gracia.
**Alternativas**: bloquear desde el webhook (frágil ante reintentos/orden). Descartada.

### Decision 5: Idempotencia y verificación del webhook contra la API de MP
**Qué**: Nunca confiamos en el body para el estado; siempre re-leemos el preapproval desde MP con el access token y tomamos `status` y `external_reference` de la respuesta. La operación es un upsert idempotente por `store_id`. Solo avanzamos `subscription_status_changed_at` cuando el `status` realmente cambia.
**Por qué**: Evita spoofing y procesamiento incoherente ante reentregas. Idempotente por diseño.

### Decision 6: Bloqueo dual aplicado en guards de servidor (no solo RLS)
**Qué**: 
- Dashboard: guard en `app/dashboard/` que, si `state === 'blocked'`, permite solo `/dashboard/subscription` (redirige el resto ahí).
- Storefront: `app/[slug]/` trata una tienda `blocked` como no disponible (muestra `MaintenancePage`) aunque `status='published'`.
**Por qué**: El bloqueo es lógica de producto que combina varios campos; resolverlo en el render server es simple y testeable. RLS se mantiene como defensa de datos, no como mecanismo de UX.

### Decision 7: Escrituras de billing solo con admin client + RLS de lectura
**Qué**: Migración agrega los campos a `stores`. RLS: el owner puede **leer** su propio estado de billing; **ningún** rol no-service puede escribir los campos de billing (los maneja el service role desde webhook/cron/actions server). El superadmin lee todo (policy existente).
**Por qué**: Coherente con el gotcha ES256 y con que el estado lo dictan MP/cron, no el cliente.

### Decision 8: Precios en config compartida
**Qué**: Extraer `{ inicial: 9900, pro: 18000 }` (+ formato) a `lib/subscription/plans.ts` (o `lib/plans/`), consumido por la landing (`Pricing.tsx`) y por `SubscriptionPanel`.
**Por qué**: Evitar que el precio mostrado en dashboard y landing diverjan. Los montos reales de cobro viven en MP (en los planes), esto es solo display.

### Decision 9: Cambio de plan (upgrade/downgrade) = cambiar `stores.plan` + resuscribir al plan de MP correspondiente
**Qué**: La acción `changePlan(targetPlan)` (a) actualiza `stores.plan` al plan destino (lo que aplica/levanta los límites de `lib/plans/limits.ts` de inmediato), y (b) lleva al checkout del Preapproval Plan del plan destino para ajustar el cobro. Como ya hay historial de suscripción (`mp_preapproval_id` no nulo) se usa el plan **sin trial** (returning) del destino; al autorizarse la nueva suscripción, el webhook actualiza `mp_preapproval_id`. La suscripción anterior se cancela en MP al confirmarse la nueva (o el dueño la cancela), evitando doble cobro.
**Por qué**: MP no permite mutar el `transaction_amount`/plan de un preapproval existente; la vía soportada es una suscripción nueva. Separar "límites" (efecto inmediato, vía `stores.plan`) de "cobro" (efecto al autorizar en MP) hace el upgrade percibido como instantáneo sin esperar el webhook.
**Trade-off**: ventana corta con dos preapprovals (viejo + nuevo) hasta cancelar el viejo; se mitiga cancelando el anterior en cuanto la nueva queda `authorized`. Downgrade pro→inicial con >50 productos: se permite el cambio de cobro pero los límites de creación nuevos aplican hacia adelante (no se borran productos existentes); se documenta como borde.
**Alternativas**: diferir el cambio de plan a una versión posterior (descartado: el usuario lo pidió en v1).

### Decision 10: La sección de Suscripción es accesible siempre, incluso para tiendas exentas
**Qué**: El guard de dashboard solo **restringe el resto** de secciones cuando la tienda está `blocked`; la sección de Suscripción está disponible en todos los estados, incluido `exempt`. Para una tienda exenta, el panel muestra el cartel de exención **y además** ofrece la acción de vincular/suscribir un medio de pago real (`getMyCheckoutUrl`). Vincular pago **no** quita la exención (`payment_exempt` solo lo cambia el superadmin); la suscripción autorizada coexiste con la exención y la exención sigue teniendo precedencia para el bloqueo.
**Por qué**: Permite probar la integración de pago real sin exponerse a bloqueos, y deja lista la transición a no-exenta. Coherente con Decision 3 (precedencia `exempt` sobre todo para el bloqueo, pero no para la visibilidad de la página).

## Risks / Trade-offs

- **Precio en MP vs config desincronizados**: el monto que se cobra lo define el plan en MP; la config solo muestra. Si cambian uno y no el otro, el usuario ve un precio y se le cobra otro. Mitigación: documentar que al cambiar precio se actualizan ambos; idealmente, a futuro, leer el monto desde el plan de MP.
- **Free trial atado al plan de MP**: si se quiere cambiar la duración del trial hay que recrear/editar el plan en MP además del backfill. Aceptado.
- **Webhook antes del deploy**: el endpoint no existe hasta deployar; pruebas de simulación de MP fallarán hasta entonces. Aceptado (orden de rollout).
- **Cron diario (Hobby = 1×/día)**: el bloqueo puede tardar hasta ~24h tras vencer la gracia. Aceptable para cobro mensual.
- **Reactivación / múltiples preapprovals**: si un usuario genera varias suscripciones en MP, nos quedamos con la última autorizada vía `external_reference=store_id`. Riesgo bajo; el webhook siempre refleja el último `status` leído.
- **Cambio de plan inicial↔pro**: modelado como cancelar+resuscribir; puede dejar una ventana corta de estado intermedio. Aceptado para v1.

## Migration Plan

1. **Migración SQL** (nuevo archivo `0XX_store_billing.sql`):
   - `ALTER TABLE stores` agrega `mp_preapproval_id text`, `mp_subscription_status text`, `subscription_status_changed_at timestamptz`, `payment_exempt boolean NOT NULL DEFAULT false`, `payment_exempt_reason text`, `blocked_at timestamptz`.
   - **Backfill grandfathering**: `UPDATE stores SET payment_exempt = true, payment_exempt_reason = 'Tienda pre-existente al lanzamiento del cobro (2026-05)'` para todas las tiendas existentes al momento de migrar.
   - Tiendas nuevas (post-migración) NO son exentas; su `trial_ends_at` se setea en el alta (onboarding) a `now() + 14 días` si no estaba seteado.
   - RLS: políticas de lectura de los campos para el owner; sin políticas de escritura para roles no-service.
2. **Código**: agregar `mercadopago` a deps; crear `lib/mercadopago.ts`, `lib/subscription/*`, webhook, cron, `vercel.json`; guards; UI dashboard/admin; banner; `.env.example`.
3. **Deploy** a Vercel (las env vars ya están cargadas) → el endpoint del webhook queda vivo.
4. **Configurar/verificar webhook en MP** apuntando al endpoint productivo y simular un evento.
5. **Verificación**: alta de tienda nueva → trial; suscribir con tarjeta de prueba → `active`; simular `paused` → gracia → (cron) `blocked` → reactivar (plan sin trial). Confirmar bloqueo dual y exención por superadmin.

## Resolved Questions

- **Inicio del trial**: cuenta desde la **creación** de la tienda (onboarding). Verificar que el alta setee `trial_ends_at`; si no, agregarlo.
- **Cambio de plan (inicial↔pro)**: **incluido en v1** — ajusta cobro (resuscripción al plan de MP destino) y límites (`stores.plan`) de inmediato. Ver Decision 9.
- **Emails (Resend)** en trial por vencer / pago fallido: **fuera de v1**, solo banner in-app; email como mejora posterior.
- **Tienda exenta**: nunca se bloquea, pero la sección de Suscripción es accesible y puede vincular pago real sin perder la exención. Ver Decision 10.

## Open Questions

- (Ninguna que bloquee la implementación.)
