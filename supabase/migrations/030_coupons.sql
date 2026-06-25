-- 030_coupons.sql
-- Discount coupons: one table per store (tenant-scoped), mirroring sections/products pattern.
-- Also extends orders with coupon_code + discount_cents columns (no existing fields for this).

-- ─── coupons ─────────────────────────────────────────────────────────────────

CREATE TABLE public.coupons (
  id             uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  store_id       uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  code           text NOT NULL,                -- stored normalized (UPPER + trim)
  discount_type  text NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value numeric NOT NULL CHECK (discount_value > 0),
  expires_at     date NULL,                    -- NULL = never expires; if set, valid through end of day AR (UTC-3)
  min_purchase   numeric NULL CHECK (min_purchase >= 0),
  max_uses       integer NULL CHECK (max_uses > 0),
  uses_count     integer NOT NULL DEFAULT 0,
  is_active      boolean NOT NULL DEFAULT TRUE,
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  updated_at     timestamptz NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Owner CRUD on own store's coupons
CREATE POLICY "coupons_owner_crud"
  ON public.coupons FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.owner_id = auth.uid()
    )
  );

-- Public anon read: only active coupons of published stores (used by validateCoupon via service role, but policy here for safety)
CREATE POLICY "coupons_select_public"
  ON public.coupons FOR SELECT
  TO anon
  USING (
    is_active = TRUE AND
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.status = 'published'
    )
  );

-- Superadmin all
CREATE POLICY "coupons_superadmin_all"
  ON public.coupons FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
  );

CREATE INDEX coupons_store_id_idx ON public.coupons (store_id);
CREATE UNIQUE INDEX coupons_store_id_code_unique_idx ON public.coupons (store_id, upper(code));

-- ─── orders: extend with coupon fields ───────────────────────────────────────
-- The existing orders table (019) has no coupon columns.
-- We add two columns: coupon_code (the applied code) and discount_cents (amount deducted).
-- Both are nullable — no coupon = both NULL (backwards compatible).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coupon_code   text    NULL,
  ADD COLUMN IF NOT EXISTS discount_cents bigint  NULL CHECK (discount_cents >= 0);
