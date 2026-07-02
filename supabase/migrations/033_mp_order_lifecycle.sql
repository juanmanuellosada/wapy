-- MP order lifecycle hardening (Ola 1):
--   - orders.payment_status: extend allowed values with MP lifecycle states that
--     were not representable before (refunded, charged_back, in_mediation, in_process).
--   - orders.idempotency_key: lets createPendingOrder be called safely more than
--     once for the same logical checkout (e.g. client retry) without duplicating
--     the order or double-deducting stock.
--
-- orders.confirmed_at already exists (019_orders.sql) — not added here.
-- Backfill: additive only, existing payment_status values are a subset of the
-- new CHECK, so no data is invalidated.

-- ─── orders.payment_status: widen CHECK constraint ────────────────────────────
-- The constraint was added inline (031) without an explicit name, so Postgres
-- assigned an auto-generated name. Look it up dynamically instead of hardcoding
-- it, so this migration doesn't break if the real name differs.

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT con.conname INTO con_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'orders'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%payment_status%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
    CHECK (payment_status IN (
      'pending', 'approved', 'rejected', 'cancelled',
      'refunded', 'charged_back', 'in_mediation', 'in_process'
    ));


-- ─── orders.idempotency_key ────────────────────────────────────────────────────
-- Not a billing-sensitive field (no money/MP reference), so it's intentionally
-- left out of prevent_order_payment_column_writes() (031).

ALTER TABLE public.orders
  ADD COLUMN idempotency_key text;

CREATE UNIQUE INDEX orders_idempotency_key_unique_idx
  ON public.orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
