-- Add the 'medio' plan tier.
--
-- 1. Rename existing 'inicial' data → 'medio' (BEFORE the code with new 'inicial'
--    limits goes live, so existing stores keep their features).
-- 2. Relax the CHECK constraint on image_urls from <=10 to a technical cap of 20
--    (real per-plan limits are enforced in the application layer).
-- 3. Widen the plan CHECK constraints on both stores and whitelist to accept the
--    three canonical values: 'inicial', 'medio', 'pro'.
--
-- This migration is idempotent: safe to run multiple times.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop the old 2-value CHECK constraints FIRST so the UPDATEs below don't
--    violate them ('medio' is not yet an accepted value at this point).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_plan_check;

ALTER TABLE public.whitelist
  DROP CONSTRAINT IF EXISTS whitelist_plan_check;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rename 'inicial' → 'medio' in existing rows
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.stores
SET plan = 'medio'
WHERE plan = 'inicial';

UPDATE public.whitelist
SET plan = 'medio'
WHERE plan = 'inicial';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Re-add the widened CHECK constraints to accept all three canonical values.
--    stores: constraint was added in migration 023.
--    whitelist: constraint was added in migration 016.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.stores
  ADD CONSTRAINT stores_plan_check
  CHECK (plan IN ('inicial', 'medio', 'pro'));

-- DEFAULT stays 'inicial' (new stores start on the entry tier — confirmed).
-- The column was set NOT NULL with DEFAULT 'inicial' in migration 023; no change needed.

ALTER TABLE public.whitelist
  ADD CONSTRAINT whitelist_plan_check
  CHECK (plan IN ('inicial', 'medio', 'pro'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Relax the image_urls CHECK on products
--    Migration 008 set <= 10. Remove it and add a loose technical cap of 20.
--    The real per-plan limit (1 for inicial, unlimited for medio/pro) is enforced
--    by the application layer (server actions + uploader).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_image_urls_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_image_urls_check
  CHECK (array_length(image_urls, 1) IS NULL OR array_length(image_urls, 1) <= 20);
