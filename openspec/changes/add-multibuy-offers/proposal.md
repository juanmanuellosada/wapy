## Why

Las tiendas hoy pueden bajar el precio de un producto (precio promocional) o abaratar el unitario por
volumen (tramos por cantidad), pero no pueden hacer la promo más común del comercio minorista argentino:
**"2x1", "3x2", "3x1"**. Además, cuando una tienda tiene promos, nada en la portada lo anuncia: el
comprador solo se entera si abre cada producto.

## What Changes

- Oferta **NxM por producto** ("llevás N, pagás M"): el dueño la configura en la sección de ofertas del
  producto, junto al precio promocional y los tramos. Presets 2x1, 3x2, 3x1, 4x3 y combinación libre.
- La cantidad se **agrega por producto sumando variantes** (2 M + 1 L cuentan como 3), igual que los tramos.
- Las unidades se agrupan de a N; cada grupo paga M. Las sobrantes pagan precio normal (2x1 llevando 3 → pagás 2).
  Cuando las variantes tienen precios distintos, **las unidades bonificadas son las más baratas**.
- **Gana el más barato, nunca se acumulan**: por producto se compara el total con NxM (sobre precio regular)
  contra el total con promo/tramos, y se cobra el menor. Misma regla que ya rige entre promo y tramos.
- Se cobra **server-side** en `createPendingOrder` (MP y WhatsApp) y queda congelado en la orden: cada
  `order_items` guarda el descuento de su línea y la etiqueta de la oferta.
- Storefront: **badge "2x1"** en la card y el modal del producto, y **banner en la parte superior de la
  tienda** cuando hay al menos un producto activo con oferta NxM. No se muestra con la tienda en construcción.
- Carrito y mensaje de WhatsApp muestran el descuento aplicado ("2x1 · −$X").
- Edición masiva (Pro): columna NxM y acción en lote para aplicar/quitar la oferta a la selección.

## Capabilities

### New Capabilities
- `product-multibuy-offers`: configuración, cálculo, cobro, snapshot y exhibición (badge, banner, carrito)
  de ofertas NxM por producto.

### Modified Capabilities
<!-- Ninguna: la regla "gana el más barato" ya existe; el NxM se suma como una opción más a comparar. -->

## Impact

- **DB**: migración `046_product_multibuy_offers.sql` — `products.multibuy_buy`, `products.multibuy_pay`
  (nullable, CHECK) y `order_items.discount_cents` + `order_items.offer_label`. Aditiva, sin backfill.
- **Pricing**: `lib/store/pricing.ts` (helper puro nuevo, compartido server/front) + tests.
- **Cobro**: `lib/store/orders/actions.ts` (`createPendingOrder`, distribución de `mp_items`).
- **Consumidores de `order_items`** que hoy calculan `unit_price × quantity`: márgenes
  (`lib/store/orders/margin.ts`), `OrdersPanel`, página de éxito del checkout, webhook de MP.
- **Admin**: `ProductModal`, validación y `saveStoreProduct`/`bulkUpdateProducts`, `BulkEditGrid`.
- **Storefront**: `lib/storefront/resolve.ts`, `app/[slug]/types.ts`, `page.tsx`, `StoreClient.tsx`,
  `ProductCardClient.tsx`, `CartContext.tsx`, `ShareCartButton`.
- Sin gating por plan (como promo y tramos); la edición masiva sigue detrás de `allowBulkProducts`.
