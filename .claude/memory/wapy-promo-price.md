---
name: wapy-promo-price
description: "Precio promocional opcional por producto y por variante — shippeado 2026-07-05, migración 034 aplicada a prod."
metadata: 
  node_type: memory
  type: project
  originSessionId: 32ee26b2-1c22-45b1-ab25-1d52f0a59e67
---

Feature de **precio promocional** shippeado 2026-07-05 vía change OpenSpec `add-product-promo-price` (archivado; capability `product-promo-pricing` en el spec vivo). Deployado a prod y verificado por el usuario.

**Modelo de datos (migración `034_product_promo_price.sql`, APLICADA a prod vía Supabase MCP el 2026-07-05 en proyecto `wapy` = `gtiujuarwoatjekmljhn`):** dos columnas nuevas en cents, ambas NULL = sin promo:
- `products.promo_price_cents int NULL` (CHECK `NULL OR (>=0 AND < price_cents)`)
- `product_variants.promo_price_override int NULL` (CHECK `NULL OR >=0`; el "< precio regular" se valida server-side por ser cross-table).
Aditiva, sin backfill. `lib/supabase/types.ts` se editó a mano (no hay supabase CLI en la máquina para `gen types`).

**Regla de precio efectivo — FUENTE DE VERDAD ÚNICA:** helper puro `resolveEffectivePrice(product, variant?)` en `lib/store/pricing.ts` → `{ regularCents, effectiveCents, onPromo }`. Regla: `regular = variant?.price_override ?? product.price_cents`; `promoCandidate = variant ? variant.promo_price_override : product.promo_price_cents`; `onPromo = promoCandidate != null && promoCandidate < regular`; `effective = onPromo ? promoCandidate : regular`. **El promo de la variante NO hereda del promo del producto.** El mismo helper se usa en el cobro (server) y en el display (front) para que nunca diverjan. Tests en `lib/store/pricing.test.ts`.

**Cobro:** el único punto que decide lo cobrado es `createPendingOrder` en `lib/store/orders/actions.ts` (usa el helper). De ahí derivan MP (`mp_items.unit_price`), WhatsApp y el snapshot inmutable de `order_items` (`unit_price_cents`/`price_at_purchase`) — el promo se cobra por ambos canales y se congela en la orden sin columnas nuevas.

**Front:** card y modal muestran precio regular tachado + promo, respetando la variante activa (`useVariantSelection` en `app/[slug]/ProductCardClient.tsx`). De paso se arregló un bug preexistente: el modal público mostraba un precio estático que no reaccionaba a la variante elegida.

**Gaps menores conocidos (dejados fuera de alcance a propósito):** duplicar un producto y la reconciliación cartesiana de variantes NO copian el promo (quedan sin promo); mini-cards de "productos relacionados" muestran solo el precio regular (el modal sí muestra el promo); no hay tachado del original dentro de la línea del carrito (el total sí usa el promo). Fuera de alcance: promos por fecha/porcentaje y promo en el onboarding. Relacionado: [[wapy-mercadopago-billing]], [[wapy-mp-checkout-strategy]].
