## Why

El dashboard hoy responde "cuánto vendiste", pero no "cuánto ganaste". Un dueño que vende $800.000 en el mes no tiene forma de saber si eso son $300.000 de ganancia o $80.000, porque el precio de compra de la mercadería no vive en ningún lado de Wapy. Sin costo, la pantalla de métricas mide facturación, no negocio.

## What Changes

- **Costo opcional por producto y por variante**: `products.cost_cents` y `product_variants.cost_override`, ambos nullable, con la misma regla de herencia que ya tiene `price_override` (la variante pisa al producto; si no tiene, hereda). **Sin costo cargado el sistema se comporta exactamente como hoy**: no hay validación nueva que rompa un producto existente, ni campo obligatorio, ni backfill.
- **Snapshot del costo en el pedido**: `order_items.cost_at_purchase`, copiado por `createPendingOrder` desde el costo vigente al momento de la compra. La ganancia histórica **nunca** se recalcula contra el costo actual: si mañana subís el precio de compra, los pedidos de marzo siguen mostrando el margen que realmente tuvieron. `NULL` significa "no había costo cargado en ese momento", que es distinto de "costo cero".
- **Métricas de margen**: `getOrderStats` suma `cost_at_purchase * quantity` sobre los ítems de los pedidos confirmados/entregados y expone costo, ganancia y margen %, además de los ingresos que ya calcula.
- **Cobertura explícita del dato**: como el costo es opcional, la ganancia de un período es parcial por definición. Las métricas exponen qué porcentaje de los ingresos del período tiene costo cargado, y la UI muestra ese número junto a la ganancia. Si no hay ningún costo cargado en el período, las tarjetas de ganancia no se muestran — una tienda que nunca cargó costos ve la pantalla de siempre.
- **El costo no sale nunca al público**: es dato interno del dueño. No se expone en el storefront, ni en el payload de la tienda pública, ni en la exportación de pedidos que se comparte, ni en los datos que viajan a MercadoPago.
- **Feature de plan Pro**: nuevo flag en `PLAN_LIMITS` siguiendo el precedente exacto de `allowBulkProducts`. Los planes Inicial y Medio no ven los campos de costo ni las tarjetas de margen.
- **Carga del costo en los tres lugares donde ya se edita precio**: el form individual de producto, la grilla inline de variantes y la edición masiva.

## Capabilities

### New Capabilities
- `product-cost-margin`: la carga del costo por producto y variante, su resolución con herencia, el snapshot en el pedido, el cálculo de costo/ganancia/margen y su cobertura en las métricas, el gating por plan y la garantía de que el costo no se filtra al público.

### Modified Capabilities
<!-- Ninguna. El costo es aditivo: no cambia ningún requisito de product-variants, product-promo-pricing, discount-coupons ni public-storefront. La no-exposición al storefront se especifica como requisito de la capability nueva. -->

## Impact

- **DB (nueva migración `041`)**: `products.cost_cents int NULL`, `product_variants.cost_override int NULL`, `order_items.cost_at_purchase int NULL`. Aditiva y reversible con `DROP COLUMN`. Sin RLS nueva: las tres columnas viven en tablas que ya tienen sus policies, y ninguna policy pública selecciona columnas explícitas — **hay que verificar que el SELECT anónimo del storefront no traiga `cost_cents` por venir de un `select('*')`**.
- **Prerequisito**: la migración `038` figura como pendiente de aplicar a producción (`openspec/changes/add-order-soft-delete/tasks.md:34`). Hay que resolver eso antes de aplicar `041`; este change no lo cubre.
- **Costo efectivo**: `lib/store/pricing.ts` — nuevo `resolveEffectiveCost(product, variant?)` al lado de `resolveEffectivePrice()`, con la misma forma y la misma regla de herencia.
- **Snapshot**: `lib/store/orders/actions.ts` — `createPendingOrder` agrega el costo al armado de `order_items`. Escribe con el admin client, así que no lo toca el trigger `orders_protect_payment_fields`.
- **Métricas**: `lib/store/orders/actions.ts` `getOrderStats` — la query de ítems ya existe para `top_products`, se le suma la columna de costo. `app/dashboard/components/OrdersStats.tsx` para las tarjetas nuevas.
- **Server actions / validación**: `lib/store/actions.ts` (`ProductInput`, `saveStoreProduct` con el patrón `undefined` = no tocar, `bulkUpdateProducts`), `lib/store/product-validation.ts`, `lib/variants/actions.ts` (`updateVariant`).
- **Dashboard**: `app/components/store/ProductModal.tsx`, `app/components/store/VariantsSection.tsx`, `app/dashboard/components/BulkEditGrid.tsx`.
- **Gating**: `lib/plans/limits.ts`, más el paso del flag por `app/dashboard/[section]/page.tsx`.
- **Fuera de alcance**: costo de envío, comisiones de MercadoPago, prorrateo de cupones y descuentos sobre el costo, costo por tramo de cantidad, historial de cambios de costo, valuación de inventario, y ventas cargadas a mano (van en su propio change). La v1 mide **margen bruto de mercadería** y nada más.
