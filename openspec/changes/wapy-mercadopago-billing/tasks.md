# Tasks — wapy-mercadopago-billing

## 1. Base de datos
- [x] 1.1 Crear migración `supabase/migrations/0XX_store_billing.sql` que agregue a `stores`: `mp_preapproval_id text`, `mp_subscription_status text`, `subscription_status_changed_at timestamptz`, `payment_exempt boolean NOT NULL DEFAULT false`, `payment_exempt_reason text`, `blocked_at timestamptz`.
- [x] 1.2 En la misma migración, backfill de grandfathering: `payment_exempt = true` + `payment_exempt_reason` para todas las tiendas existentes.
- [x] 1.3 RLS: política de lectura de los campos de billing para el owner (sobre su tienda) y para superadmin; sin políticas de escritura para roles no-service.
- [x] 1.4 Verificar que el alta de tienda (onboarding) setee `trial_ends_at = now() + 14 días` para tiendas nuevas; ajustar si no lo hace.
- [x] 1.5 Regenerar `lib/supabase/types.ts` con los nuevos campos.

## 2. Cliente y helpers de Mercado Pago
- [x] 2.1 Agregar dependencia `mercadopago` v3 al `package.json`.
- [x] 2.2 Crear `lib/mercadopago.ts`: cliente singleton (`MercadoPagoConfig` + `PreApproval`) con `MP_ACCESS_TOKEN`, `verifyWebhookSignature(...)` (con `WebhookSignatureValidator` + `MP_WEBHOOK_SECRET`), y `pickPlanId(appPlan, isReturning)` mapeando a las 4 env vars de planes.
- [x] 2.3 Crear `lib/subscription/plans.ts` con la config de precios compartida (`inicial: 9900`, `pro: 18000`) + helper de formato; refactor mínimo de `app/components/Pricing.tsx` para consumirla.

## 3. Lógica de estado
- [x] 3.1 Crear `lib/subscription/state.ts` con `getSubscriptionState(store, now)` puro → `exempt | trial | active | grace | blocked` (precedencia y gracia de 7 días según design) + helpers `daysLeftInTrial`, `isPubliclyAvailable`.
- [x] 3.2 Tests unitarios de `getSubscriptionState` cubriendo cada estado y los bordes de gracia/trial.

## 4. Webhook
- [x] 4.1 Crear `app/api/webhooks/mercadopago/route.ts` (POST): validar firma → `preApproval.get({id})` → upsert idempotente de `mp_preapproval_id`/`mp_subscription_status`/`subscription_status_changed_at` por `external_reference` (store_id) con admin client; nunca tocar `blocked_at`.
- [x] 4.2 Manejar firma inválida (rechazo), eventos no relevantes (ack) y avance de `subscription_status_changed_at` solo en cambio real de status.

## 5. Cron de bloqueo
- [x] 5.1 Crear `app/api/cron/check-subscriptions/route.ts` (GET) protegido por `Authorization: Bearer ${CRON_SECRET}`.
- [x] 5.2 Fase 1: bloquear (`blocked_at = now()`) tiendas no exentas con trial vencido y `mp_preapproval_id` nulo.
- [x] 5.3 Fase 2: bloquear tiendas no exentas en `paused`/`cancelled` desde hace > 7 días.
- [x] 5.4 Crear/actualizar `vercel.json` con el cron diario apuntando a `/api/cron/check-subscriptions`.

## 6. Server actions de suscripción
- [x] 6.1 Crear `lib/subscription/actions.ts` con `getMyCheckoutUrl(plan)`: `requireOwner` → resolver tienda → `pickPlanId` según historial → armar URL con `external_reference=store_id` y `back_url`.
- [x] 6.2 `cancelSubscription()`: cancelar el preapproval en MP para la tienda del owner.
- [x] 6.3 `setStorePaymentExempt(storeId, exempt, reason)`: solo superadmin; escribe con admin client.
- [x] 6.4 `changePlan(targetPlan)`: actualizar `stores.plan` (aplica/levanta límites de inmediato) y devolver el checkout del plan destino (returning, sin trial); al autorizarse la nueva suscripción, cancelar el preapproval anterior para evitar doble cobro. `getMyCheckoutUrl` debe funcionar también para tiendas `exempt` (vincular pago sin quitar la exención).

## 7. Guards de bloqueo
- [x] 7.1 Dashboard: en `app/dashboard/page.tsx` y el layout, computar estado; si `blocked`, permitir solo `/dashboard/subscription` (redirigir el resto ahí). El guard NO debe restringir a tiendas `exempt` (acceso normal + sección de Suscripción usable).
- [x] 7.2 Storefront: en `app/[slug]/` (resolver/page/layout), si la tienda está `blocked`, renderizar `MaintenancePage` aunque `status='published'`.

## 8. UI del dashboard del dueño
- [x] 8.1 Agregar `'subscription'` a `VALID_SECTIONS` en `app/dashboard/[section]/page.tsx` y el item (icono `CreditCard`) en `Sidebar.tsx` (`NAV_ITEMS`).
- [x] 8.2 Crear `app/dashboard/components/SubscriptionPanel.tsx`: muestra plan, precio (config compartida), estado (trial con días / activo / gracia / bloqueado / exento) y acciones (suscribir/reactivar → checkout, cancelar, **cambiar de plan inicial↔pro**). Para `exempt`: muestra el cartel de exención **y** la acción de vincular/suscribir pago real.
- [x] 8.3 Banner de "tu prueba vence en X días" / "pago pendiente" en el dashboard (cuando `trial` por vencer o `grace`/`blocked`).

## 9. UI del superadmin
- [x] 9.1 En `app/admin/`, agregar vista del estado de suscripción por tienda y toggle de exención (motivo) usando `setStorePaymentExempt`.

## 10. Config y documentación
- [x] 10.1 Actualizar `.env.example` con los nombres de las variables de MP (`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `CRON_SECRET`, los 4 `MP_PREAPPROVAL_PLAN_ID_*`) sin valores.

## 11. Verificación end-to-end
- [ ] 11.1 Build/typecheck/lint OK y tests de estado en verde.
- [ ] 11.2 Tras deploy: simular webhook desde MP (firma válida) y confirmar actualización de estado.
- [ ] 11.3 Flujo completo con credenciales/tarjetas de prueba: alta → trial → suscribir → `active`; simular `paused` → gracia → (cron) `blocked` → reactivar (plan sin trial).
- [ ] 11.4 Confirmar bloqueo dual (storefront + dashboard) y exención por superadmin.
