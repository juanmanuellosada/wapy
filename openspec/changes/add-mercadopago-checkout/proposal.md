## Why

Hoy una tienda Wapy solo puede cerrar ventas por handoff a WhatsApp: el comprador arma el carrito y el dueño cobra a mano, fuera de la plataforma. Esto agrega fricción, limita las ventas a horario de atención y deja a Wapy como un catálogo en vez de un canal transaccional. Ofrecer un modo de tienda con checkout y pago online por Mercado Pago convierte a Wapy en e-commerce real: el comprador paga solo, 24/7, y el dueño recibe la plata directo en su cuenta de MP.

## What Changes

- Nuevo **toggle por tienda** `checkout_mode` (`whatsapp` | `mercadopago`). Una tienda opera en un modo o en el otro. Default `whatsapp` (comportamiento actual sin cambios).
- El dueño **conecta su propia cuenta de Mercado Pago vía OAuth**. La plata de cada venta va directo a su cuenta — Wapy no toca el dinero ni cobra comisión en este MVP. Los tokens OAuth (access + refresh) se guardan **cifrados** y se refrescan automáticamente.
- En el storefront público, cuando `checkout_mode = mercadopago`, el carrito ofrece **pagar con Mercado Pago** en vez de (o además de) enviar por WhatsApp:
  - Formulario de **datos del comprador** (guest checkout: nombre, email, teléfono, dirección/entrega). Sin cuenta de comprador.
  - La **preferencia de Checkout Pro se arma en el server** con precios traídos de la DB (nunca del cliente) usando el token del dueño.
  - Redirect al checkout hospedado de MP y vuelta a páginas de resultado **success / failure / pending**.
- Se **extiende el modelo de pedidos existente** (`orders` / `order_items`) con estado de pago: canal (`whatsapp` | `mercadopago`), estado de pago (`pending` | `approved` | `rejected` | `cancelled`), y referencias de MP (`preference_id`, `payment_id`). No se crean tablas de pedidos desde cero.
- Nuevo **webhook de pagos de pedidos**, separado del webhook de billing existente: idempotente, con verificación de firma, que re-lee el pago desde MP (no confía en el redirect ni en el body) y es la **fuente de verdad** del estado del pedido.
- El **panel de Pedidos** del dueño muestra el estado de pago de cada pedido para que sepa qué está pago y qué preparar.

Fuera de alcance de este MVP: control de stock/inventario al pagar, split de pagos / comisión marketplace, notificaciones automáticas al comprador, múltiples métodos de envío.

## Capabilities

### New Capabilities
- `store-checkout`: Flujo de compra con pago online en el storefront público cuando la tienda está en modo `mercadopago` — toggle `checkout_mode`, formulario de datos del comprador, creación server-side de la preferencia Checkout Pro con precios de la DB, redirect y páginas de resultado, webhook de pagos de pedidos (idempotente, firma verificada, fuente de verdad del estado), y estado de pago sobre los pedidos existentes.
- `mercadopago-connect`: Conexión de la cuenta de Mercado Pago del dueño vía OAuth para cobrar a su propia cuenta — flujo de autorización, almacenamiento cifrado de access/refresh tokens por tienda, refresh automático y desconexión.

### Modified Capabilities
- `public-storefront`: El carrito/drawer del storefront gana un CTA de pago con Mercado Pago cuando la tienda opera en modo `mercadopago`, alternativo al actual "Compartí tu pedido" / handoff a WhatsApp.

## Impact

- **DB / migraciones**: nueva migración `031_` (la última es `030_coupons.sql`). Columnas de pago en `orders`; nueva columna `checkout_mode` en `stores`; nueva tabla para la conexión MP del dueño (tokens cifrados) con RLS y escritura restringida a `service_role` (patrón de `027_store_billing.sql`).
- **Mercado Pago**: nueva superficie de la API distinta del billing actual (`lib/mercadopago.ts` usa un único `MP_ACCESS_TOKEN` global para suscripciones). Se agrega OAuth + cliente Checkout Pro por-tienda (`Preference`) usando el token del dueño. Nuevas env vars: `MP_OAUTH_CLIENT_ID`, `MP_OAUTH_CLIENT_SECRET`, `MP_ORDERS_WEBHOOK_SECRET`, y una clave de cifrado de tokens (`MP_TOKEN_ENC_KEY`).
- **Server Actions**: nuevo `lib/store/checkout/actions.ts` (crear preferencia, conectar/desconectar MP) siguiendo el patrón `requireOwnerStore()` + admin client. Acción pública para iniciar el pago del carrito.
- **Route handlers**: nuevo `app/api/webhooks/mercadopago-orders/route.ts` (o discriminar por `type` en el webhook existente). Posible callback OAuth en `app/api/mp/oauth/callback/route.ts`. Páginas de resultado bajo `app/[slug]/checkout/`.
- **Storefront**: `app/[slug]/StoreClient.tsx` (`CartDrawer` / `handleWhatsApp`) y `app/[slug]/CartContext.tsx` ganan la ruta de pago MP.
- **Dashboard**: `OrdersPanel` muestra estado de pago; nueva UI de conexión MP en la sección de settings/whatsapp; sin nueva entrada de menú obligatoria.
- **Sin cifrado previo en el repo**: hay que introducir el primer patrón de almacenamiento cifrado de secrets por-tienda (cifrado a nivel app con `crypto` de Node + clave en env, escrito solo por service role).
