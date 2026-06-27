## Context

Wapy ya tiene una integración con Mercado Pago **para billing de la plataforma**: un único `MP_ACCESS_TOKEN` global (la cuenta de Wapy) que cobra las suscripciones de los dueños vía `PreApproval` (`lib/mercadopago.ts`, `lib/subscription/actions.ts`, webhook en `app/api/webhooks/mercadopago/route.ts`). Este cambio agrega una integración **distinta y ortogonal**: cobrar los pedidos de los compradores **a la cuenta de cada dueño**, lo que requiere OAuth y tokens por-tienda.

Estado actual relevante (verificado en el código):
- `orders` y `order_items` **ya existen** (`019_orders.sql`) y el flujo WhatsApp ya crea una orden `pending` vía `createPendingOrder` (`lib/store/orders/actions.ts`). La sección "Pedidos" del dashboard ya existe (`OrdersPanel`, `listOrders`, `getOrderStats`).
- RLS de orders: INSERT bloqueado para clientes; solo `service_role` (admin client) escribe. Owner lee/actualiza vía join a `stores.owner_id`. Plantilla directa para columnas de pago.
- Convención: Server Actions en `lib/<dominio>/actions.ts`; route handlers solo para webhooks/cron. `createServerClient()` para auth, `createAdminClient()` (service role, bypassa RLS) para operar.
- Patrón de columnas protegidas: trigger `prevent_billing_column_writes()` que solo permite escritura a `current_user = 'service_role'` (`027_store_billing.sql`).
- **No existe ningún patrón de cifrado** en el repo. Todos los secrets son env vars globales.
- Webhook de billing: verifica firma (`verifyWebhookSignature`), discrimina por `type`, re-lee desde MP, idempotente por comparación de estado. Es el patrón a replicar.
- Última migración: `030_coupons.sql` → la próxima es `031_`.

## Goals / Non-Goals

**Goals:**
- Permitir que una tienda opere en modo `mercadopago`: el comprador paga online y la plata va directo a la cuenta MP del dueño.
- Reutilizar el modelo de pedidos existente extendiéndolo con estado de pago, sin duplicar entidades.
- Que el estado del pedido sea confiable: la fuente de verdad es el webhook que re-lee el pago desde MP, no el redirect del navegador.
- Introducir el primer patrón de almacenamiento cifrado de secrets por-tienda, mínimo y auditable.
- No romper el flujo WhatsApp existente (default).

**Non-Goals:**
- Split de pagos / comisión marketplace (la plata pasa directo al dueño; Wapy no la toca).
- Control de stock/inventario al pagar (se trata en una fase posterior).
- Notificaciones automáticas al comprador (email/WhatsApp post-pago).
- Múltiples métodos de envío / cálculo de costos de envío.
- Cuenta de comprador / login del comprador (guest checkout únicamente).

## Decisions

### D1. Cobro a la cuenta del dueño vía OAuth de Mercado Pago (no split)
El dueño autoriza a Wapy como aplicación MP; guardamos su `access_token` + `refresh_token`. Las preferencias de Checkout Pro se crean con **el token del dueño**, por lo que el dinero entra directo a su cuenta.
- **Alternativa descartada (split/Marketplace, `marketplace_fee`)**: implicaría que Wapy intermedie fondos → KYC, responsabilidad sobre contracargos y reconciliación. Sobredimensionado para el MVP y un modelo de negocio aún no decidido.
- **Alternativa descartada (pegar credenciales a mano)**: peor UX y más riesgo de que el dueño exponga su access token productivo. OAuth da refresh y revocación.

