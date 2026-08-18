---
name: wapy-quantity-price-tiers
description: Tramos de precio por cantidad (llevando 3 sale más barato c/u) — implementado 2026-08-17, migración 035 aplicada a prod, sin probar en navegador.
metadata:
  type: project
---

Descuento por cantidad por producto: tabla `product_price_tiers (product_id, min_quantity >= 2, unit_price_cents)`, tramos ilimitados. Implementado 2026-08-17 en `openspec/changes/add-quantity-price-tiers/`.

Decisiones que no se leen del código:
- **Tramo por unidad, no pack**: el tramo de mayor `min_quantity` que la cantidad alcanza fija el unitario de TODAS las unidades. Se descartó el modelo "3x$2800 + sueltas a precio lleno".
- **Cantidad agregada por producto**, sumando variantes (mismo criterio que `min_quantity`). Como el tramo se configura contra `products.price_cents`, en variantes con `price_override` se aplica como **ratio proporcional**, no como precio absoluto.
- **Gana el más barato** entre tramo y promo: nunca se acumulan. Por eso no hace falta validar cross-table tramo-vs-promo-de-variante.
- **En la edición masiva el lote se expresa en %** ("-10% desde 3"), no en precio absoluto: aplicar un unitario fijo a productos de precios distintos no tiene sentido. Cada fila calcula su unitario desde su propio precio.
- `unit_price_cents` es entero porque `mp_items[].unit_price` lo exige. Un "3 x $2800" queda en $933,33 c/u y el total real es $2.799,99; el form muestra siempre el total resultante.
- `ProductModal` con `priceTiers === undefined` NO administra tramos (el editor no aparece y el save no los toca) — así el wizard de onboarding no los borra. Con un array (aunque sea vacío) sí los administra. `ProductsPanel` y `BulkEditGrid` tienen el prop **requerido** por la misma razón.

Migración 035 aplicada a prod el 2026-08-17 vía el MCP de Supabase (proyecto `wapy` = `gtiujuarwoatjekmljhn`). **PENDIENTE**: probar en navegador (cargar un tramo, verlo en la ficha, confirmar el cobro).

Se apoya en [[wapy-promo-price]] (`resolveEffectivePrice` sigue siendo la base de `resolveTieredPrice`) y en [[wapy-bulk-product-import]] (la grilla de edición masiva).
