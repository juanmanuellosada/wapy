## 1. Migración de base de datos

- [x] 1.1 Crear nueva migración en `supabase/migrations/` que agregue `products.promo_price_cents int NULL CHECK (promo_price_cents IS NULL OR (promo_price_cents >= 0 AND promo_price_cents < price_cents))`
- [x] 1.2 En la misma migración agregar `product_variants.promo_price_override int NULL CHECK (promo_price_override IS NULL OR promo_price_override >= 0)` con comentario de que "< precio regular" se valida server-side
- [ ] 1.3 Aplicar la migración al entorno de desarrollo y verificar que las columnas nacen NULL — **PENDIENTE**: no hay Supabase CLI ni entorno local/dev disponible en esta máquina (`supabase` no está instalado, no hay `supabase status`). El archivo `034_product_promo_price.sql` quedó creado pero sin aplicar; el dueño debe aplicarla manualmente (mismo proceso que el resto de las migraciones del proyecto). También se actualizó `lib/supabase/types.ts` a mano con las columnas nuevas (no se pudo correr `supabase gen types`).

## 2. Helper de precio efectivo (fuente de verdad única)

- [x] 2.1 Crear una función pura `resolveEffectivePrice(product, variant?)` que devuelva `{ regularCents, effectiveCents, onPromo }` según la regla del design (promo de variante NO hereda del promo de producto; onPromo solo si `promoCandidate != null && promoCandidate < regularCents`)
- [x] 2.2 Ubicarla en un módulo reutilizable (`lib/store/pricing.ts`) para poder importarla tanto del server (cobro) como del cliente (display)

## 3. Cobro y snapshot (Mercado Pago + WhatsApp + orden)

- [x] 3.1 En `lib/store/orders/actions.ts`: agregar `promo_price_cents` al SELECT de productos (~línea 100) y `promo_price_override` al fetch de variantes
- [x] 3.2 Reemplazar la resolución de `effectivePrice` (~247-250 y ~265) por el helper `resolveEffectivePrice`, tomando el `effectiveCents`
- [x] 3.3 Verificar que el total (`totalCents`), los `mp_items` (`unit_price`) y el snapshot (`unit_price_cents`, `price_at_purchase`) quedan con el precio efectivo con promo, sin cambios adicionales — verificado por lectura: todos derivan de `enrichedItems[].effectivePrice`, que ahora sale del helper.

## 4. Server actions + validación

- [x] 4.1 En `lib/store/actions.ts`: agregar `promo_price_cents?: number | null` al tipo `ProductInput`, al insert y al update de `saveStoreProduct`, con validación server-side `promo >= 0 && promo < price_cents` (o null). En el update, el campo solo se toca si el caller lo envía explícitamente (`!== undefined`), para no borrar un promo existente en los call-sites parciales de `ProductsPanel.tsx` (toggle activo / reorder) que no lo incluyen.
- [x] 4.2 En `lib/variants/actions.ts` (`updateVariant`): aceptar `promoPriceOverride` y validar server-side `promo >= 0 && promo < (price_override ?? product.price_cents)` (o null) antes de persistir

## 5. Formularios del dashboard

- [x] 5.1 En `app/components/store/ProductModal.tsx`: agregar al `productFormSchema` (Zod) y al form un input opcional "Precio promocional", convertirlo a cents en el submit y pasarlo a `saveStoreProduct`; validación cliente de que sea menor al precio
- [x] 5.2 En `app/components/store/VariantsSection.tsx`: agregar un input de promo opcional por fila de variante, guardado on-blur vía `updateVariant({ ..., promoPriceOverride })`, con placeholder/hint del precio regular de la variante

## 6. Storefront: propagación y display

- [x] 6.1 En `lib/storefront/resolve.ts` y `app/[slug]/page.tsx`: incluir `promo_price_cents` (producto) y `promo_price_override` (variante) en los datos mapeados al storefront
- [x] 6.2 En `app/[slug]/types.ts`: agregar los campos promo al tipo de producto/variante UI
- [x] 6.3 En `app/[slug]/ProductCardClient.tsx`: usar el helper (o su forma cliente) en `useVariantSelection` para exponer `{ regularCents, effectiveCents, onPromo }` de la variante activa
- [x] 6.4 En la card y el modal: cuando `onPromo`, renderizar el precio regular tachado + el promo destacado; si no, un solo precio. Se actualizaron: `SimpleProductCard` y `VariantSelector` (layout card) en `ProductCardClient.tsx`, y el header de `ProductModal` en `StoreClient.tsx` (que antes mostraba un precio estático sin reaccionar a la variante activa — se levantó el estado de selección de variante al modal para que el header respete la variante elegida, como pide el requirement "Modal respeta la variante activa"). `aria-label` de `SimpleProductCard` actualizado para anunciar "antes X, ahora Y en promoción".

## 7. Carrito y total de WhatsApp

- [x] 7.1 `CartItem.price` / `variantPrice` reflejan el precio efectivo (con promo) al agregar al carrito — no requirió cambios en `CartContext.tsx` (es un store dumb que solo persiste lo que le pasan); el fix real fue en los *callers* (`ProductCardClient.tsx` y el `ProductModal` de `StoreClient.tsx`), que ahora pasan `effectivePrice` en vez de `product.price` al hacer `addItem`.
- [x] 7.2 Verificado por lectura: el carrito y el mensaje de WhatsApp en `StoreClient.tsx` ya usan `item.variantPrice ?? item.price` (líneas ~1100, ~1319), que ahora es el efectivo. No se agregó el tachado del original en la línea del carrito — es explícitamente opcional en este task y hubiera requerido persistir un campo nuevo en `CartItem`/localStorage; se dejó fuera por alcance.
- [x] 7.3 Confirmado por lectura: el total del carrito (cliente) y `totalCents` de `createPendingOrder` (servidor) usan la misma regla (`resolveEffectivePrice`) sobre los mismos datos de catálogo; el servidor igual recalcula todo desde la DB y nunca confía en precios del cliente, así que no hay forma de que diverjan en el cobro real.

## 8. Verificación

- [x] 8.1 Tests de `resolveEffectivePrice` agregados en `lib/store/pricing.test.ts` (7 casos: producto sin promo, producto en promo, promo de producto no menor al regular, variante sin override, variante con promo propio, promo de variante NO hereda del de producto, promo de variante no menor a su regular). Corridos con `npx vitest run lib/store/pricing.test.ts` — 7/7 pasan.
- [~] 8.2 Verificación manual end-to-end **no realizada con navegador real** (sin entorno para levantar la app con MP sandbox en esta sesión). Verificado por lectura de código + build exitoso: helper único usado en cobro y display (sin divergencia posible); card/modal renderizan tachado+promo condicionalmente a `onPromo`; carrito recibe `effectivePrice` al agregar; `mp_items`/snapshot de orden derivan de `enrichedItems[].effectivePrice` (mismo helper); WhatsApp consume `variantPrice ?? price` ya efectivo. Recomendado: correr un smoke test manual real antes de dar por cerrado el cambio en un entorno con Supabase levantado.
- [x] 8.3 Typecheck y build corridos — ver resultado real en el reporte de la sesión: `npx tsc --noEmit` sin errores, `npm run build` exitoso, `npx vitest run` con 55/55 tests pasando (4 archivos, incluye los 7 nuevos de `pricing.test.ts`).
