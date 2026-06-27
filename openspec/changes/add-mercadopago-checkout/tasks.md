## 1. Base de datos (migración 031)

- [x] 1.1 Revisar el esquema actual de `orders` (`019_orders.sql` + migraciones posteriores) y confirmar qué datos de comprador ya se guardan (nombre/email/teléfono/dirección)
- [x] 1.2 Crear `supabase/migrations/031_mercadopago_checkout.sql`
- [x] 1.3 Agregar a `stores`: `checkout_mode text NOT NULL DEFAULT 'whatsapp' CHECK (checkout_mode IN ('whatsapp','mercadopago'))`
- [x] 1.4 Agregar a `orders`: `channel` (`whatsapp`|`mercadopago`, default `whatsapp`), `payment_status` (`pending`|`approved`|`rejected`|`cancelled`, default `pending`), `mp_preference_id text`, `mp_payment_id text`, y campos de comprador faltantes (según 1.1)
- [x] 1.5 Agregar trigger que restrinja la escritura de las columnas de pago de `orders` a `service_role` (patrón `prevent_billing_column_writes()` de `027_store_billing.sql`)
- [x] 1.6 Crear tabla `store_mp_connections` (1:1 con `stores`): `store_id` PK/FK, `mp_user_id`, `access_token_enc`, `refresh_token_enc`, `token_expires_at`, `public_key`, `connected_at`, `revoked_at`
- [x] 1.7 RLS de `store_mp_connections`: owner puede SELECT solo metadata (no tokens) vía join a `stores.owner_id`; INSERT/UPDATE solo service role; superadmin con `is_superadmin()`
- [x] 1.8 Regenerar `lib/supabase/types.ts` con los tipos actualizados

## 2. Cifrado de secrets

- [x] 2.1 Crear `lib/crypto/secrets.ts` con `encryptSecret`/`decryptSecret` (AES-256-GCM, IV aleatorio por valor, authtag verificado, prefijo de versión de clave para rotación)
- [x] 2.2 Leer la clave desde `MP_TOKEN_ENC_KEY`; fallar de forma explícita si falta
- [x] 2.3 Tests del helper (round-trip, authtag inválido, IV distinto por llamada)
- [x] 2.4 Agregar `MP_TOKEN_ENC_KEY` a `.env.example` con nota de secret crítico

## 3. OAuth de Mercado Pago (capability mercadopago-connect)

- [x] 3.1 Agregar `MP_OAUTH_CLIENT_ID`, `MP_OAUTH_CLIENT_SECRET` a `.env.example` y documentar registro de la app OAuth + redirect URI
- [x] 3.2 Crear `lib/store/checkout/oauth.ts`: armar URL de autorización con `state` firmado que lleve `store_id`, e intercambio de código por tokens
- [x] 3.3 Server Action `connectMercadoPago()` en `lib/store/checkout/actions.ts` (requireOwnerStore) que devuelve la URL de autorización
- [x] 3.4 Route handler `app/api/mp/oauth/callback/route.ts`: validar `state`, intercambiar código, cifrar y persistir la conexión (admin client), redirigir al dashboard
- [x] 3.5 Server Action `disconnectMercadoPago()` (marca `revoked_at`)
- [x] 3.6 Helper `getValidMpAccessToken(storeId)`: lee la conexión, refresca si vencido (re-cifra y persiste), marca `revoked` ante fallo de refresh
- [x] 3.7 Helper `getStoreMpConnectionStatus(storeId)` para el dashboard (solo metadata)

## 4. Cliente Checkout Pro por-tienda

- [x] 4.1 Crear `lib/store/checkout/mp-client.ts`: instancia de cliente MP por-tienda usando el access token del dueño (separado de `lib/mercadopago.ts` que usa el token global de billing)
- [x] 4.2 Función `createCheckoutPreference({ storeId, orderId, items })`: arma `Preference` con `external_reference = orderId`, `back_urls` (success/failure/pending) y `notification_url` del webhook de pedidos; devuelve `init_point`
- [x] 4.3 Función `getPayment({ storeId, paymentId })` para re-leer el pago en el webhook

