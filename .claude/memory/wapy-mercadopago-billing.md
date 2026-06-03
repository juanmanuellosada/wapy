---
name: wapy-mercadopago-billing
description: "Cómo está implementado el cobro de suscripciones con Mercado Pago en Wapy (planes, webhook, cron, exención, bloqueo)."
metadata: 
  node_type: memory
  type: project
  originSessionId: f3dcf624-9ab8-4bfe-932e-3a9171a084a0
---

Integración de Mercado Pago para cobrar la suscripción mensual de los dueños de tienda en Wapy, implementada 2026-05-30 vía el change OpenSpec `wapy-mercadopago-billing` (specs en `openspec/changes/wapy-mercadopago-billing/`).

**Modelo:** suscripciones recurrentes (Preapproval Plans, checkout hosteado por redirect, sin SDK de cliente). Replica el patrón del proyecto hermano `wody`.

**Planes (3 tiers desde 2026-06-01, change `add-medio-plan-tier`):** `inicial` $7.000 (20 productos / 1 sección / 1 imagen por producto / SIN variantes), `medio` $9.000 (50 / 3 / imágenes ilimitadas / con variantes — es el ex-`inicial` renombrado), `pro` $18.000 (todo ilimitado). Todos con 14 días de trial. Límites por plan en `lib/plans/limits.ts` (`getPlanLimits`: `maxProducts/maxSections/maxImagesPerProduct/allowVariants`), enforced en `lib/store/actions.ts` y `lib/variants/actions.ts`. Hay **2 Preapproval Plans en MP por cada plan** (6 total): uno CON 14 días de trial (alta nueva, `mp_preapproval_id IS NULL`) y uno SIN trial (reactivación). Trial = 14 días desde creación de la tienda. Gracia tras pago fallido = 7 días.

**Decisiones clave:**
- Webhook (`app/api/webhooks/mercadopago/route.ts`) SOLO registra estado (valida firma HMAC, re-lee el preapproval desde MP, idempotente). NUNCA setea `blocked_at`.
- Cron diario (`app/api/cron/check-subscriptions/route.ts`, `vercel.json` 06:00 UTC, protegido `Bearer CRON_SECRET`) es el ÚNICO que bloquea: trial vencido sin suscripción, o pago fallido +7d.
- Estado se DERIVA con `getSubscriptionState(store, now)` puro en `lib/subscription/state.ts`: precedencia `exempt > blocked > active > grace > trial`.
- Bloqueo dual: storefront muestra MaintenancePage aunque `status='published'`; dashboard solo deja `/dashboard/subscription`.
- Escrituras de billing SOLO con service role — protegido por trigger `stores_protect_billing_fields` (el REVOKE por columna es inefectivo en Supabase porque `authenticated` tiene UPDATE a nivel tabla + policy `stores_update_owner`). Relacionado: [[wapy-storage-jwt-gotcha]].
- Cambio de plan entre los 3 (inicial/medio/pro): `changePlan` actualiza `stores.plan` (límites al instante) + checkout del plan destino. Downgrade NO borra contenido excedente, solo bloquea agregar más. La cancelación del preapproval viejo YA está implementada (v2): el webhook, al recibir un preapproval `authorized` con id distinto al guardado para esa tienda, cancela el viejo en MP (no-fatal). Falta validarlo en E2E con tarjetas sandbox.
- Tiendas exentas (`payment_exempt`): nunca se bloquean pero PUEDEN vincular pago real sin perder la exención (para testing). Solo superadmin togglea exención (`app/admin/stores`).

**Migración:** `supabase/migrations/027_store_billing.sql` → APLICADA a prod 2026-05-30 (el usuario la corrió a mano en Supabase Studio; verificado: 6/6 columnas + trigger=1; 3 tiendas, 3 exentas). Agregó a `stores`: mp_preapproval_id, mp_subscription_status, subscription_status_changed_at, payment_exempt, payment_exempt_reason, blocked_at. Backfill marcó las 3 tiendas existentes como exentas (grandfathering). `plan` y `trial_ends_at` ya existían (migración 023). El proyecto NO tiene supabase CLI instalado ni vínculo local.

**SEGURIDAD:** el trigger `stores_protect_billing_fields` es la protección REAL contra que un owner se auto-exima/desbloquee (el REVOKE por columna es inefectivo en Supabase porque `authenticated` tiene UPDATE a nivel tabla + policy `stores_update_owner`). NUNCA dropearlo.

**Migración 028** (`supabase/migrations/028_add_medio_plan.sql`): APLICADA a prod 2026-06-01 vía Supabase MCP (apply_migration). Renombró `inicial`→`medio` en `stores`/`whitelist`, amplió los CHECK de plan a 3 valores, y relajó `products_image_urls_check` de ≤10 a ≤20 (límite real de imágenes ahora es por plan en capa de app). OJO: el orden importa — los DROP CONSTRAINT van ANTES de los UPDATE (sino el UPDATE viola el CHECK viejo inicial/pro). El archivo local ya tiene ese orden corregido. Migraciones 023/027/028 se aplicaron fuera del tracking de migrations (Studio/MCP), por eso el historial remoto figura hasta 026 aunque las columnas existen.

**Env vars (en Vercel, NO en .env.local real):** MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET, CRON_SECRET, MP_PREAPPROVAL_PLAN_ID_{INICIAL,INICIAL_RETURNING,MEDIO,MEDIO_RETURNING,PRO,PRO_RETURNING} (6, las de MEDIO agregadas 2026-06-01). Webhook MP apunta a https://wapy.com.ar/api/webhooks/mercadopago (evento "Planes y suscripciones"). App de MP es propia de Wapy (separada de wody).

**Pendiente al cierre:** deploy a Vercel (las env vars toman efecto en el próximo deploy); verificación end-to-end con tarjetas de prueba. Rama `feat/mercadopago-billing` pusheada a origin (PR aún no creado — `gh` CLI no instalado; crear desde GitHub web).