### D2. Extender `orders`, no crear tablas nuevas
Migración `031_` agrega a `orders`: `channel` (`whatsapp` | `mercadopago`, default `whatsapp`), `payment_status` (`pending` | `approved` | `rejected` | `cancelled`, default `pending`), `mp_preference_id text`, `mp_payment_id text`, y los datos de contacto/entrega del comprador si no están ya (revisar el esquema actual de `orders` antes de agregar). Las columnas de pago las escribe **solo el webhook** (service role) — proteger con trigger estilo `prevent_billing_column_writes()`.
- **Alternativa descartada (tabla `payments` separada)**: 1 pedido ↔ 1 intento de pago en el MVP; una tabla aparte agrega joins sin beneficio. Si en el futuro hay reintentos múltiples, se promueve a tabla.

### D3. Toggle `checkout_mode` en `stores`
Columna `checkout_mode text NOT NULL DEFAULT 'whatsapp' CHECK (checkout_mode IN ('whatsapp','mercadopago'))`. Gating: el modo `mercadopago` solo es seleccionable/efectivo si la tienda tiene una conexión MP válida; si no, el storefront cae a WhatsApp y el dashboard muestra el estado "conectá tu cuenta".
- **Alternativa descartada (modo por producto)**: descartada explícitamente con el usuario — toggle por tienda.

### D4. Preferencia de Checkout Pro creada server-side con precios de la DB
Una Server Action pública (invocable desde el storefront sin sesión de dueño) recibe el carrito (ids + cantidades + variante) y los datos del comprador, **recalcula los precios desde la DB** (incluyendo cupones/variantes con la lógica existente), crea la orden `pending` (reusando/extendiendo `createPendingOrder`), crea la preferencia con el token del dueño, guarda `mp_preference_id` en la orden, y devuelve el `init_point` para redirigir.
- El cliente nunca manda precios. `external_reference` de la preferencia = `order.id` para correlacionar en el webhook.
- `back_urls` → `app/[slug]/checkout/(success|failure|pending)`; `notification_url` → webhook de pedidos.

### D5. Webhook de pedidos separado del de billing, fuente de verdad
Nuevo route handler `app/api/webhooks/mercadopago-orders/route.ts` (`runtime='nodejs'`, `force-dynamic`):
1. Verifica firma con su propio secreto (`MP_ORDERS_WEBHOOK_SECRET`); 401 si falla.
2. Filtra por `type = 'payment'`; ack 200 para otros tipos.
3. **Re-lee el pago desde MP** con el token del dueño (`Payment.get(id)`) — no confía en el body ni en el redirect.
4. Correlaciona vía `external_reference` (= `order.id`), mapea `status` de MP (`approved`/`rejected`/`pending`/`cancelled`) a `payment_status`, guarda `mp_payment_id`.
5. **Idempotente**: solo escribe si el estado cambió; usa admin client.
- **Por qué separado del webhook de billing**: secretos distintos, tipo de evento distinto (`payment` vs `subscription_preapproval`), y blast radius acotado. Discriminar por `type` en un único endpoint mezclaría dos dominios y dos secretos.
- Detalle a resolver: para llamar `Payment.get` necesitamos saber de qué dueño es el pago. Se resuelve cargando la orden por `external_reference` → `store_id` → conexión MP → token. (Ver Open Questions sobre `application_fee`/topic alterno.)

### D6. Cifrado de tokens a nivel app con `crypto` de Node
Nueva tabla `store_mp_connections` (1:1 con `stores`): `store_id` (PK/FK), `mp_user_id`, `access_token_enc`, `refresh_token_enc`, `token_expires_at`, `public_key`, `connected_at`, `revoked_at`. Cifrado AES-256-GCM con clave en `MP_TOKEN_ENC_KEY` (env), helper `lib/crypto/secrets.ts` (`encryptSecret`/`decryptSecret`). RLS: el dueño puede leer metadata (estado conectado/desconectado) pero **no** los tokens; escritura solo service role (trigger).
- **Alternativa descartada (Supabase Vault / pgsodium)**: no están en uso en el repo; agregan superficie operativa. Cifrado a nivel app es suficiente, portable y testeable. Se puede migrar a Vault más adelante sin cambiar el contrato.
- Los tokens **nunca** se exponen al cliente ni se devuelven por Server Actions; solo se usan server-side al crear preferencias / leer pagos.

