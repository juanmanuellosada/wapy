-- 041_product_cost.sql
-- Costo de mercadería, opcional, por producto y por variante, más su snapshot
-- congelado en cada línea de pedido. Ver
-- openspec/changes/add-product-cost-tracking/design.md.
--
-- Las tres columnas nacen NULL — sin backfill, ningún producto, variante ni
-- pedido existente cambia de valor. NULL significa "sin costo cargado";
-- 0 significa "costo cero" (Decisión D3) — son casos distintos, por eso el
-- CHECK permite >= 0 y no > 0.
--
-- El costo efectivo se resuelve en lib/store/pricing.ts (resolveEffectiveCost),
-- con la misma herencia que price_override: la variante pisa, si no hereda del
-- producto (Decisión D2 — a diferencia del promo, que no hereda).
--
-- order_items.cost_at_purchase lo escribe createPendingOrder al momento de la
-- compra y nunca se recalcula contra el costo actual del producto (Decisión
-- D1): la ganancia de un pedido pasado no se mueve si el costo cambia después.
-- Se escribe para cualquier plan (Decisión D6): el gating de Pro es solo de
-- lectura/carga, no del snapshot.
--
-- Aditiva y reversible: el rollback es DROP COLUMN en las tres.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cost_cents int NULL
  CHECK (cost_cents IS NULL OR cost_cents >= 0);

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS cost_override int NULL
  CHECK (cost_override IS NULL OR cost_override >= 0);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS cost_at_purchase int NULL
  CHECK (cost_at_purchase IS NULL OR cost_at_purchase >= 0);
