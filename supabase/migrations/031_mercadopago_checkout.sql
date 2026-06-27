-- Extends stores with checkout_mode toggle; extends orders with payment fields
-- and guest-checkout buyer contact; adds store_mp_connections for per-store
-- Mercado Pago OAuth credentials (encrypted at the application layer).
--
-- Buyer fields audit (task 1.1):
--   Already in orders (019): customer_name
--   Added here:              customer_email, customer_phone, delivery_address
--
-- Backfill: all new columns have safe defaults (NULL or explicit DEFAULT).
-- Reversible: all changes are additive; rollback = DROP the columns/table.


-- ─── stores: checkout_mode toggle ────────────────────────────────────────────
-- D3: toggle per store; default 'whatsapp' keeps existing behavior unchanged.

ALTER TABLE public.stores
  ADD COLUMN checkout_mode text NOT NULL DEFAULT 'whatsapp'
    CHECK (checkout_mode IN ('whatsapp', 'mercadopago'));


-- ─── orders: guest-checkout buyer contact fields ──────────────────────────────
-- customer_name already existed (019). The three fields below are new.
-- All nullable: whatsapp orders don't collect email/phone/address at DB level.

ALTER TABLE public.orders
  ADD COLUMN customer_email   text,
  ADD COLUMN customer_phone   text,
  ADD COLUMN delivery_address text;


-- ─── orders: payment fields ───────────────────────────────────────────────────
-- D2: extend orders rather than create a separate payments table.
-- channel     — which checkout path was used (default whatsapp = backwards compat)
-- payment_status — MP payment lifecycle; default pending
-- mp_preference_id / mp_payment_id — MP references, set by server only

ALTER TABLE public.orders
  ADD COLUMN channel          text NOT NULL DEFAULT 'whatsapp'
               CHECK (channel IN ('whatsapp', 'mercadopago')),
  ADD COLUMN payment_status   text NOT NULL DEFAULT 'pending'
               CHECK (payment_status IN ('pending', 'approved', 'rejected', 'cancelled')),
  ADD COLUMN mp_preference_id text,
  ADD COLUMN mp_payment_id    text;


-- ─── orders: protect payment columns from non-service_role writes ─────────────
-- The owner UPDATE policy (019) lets owners transition order status, but they
-- must not be able to touch channel / payment_status / MP references.
-- Replicates the pattern of prevent_billing_column_writes() from 027.
--
-- NOTE: Using IS DISTINCT FROM handles NULLs correctly (NULL IS DISTINCT FROM
-- NULL = false, so no false positives when both old and new are NULL).

CREATE OR REPLACE FUNCTION public.prevent_order_payment_column_writes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- service_role (admin client) is the only caller allowed to write these fields.
  IF current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF (
    NEW.channel          IS DISTINCT FROM OLD.channel          OR
    NEW.payment_status   IS DISTINCT FROM OLD.payment_status   OR
    NEW.mp_preference_id IS DISTINCT FROM OLD.mp_preference_id OR
    NEW.mp_payment_id    IS DISTINCT FROM OLD.mp_payment_id
  ) THEN
    RAISE EXCEPTION 'permission denied: payment fields can only be modified by the service role';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_protect_payment_fields
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.prevent_order_payment_column_writes();


-- ─── store_mp_connections ─────────────────────────────────────────────────────
-- 1:1 with stores (store_id is the PK).
-- access_token_enc / refresh_token_enc store AES-256-GCM ciphertext produced by
-- lib/crypto/secrets.ts; they are never returned to the client by Server Actions.
-- ON DELETE CASCADE: removing a store cleans up its MP connection automatically.

CREATE TABLE public.store_mp_connections (
  store_id          uuid        PRIMARY KEY
                                REFERENCES public.stores(id) ON DELETE CASCADE,
  mp_user_id        text,
  access_token_enc  text,
  refresh_token_enc text,
  token_expires_at  timestamptz,
  public_key        text,
  connected_at      timestamptz,
  revoked_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_store_mp_connections_updated_at
  BEFORE UPDATE ON public.store_mp_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── store_mp_connections: RLS ────────────────────────────────────────────────

ALTER TABLE public.store_mp_connections ENABLE ROW LEVEL SECURITY;

-- Owner can SELECT their own connection row.
--
-- Column-level token restriction note (D6):
-- Postgres column-level REVOKE on SELECT is bypassed when the role already holds
-- a table-level SELECT privilege (the same mechanism documented in 027 for UPDATE).
-- Supabase grants table-level SELECT on public tables to `authenticated` by default,
-- so REVOKE SELECT (access_token_enc, refresh_token_enc) FROM authenticated would
-- be silently ineffective.
--
-- Real enforcement: Server Actions that return connection status MUST select only
-- metadata columns (store_id, mp_user_id, connected_at, revoked_at, token_expires_at)
-- and never return access_token_enc or refresh_token_enc to the caller. Token columns
-- are used exclusively server-side in getValidMpAccessToken().
CREATE POLICY "store_mp_connections_owner_select"
  ON public.store_mp_connections FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT owner_id FROM public.stores WHERE id = store_mp_connections.store_id
    )
  );

-- Superadmin has full access (read + write) for admin/support operations.
CREATE POLICY "store_mp_connections_superadmin_all"
  ON public.store_mp_connections FOR ALL
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- No INSERT or UPDATE policies for authenticated/anon roles.
-- RLS with no matching policy = implicit deny for those roles.
-- service_role bypasses RLS entirely and is the only writer (admin client).
