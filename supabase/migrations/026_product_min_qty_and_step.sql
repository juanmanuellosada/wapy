-- 026_product_min_qty_and_step.sql
-- Adds min_quantity and qty_step to products table.
-- Existing products receive defaults (1/1), preserving current behaviour.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS min_quantity int NOT NULL DEFAULT 1 CHECK (min_quantity >= 1);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS qty_step int NOT NULL DEFAULT 1 CHECK (qty_step >= 1);
