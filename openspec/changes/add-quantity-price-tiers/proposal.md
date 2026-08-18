## Why

Los dueños quieren premiar la compra por cantidad: "si llevás 3, te sale más barato por unidad". Hoy cada producto tiene un único precio efectivo (regular o promo) que no depende de cuántas unidades lleve el comprador, así que la única forma de hacer un mayorista es crear un producto "pack" duplicado.

## What Changes

- **Nueva tabla `product_price_tiers`**: tramos ilimitados por producto, cada uno `(min_quantity, unit_price_cents)`. Sin tramos = comportamiento actual, sin backfill.
- **Modelo de cálculo — tramo por unidad**: el tramo aplicable es el de mayor `min_quantity` que sea `<= cantidad`. Su precio unitario aplica a **todas** las unidades de esa línea, no solo a las que exceden el mínimo.
- **Cantidad agregada por producto**: en un producto con variantes, la cantidad que activa el tramo es la **suma de todas las líneas del carrito de ese producto** (mismo criterio que ya usa `min_quantity` / `qty_step` en `createPendingOrder`). Como el tramo se configura contra el precio base del producto, en variantes se aplica como **ratio proporcional** (`tier.unit_price_cents / product.price_cents`) sobre el precio regular de cada variante, para no aplastar los `price_override`.
- **Convive con la promo: gana el más barato.** Se calcula el precio del tramo y el precio efectivo actual (`resolveEffectivePrice`, promo o regular) y se cobra el menor. Nunca se puede configurar algo que resulte en cobrar más caro por llevar más.
- **Se cobra por ambos canales**: `createPendingOrder` recalcula todo server-side, así que MP, WhatsApp y el snapshot de la orden toman el precio con tramo automáticamente. **BREAKING** de comportamiento de cobro: un carrito que alcanza un tramo paga menos.
- **Front público**: la ficha de producto (card + modal) muestra la tabla de tramos ("3 u · $933,33 c/u · 7% off") y el carrito muestra el precio unitario ya con el tramo aplicado, con el precio anterior tachado.
- **Dashboard individual**: editor de tramos en el form de producto, con doble input sincronizado (precio por unidad ⇄ precio total del tramo) para que el dueño pueda pensar en "3 x $2800".
- **Edición masiva**: columna de tramos por fila (resumen + edición en el modal) y acción en lote "**-X% desde N unidades**", que calcula el precio unitario absoluto de cada producto seleccionado a partir de su propio precio.

## Capabilities

### New Capabilities
- `quantity-price-tiers`: configuración de tramos por cantidad, su resolución como precio efectivo (agregando cantidad por producto y compitiendo con la promo), el cobro por MP y WhatsApp, el snapshot en la orden, el display en el storefront y la carga masiva.

## Impact

- **DB (nueva migración `035`)**: tabla `product_price_tiers` con RLS espejo de `product_option_types` (owner CRUD, anon SELECT sobre productos activos de tiendas publicadas, superadmin all), `UNIQUE (product_id, min_quantity)`, `CHECK (min_quantity >= 2)`.
- **Pricing (punto neurálgico)**: `lib/store/pricing.ts` — nuevo `resolveTieredPrice()` junto al `resolveEffectivePrice()` existente, que sigue siendo la base.
- **Cobro / snapshot**: `lib/store/orders/actions.ts` — fetch de tramos, reutiliza el `qtyByProduct` que ya arma para `min_quantity`.
- **Server actions / validación**: `lib/store/actions.ts` (`saveStoreProduct`, `bulkUpdateProducts`), `lib/store/product-validation.ts`.
- **Storefront**: `lib/storefront/resolve.ts`, `app/[slug]/page.tsx`, `app/[slug]/types.ts`, `app/[slug]/ProductCardClient.tsx`, `app/[slug]/CartContext.tsx`, `app/[slug]/StoreClient.tsx`.
- **Dashboard**: `app/components/store/ProductModal.tsx`, `app/dashboard/components/BulkEditGrid.tsx`.
- **Redondeo**: `unit_price_cents` es entero (lo exige `mp_items.unit_price`). Un tramo "3 x $2800" se guarda como $933,33 c/u y el total real es $2.799,99; el form muestra siempre el total resultante para que no haya sorpresa.
- **Fuera de alcance**: tramos por variante individual, tramos con vigencia por fecha, tramos que se acumulen con la promo, tramos mezclados entre productos distintos (mayorista por total de carrito) y tramos en el wizard de onboarding.