### D7. Refresh de tokens automático
Antes de usar el access token, si `token_expires_at` está por vencer, refrescar con el `refresh_token` (endpoint OAuth de MP) y re-cifrar. Helper centralizado `getValidMpAccessToken(storeId)`.

## Risks / Trade-offs

- **Token del dueño vencido o revocado desde MP** → al crear preferencia o leer pago falla. Mitigación: refresh proactivo (D7); ante fallo de auth, marcar la conexión como `revoked`, caer el storefront a WhatsApp y avisar en el dashboard.
- **Webhook que llega antes de que la orden esté persistida** (carrera) → `external_reference` no encontrado. Mitigación: la orden se crea **antes** de crear la preferencia (D4), así que para cuando MP notifica ya existe; aun así, responder 200 y dejar que MP reintente si no se encuentra todavía.
- **Pérdida de la clave de cifrado (`MP_TOKEN_ENC_KEY`)** → tokens irrecuperables. Mitigación: documentar la clave como secret crítico; ante pérdida, los dueños re-conectan vía OAuth (flujo idempotente). Versionar la clave (prefijo en el ciphertext) para permitir rotación.
- **Doble notificación / redirect "success" sin pago aprobado** → mostrar pedido como pago sin estarlo. Mitigación: la página de resultado NO marca el pedido; solo el webhook (D5). El success page muestra estado "en confirmación" hasta que el webhook resuelva.
- **Confusión de dos integraciones MP** (billing global vs checkout por-dueño) → usar el token equivocado. Mitigación: clientes y helpers separados; el cliente de checkout siempre se instancia por-tienda, nunca con `MP_ACCESS_TOKEN`.
- **Primer patrón de cifrado del repo** → riesgo de implementación insegura. Mitigación: AES-256-GCM estándar, IV aleatorio por valor, authtag verificado; tests del helper; nunca loguear plaintext.

## Migration Plan

1. Migración `031_mercadopago_checkout.sql`: `stores.checkout_mode`; columnas de pago en `orders` + trigger de protección; tabla `store_mp_connections` + RLS + trigger. Backfill trivial (defaults). **Reversible**: las columnas/tablas nuevas son aditivas; rollback = drop.
2. Env vars nuevas en Vercel/`.env.example`: `MP_OAUTH_CLIENT_ID`, `MP_OAUTH_CLIENT_SECRET`, `MP_ORDERS_WEBHOOK_SECRET`, `MP_TOKEN_ENC_KEY`.
3. Registrar la aplicación OAuth en el panel de Mercado Pago (redirect URI = callback de Wapy) y configurar la `notification_url` de pagos.
4. Deploy backend (migración + actions + webhook + callback OAuth) antes de exponer la UI.
5. Feature visible solo cuando la tienda conecta MP y activa el toggle; WhatsApp sigue default → rollout incremental, sin big-bang.
6. Rollback: ocultar UI / forzar `checkout_mode='whatsapp'`; el webhook y las tablas pueden quedar inertes sin afectar a las tiendas WhatsApp.

## Open Questions

- ¿El esquema actual de `orders` ya guarda nombre/email/teléfono/dirección del comprador, o hay que agregarlos? (Verificar `019_orders.sql` y migraciones posteriores antes de la migración `031_`.)
- ¿Conviene un único endpoint OAuth callback con `state` firmado que identifique la tienda, o uno por tienda? (Default: callback único con `state` = token firmado que lleva `store_id`.)
- ¿Mostrar ambos CTAs (WhatsApp + Pagar) en modo `mercadopago`, o solo el de pago? (Default propuesto: solo pago en modo `mercadopago`, para no confundir; a confirmar con el usuario en specs.)
- ¿Moneda? Los productos tienen `currency` (default ARS); asumir ARS para el MVP y validar que toda la tienda use una sola moneda.
