## 1. Migración de base de datos

- [x] 1.1 Crear `supabase/migrations/035_product_price_tiers.sql` con la tabla `product_price_tiers (id, product_id FK ON DELETE CASCADE, min_quantity int CHECK >= 2, unit_price_cents int CHECK >= 0, created_at)`, `UNIQUE (product_id, min_quantity)` e índice por `product_id`
- [x] 1.2 RLS espejo de `product_option_types`: owner CRUD, `anon` SELECT sobre productos activos de tiendas publicadas, superadmin all
- [x] 1.3 Actualizar `lib/supabase/types.ts` a mano con la tabla nueva (no hay Supabase CLI en esta máquina)
- [x] 1.4 Aplicar `035_product_price_tiers.sql`. Aplicada a prod (proyecto `wapy`, `gtiujuarwoatjekmljhn`) el 2026-08-17 vía el MCP de Supabase. Verificado: tabla creada con RLS activa, 0 filas, FK con ON DELETE CASCADE, ambos CHECK y las 3 policies (owner CRUD / anon SELECT / superadmin). El advisor de seguridad no reporta nada nuevo.

## 2. Helper de pricing (fuente de verdad única)

- [x] 2.1 En `lib/store/pricing.ts`: tipo `PriceTier { min_quantity, unit_price_cents }` y `pickTier(tiers, qty)`
- [x] 2.2 `resolveTieredPrice(product, variant, aggregatedQty, tiers)` → `{ regularCents, effectiveCents, onPromo, unitCents, onTier, tier }` aplicando ratio para variantes y `min(base, tierUnit)`
- [x] 2.3 Tests en `lib/store/pricing.test.ts`: sin tramos, tramo exacto, entre tramos, tramo superior, variante con override (ratio), promo más barata que el tramo, `price_cents === 0`

## 3. Cobro y snapshot (MP + WhatsApp + orden)

- [x] 3.1 En `lib/store/orders/actions.ts`: fetch de `product_price_tiers` de los productos del carrito
- [x] 3.2 Mover el cálculo de `qtyByProduct` antes de `enrichedItems` y usar `resolveTieredPrice` para el `effectivePrice` de cada línea
- [x] 3.3 Verificar que `totalCents`, `mp_items[].unit_price` y el snapshot (`unit_price_cents`, `price_at_purchase`) quedan con el precio con tramo

## 4. Server actions + validación

- [x] 4.1 En `lib/store/product-validation.ts`: validar el array de tramos (`min_quantity >= 2` entero, sin duplicados, `unit_price_cents >= 0`, y que cada tramo sea más barato que el anterior a mayor cantidad)
- [x] 4.2 En `lib/store/actions.ts` (`saveStoreProduct`): aceptar `price_tiers?: PriceTier[]`, validarlos y persistirlos con delete+insert dentro del save; solo tocar si el caller los manda (`!== undefined`)
- [x] 4.3 En `bulkUpdateProducts`: mismo tratamiento opcional de `price_tiers` por fila

## 5. Dashboard — producto individual

- [x] 5.1 En `app/components/store/ProductModal.tsx`: editor de tramos (agregar/quitar filas) con doble input sincronizado precio c/u ⇄ total del tramo, hint de % off y del total real
- [x] 5.2 Cargar los tramos existentes al abrir el modal y mandarlos en el submit

## 6. Edición masiva

- [x] 6.1 En `app/dashboard/components/BulkEditGrid.tsx`: columna "Tramos" con resumen por fila (ej. "3+ · 6+") y edición fina delegada al modal
- [x] 6.2 Acción en lote "-X% desde N unidades" que calcula el unitario de cada seleccionado desde su propio precio, + botón "Quitar tramos"
- [x] 6.4 Modos `$ por unidad` y `$ total del tramo` además del porcentaje, y que el botón **agregue** el tramo en vez de reemplazar la escalera (ver design, Decisión 5)
- [x] 6.3 Incluir los tramos en `toBulkUpdateRow` / detección de dirty / descarte de cambios

## 7. Storefront — propagación y display

- [x] 7.1 En `lib/storefront/resolve.ts` + `app/[slug]/page.tsx`: traer los tramos y mapearlos
- [x] 7.2 En `app/[slug]/types.ts`: `priceTiers: PriceTier[]` en `UIProduct`
- [x] 7.3 En `app/[slug]/ProductCardClient.tsx` y el modal de producto de `StoreClient.tsx`: tabla de tramos ("Llevando 3 · $933,33 c/u · 7% off")
- [x] 7.4 Reflejar el tramo alcanzado en vivo según el selector de cantidad, si la ficha tiene uno

## 8. Carrito

- [x] 8.1 `CartItem` lleva `priceTiers` y el precio regular de la línea; los call-sites de `addItem` los pasan
- [x] 8.2 `CartContext` agrupa por `productId`, suma cantidades y expone el unitario con tramo por línea + `totalPrice` coherente
- [x] 8.3 La línea del carrito muestra el unitario con tramo (y el anterior tachado cuando el tramo aplica); el mensaje de WhatsApp usa el mismo unitario

## 9. Verificación

- [x] 9.1 `npx tsc --noEmit` limpio
- [x] 9.2 `npx vitest run lib/store` — 43 tests en verde (23 nuevos en `pricing.test.ts`)
- [x] 9.3 `npm run build` compila
- [x] 9.4 Migración aplicada y verificada contra el esquema de prod.
- [ ] 9.5 **PENDIENTE — prueba en navegador**: cargar un tramo en un producto real, verlo en la ficha pública y confirmar que el carrito y el total de WhatsApp/MP bajan al cruzar el umbral.
