-- Add plan + trial tracking to stores, mirroring the whitelist columns.
-- Fields are added nullable first, backfilled from whitelist via the owner's
-- email, then plan is locked to NOT NULL with a default of 'inicial'.
-- Stores with no whitelist match are grandfathered as 'pro'.

ALTER TABLE public.stores ADD COLUMN plan text;
ALTER TABLE public.stores ADD COLUMN trial_ends_at timestamptz;

UPDATE public.stores s
SET
  plan           = COALESCE(w.plan, 'pro'),
  trial_ends_at  = w.trial_ends_at
FROM auth.users u
LEFT JOIN public.whitelist w ON lower(w.email) = lower(u.email)
WHERE s.owner_id = u.id
  AND s.plan IS NULL;

ALTER TABLE public.stores ALTER COLUMN plan SET NOT NULL;
ALTER TABLE public.stores ALTER COLUMN plan SET DEFAULT 'inicial';
ALTER TABLE public.stores ADD CONSTRAINT stores_plan_check CHECK (plan IN ('inicial', 'pro'));
