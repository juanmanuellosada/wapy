## Why

Los dueños quieren poder poner un producto "en promo": cargar un precio promocional opcional que, mientras esté cargado, se convierte en el precio efectivo (el que se cobra) y se muestra en la tienda como precio original tachado + precio de oferta. Hoy no existe: cada producto/variante tiene un único precio y no hay forma de representar una oferta.

## What Changes

- **Nuevo campo de precio promocional opcional**, en centavos, siguiendo la convención `_cents` del proyecto:
  - `products.promo_price_cents` (para productos sin variantes).
  - `product_variants.promo_price_override` (cada variante puede tener su propio promo).
- **Resolución del precio efectivo (punto único que define lo que se cobra):** el promo se resuelve con la misma especificidad que el precio hoy. Para un ítem, `promo = variante.promo_price_override` si hay variante, o `producto.promo_price_cents` si no la hay. Está "en promo" solo si ese promo existe **y es menor** al precio regular (`variante.price_override ?? producto.price_cents`). Si está en promo, el precio efectivo pasa a ser el promo.
- **Se cobra el promo por ambos canales:** como MP, WhatsApp y el snapshot de la orden derivan todos del `effectivePrice` calculado server-side en `createPendingOrder`, con cambiar esa resolución el promo se cobra y se congela en la orden automáticamente. **BREAKING** de comportamiento de cobro: un producto en promo cobra menos que su precio base.
- **Front público:** la card y el modal de producto muestran el precio original **tachado** + el precio promo destacado cuando el ítem está en promo (respetando la variante activa). El carrito y el total (WhatsApp/MP) usan el precio efectivo.
- **Dashboard:** input opcional de precio promocional en el form de producto y en cada fila de variante, con validación de que el promo sea ≥ 0 y menor al precio regular correspondiente.

## Capabilities

### New Capabilities
- `product-promo-pricing`: precio promocional opcional por producto y por variante; su resolución como precio efectivo; el cobro del promo por MP y WhatsApp; el snapshot inmutable del promo en la orden; y el display de original-tachado + promo en el storefront.

### Modified Capabilities
<!-- Ninguna: el flujo de cobro (createPendingOrder) y el storefront no tienen un requirement de pricing previo que cambie a nivel spec; se cubren en la capability nueva. -->

## Impact

- **DB (nueva migración):** `products.promo_price_cents int NULL` (CHECK `NULL OR (>=0 AND < price_cents)`) y `product_variants.promo_price_override int NULL` (CHECK `NULL OR >=0`; el "< precio regular" se valida server-side por ser cross-table).
- **Cobro / snapshot (punto neurálgico):** `lib/store/orders/actions.ts` — resolución de `effectivePrice` (~247-250, 265), SELECT de columnas promo (~100 y fetch de variantes), snapshot ya cubierto por `effectivePrice`.
- **Server actions / validación:** `lib/store/actions.ts` (`ProductInput`, insert/update), `lib/variants/actions.ts` (`updateVariant`).
- **Formularios dashboard:** `app/components/store/ProductModal.tsx` (Zod + input), `app/components/store/VariantsSection.tsx` (input por variante).
- **Storefront:** `app/[slug]/page.tsx` + `lib/storefront/resolve.ts` (mapeo), `app/[slug]/types.ts` (tipo), `app/[slug]/ProductCardClient.tsx` (`useVariantSelection` + display tachado/promo), `app/[slug]/CartContext.tsx` + `StoreClient.tsx` (precio efectivo en carrito y total WhatsApp).
- **No requiere columnas nuevas en `order_items`:** el snapshot de `effectivePrice` ya captura el promo cobrado.
- **Fuera de alcance:** promos programadas por fecha (inicio/fin), promos por porcentaje, promo en el wizard de onboarding, y guardar el precio original tachado en la orden para reporting de descuentos.