## 5. Flujo de checkout en el storefront (capability store-checkout)

- [x] 5.1 Validación Zod del formulario de datos del comprador (nombre, email, teléfono, dirección/entrega)
- [x] 5.2 Server Action pública `startCheckout({ slug, cart, buyer })` en `lib/store/checkout/actions.ts`: cargar tienda + validar modo/conexión, recalcular precios desde DB (reusar lógica de cupones/variantes), crear orden `pending` (extender `createPendingOrder`) con datos del comprador y canal `mercadopago`, crear preferencia (tarea 4.2), guardar `mp_preference_id`, devolver `init_point`
- [x] 5.3 Rechazos: carrito vacío/ítems inválidos, tienda sin conexión MP, modo `whatsapp`
- [x] 5.4 UI: formulario de datos del comprador en el CartDrawer (`app/[slug]/StoreClient.tsx`)
- [x] 5.5 Branch de UI en el CartDrawer: mostrar CTA "Pagar con Mercado Pago" cuando `checkout_mode='mercadopago'` con conexión válida; mantener WhatsApp en modo `whatsapp` (delta de `public-storefront`)
- [x] 5.6 Pasar `checkout_mode` y estado de conexión al storefront (`app/[slug]/page.tsx` / `CartContext` / props del StoreClient)
- [x] 5.7 Redirect al `init_point` tras `startCheckout`
- [x] 5.8 Páginas de resultado `app/[slug]/checkout/success`, `/failure`, `/pending`: NO marcan el pedido; el success muestra "pago en verificación" salvo confirmación del webhook

## 6. Webhook de pagos de pedidos (capability store-checkout)

- [x] 6.1 Agregar `MP_ORDERS_WEBHOOK_SECRET` a `.env.example`
- [x] 6.2 Crear `app/api/webhooks/mercadopago-orders/route.ts` (`runtime='nodejs'`, `force-dynamic`)
- [x] 6.3 Verificar firma con `MP_ORDERS_WEBHOOK_SECRET`; 401 si inválida (replicar `verifyWebhookSignature`)
- [x] 6.4 Filtrar por `type='payment'`; 200 sin efecto para otros tipos
- [x] 6.5 Correlacionar por `external_reference` → cargar orden → `store_id` → re-leer pago desde MP con el token del dueño (tarea 4.3); no confiar en el body
- [x] 6.6 Mapear status de MP a `payment_status`, guardar `mp_payment_id` con admin client, idempotente (solo escribir si cambió)
- [x] 6.7 Responder 200 ante orden aún no encontrada para permitir reintento de MP

## 7. Dashboard del dueño

- [x] 7.1 UI de conexión de Mercado Pago (conectar/desconectar + estado) en la sección de settings/whatsapp del dashboard
- [x] 7.2 Selector de `checkout_mode` (gateado: solo activable con conexión válida) + Server Action `setCheckoutMode()` en `lib/store/actions.ts`
- [x] 7.3 Extender `OrdersPanel` / `listOrders` para mostrar `payment_status` y `channel` por pedido

## 8. Verificación

- [ ] 8.1 Aplicar la migración `031_` en entorno de desarrollo y verificar RLS (cliente no escribe columnas de pago ni conexión)
- [ ] 8.2 Probar el flujo OAuth end-to-end con una cuenta de prueba de Mercado Pago (sandbox)
- [ ] 8.3 Probar un pago de prueba completo: carrito → datos → preferencia → pago aprobado → webhook actualiza el pedido a `approved`
- [ ] 8.4 Verificar idempotencia del webhook (reentrega de la misma notificación no duplica efectos)
- [ ] 8.5 Verificar que el redirect `success` no marca el pedido como pago sin webhook
- [ ] 8.6 Verificar que el modo `whatsapp` (default) sigue funcionando sin cambios
- [ ] 8.7 Verificar que una tienda sin conexión MP cae a WhatsApp y el dashboard lo indica
