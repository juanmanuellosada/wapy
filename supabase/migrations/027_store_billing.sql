-- Add billing fields to stores (mp_preapproval_id, mp_subscription_status,
-- subscription_status_changed_at, payment_exempt, payment_exempt_reason, blocked_at).
-- plan and trial_ends_at already exist (migration 023).

ALTER TABLE public.stores
  ADD COLUMN mp_preapproval_id             text,
  ADD COLUMN mp_subscription_status        text,
  ADD COLUMN subscription_status_changed_at timestamptz,
  ADD COLUMN payment_exempt               boolean NOT NULL DEFAULT false,
  ADD COLUMN payment_exempt_reason        text,
  ADD COLUMN blocked_at                   timestamptz;

-- Backfill: all pre-existing stores are grandfathered as payment-exempt.
UPDATE public.stores
SET
  payment_exempt        = true,
  payment_exempt_reason = 'Tienda pre-existente al lanzamiento del cobro (2026-05)';

-- RLS: owners can read their own billing fields.
-- The existing "stores_select_owner" policy on public.stores already covers
-- SELECT for the full row (owner_id = auth.uid()), so no new SELECT policy is
-- needed for the owner — the new columns are included in the existing row policy.

-- Superadmin: "stores_all_superadmin" already covers ALL operations, so it
-- already covers reading the new columns.

-- No write policies are added for non-service roles: webhook and cron write
-- exclusively via the admin client (service role, bypasses RLS). This enforces
-- Decision 7 from the design document.

-- ---------------------------------------------------------------------------
-- Billing field write protection via trigger
--
-- NOTE: A REVOKE UPDATE (col, ...) FROM authenticated would look like it
-- protects these columns, but in Postgres column-level privileges are only
-- checked when the role does NOT hold a table-level UPDATE privilege. Because
-- Supabase grants table-level UPDATE on public.stores to the `authenticated`
-- role by default, any REVOKE on individual columns is silently bypassed —
-- the table-level grant wins. The trigger below is the REAL enforcement.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_billing_column_writes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Allow writes that come through the admin client (service_role bypasses RLS
  -- and executes as the service_role user in PostgREST).
  IF current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- For every other role (authenticated, anon, …) reject any attempt to
  -- change a billing field.  Using IS DISTINCT FROM handles NULL correctly.
  IF (
    NEW.mp_preapproval_id              IS DISTINCT FROM OLD.mp_preapproval_id              OR
    NEW.mp_subscription_status         IS DISTINCT FROM OLD.mp_subscription_status         OR
    NEW.subscription_status_changed_at IS DISTINCT FROM OLD.subscription_status_changed_at OR
    NEW.payment_exempt                 IS DISTINCT FROM OLD.payment_exempt                 OR
    NEW.payment_exempt_reason          IS DISTINCT FROM OLD.payment_exempt_reason          OR
    NEW.blocked_at                     IS DISTINCT FROM OLD.blocked_at
  ) THEN
    RAISE EXCEPTION 'permission denied: billing fields can only be modified by the service role';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER stores_protect_billing_fields
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.prevent_billing_column_writes();
