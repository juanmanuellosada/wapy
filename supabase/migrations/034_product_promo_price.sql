-- 034_product_promo_price.sql
-- Adds an optional promotional price to products (no variants) and to each
-- product variant. NULL = sin promo. Ambas columnas nacen NULL — sin backfill,
-- todos los productos/variantes existentes quedan "sin promo".
--
-- El precio efectivo se resuelve en lib/store/pricing.ts (resolveEffectivePrice):
-- el promo de la variante NO hereda del promo del producto.
--
-- El CHECK "promo < precio regular" de products es same-row y se puede validar
-- en DB. En product_variants el precio regular puede venir de products.price_cents
-- (cross-table), así que ese CHECK se valida server-side (ver lib/variants/actions.ts).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS promo_price_cents int NULL
  CHECK (promo_price_cents IS NULL OR (promo_price_cents >= 0 AND promo_price_cents < price_cents));

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS promo_price_override int NULL
  CHECK (promo_price_override IS NULL OR promo_price_override >= 0);
