## Context

En Wapy los precios son enteros en centavos (`_cents`) sin excepción. El precio de un producto vive en `products.price_cents`; las variantes tienen `product_variants.price_override int NULL` (nulo = hereda del producto). El precio efectivo que se cobra se resuelve **en un único lugar server-side**: `createPendingOrder` en `lib/store/orders/actions.ts` recalcula todo desde la DB (nunca confía en el cliente), computa `effectivePrice = variant.price_override ?? product.price_cents`, arma el total, los `mp_items` para Mercado Pago, el mensaje/total de WhatsApp y el snapshot inmutable en `order_items`. El storefront resuelve el efectivo por separado en el hook `useVariantSelection` (`ProductCardClient.tsx`) solo para mostrar.

El promo se inserta sobre esta estructura sin cambiar su forma: es un segundo precio opcional que, cuando aplica, reemplaza al efectivo.

## Goals / Non-Goals

**Goals:**
- Promo opcional por producto (sin variantes) y por variante (cada una la suya).
- Que el promo sea lo que se cobra por MP y WhatsApp, y quede congelado en la orden.
- Display de original tachado + promo en card y modal, respetando la variante activa.
- Una sola regla de "precio efectivo" reutilizada en cobro y en display, para que nunca diverjan.

**Non-Goals:**
- Promos programadas por fecha (inicio/fin) ni por porcentaje.
- Promo desde el wizard de onboarding (se carga luego editando el producto).
- Guardar el precio original tachado en `order_items` para reporting de descuentos (el snapshot solo guarda lo cobrado).

## Decisions

**Decisión 1 — Promo como precio absoluto, resuelto con la misma especificidad que el precio.**
El promo es un número absoluto en cents, no un porcentaje. Para un ítem:
- `regularCents = variant?.price_override ?? product.price_cents`
- `promoCandidate = variant ? variant.promo_price_override : product.promo_price_cents`
- `onPromo = promoCandidate != null && promoCandidate < regularCents`
- `effectiveCents = onPromo ? promoCandidate : regularCents`

El promo de la variante **no hereda** del promo del producto: cuando hay variante, solo cuenta `variant.promo_price_override`. Esto evita el footgun de aplicar un promo pensado para el precio base a una variante más cara, y coincide con la decisión del dueño ("cada variante puede tener su precio promocional; si no hay variantes, a nivel producto"). Como los productos con variantes exigen elegir una variante para agregar al carrito, el `product.promo_price_cents` en la práctica solo aplica a productos sin variantes.
- *Alternativa descartada:* cadena simétrica con herencia (`variant.promo_override ?? product.promo_cents`). Rechazada por el footgun descrito; el guard `< regularCents` lo mitiga pero el resultado sigue siendo poco intuitivo.

**Decisión 2 — Un único helper de precio efectivo, compartido por cobro y display.**
Se extrae una función pura (ej. `resolveEffectivePrice(product, variant?) → { regularCents, effectiveCents, onPromo }`) y se la usa tanto en `createPendingOrder` (cobro/snapshot) como en `useVariantSelection` (display). Fuente de verdad única: el precio mostrado y el cobrado no pueden divergir.

**Decisión 3 — Sin columnas nuevas en `order_items`.**
El snapshot ya guarda `effectivePrice` (`unit_price_cents` / `price_at_purchase`). Si el efectivo pasa a contemplar el promo, la orden congela el promo cobrado sin cambios de esquema. Guardar el precio original tachado queda como non-goal.

**Decisión 4 — Validación del "promo < regular" en el servidor.**
El CHECK de DB del producto puede validar `promo_price_cents < price_cents` (misma fila). Para variantes no se puede a nivel DB (el regular puede venir de `products.price_cents`, cross-table), así que la validación `promo_price_override < (price_override ?? product.price_cents)` va en el server action (`updateVariant` / `saveStoreProduct`). El CHECK de variante solo asegura `>= 0`. Se agrega también validación cliente (Zod) para UX, pero la fuente de verdad es el servidor.

**Decisión 5 — Interacción con cupones.**
Los cupones ya operan sobre el total calculado a partir del `effectivePrice`. Como el promo entra antes (define el efectivo), el cupón se aplica sobre el precio ya promocionado. No se toca la lógica de cupones; solo cambia el efectivo de entrada.

## Risks / Trade-offs

- **[Divergencia entre precio mostrado y cobrado]** → Mitigación: Decisión 2 (helper único compartido). El cobro igualmente recalcula server-side, así que el cliente nunca puede forzar un precio.
- **[Variante más cara "en promo" por confusión de niveles]** → Mitigación: Decisión 1 (sin herencia de promo hacia variantes) + guard `< regularCents`.
- **[Promo mayor al regular guardado por error]** → Mitigación: validación server-side (Decisión 4); ante promo inválido no se persiste y el ítem simplemente no entra en promo.
- **[Datos existentes]** → Ninguno: ambas columnas nacen NULL, todos los productos actuales quedan "sin promo". Sin backfill.

## Migration Plan

- Una migración nueva agrega `products.promo_price_cents` y `product_variants.promo_price_override` (ambas NULL, con sus CHECK). Sin backfill.
- **Rollback:** revertir código + migración. Las columnas NULL no afectan a nadie; si ya hubo órdenes con promo, el snapshot cobrado queda intacto (es un número congelado, no depende de las columnas).
