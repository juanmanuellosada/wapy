-- Landing revamp: add plan + trial tracking to whitelist.
-- Both nullable so the seeded superadmin row needs no backfill.
-- approveLead in lib/leads/actions.ts sets these when creating whitelist rows
-- from approved leads.

ALTER TABLE public.whitelist
  ADD COLUMN plan text CHECK (plan IN ('inicial', 'pro')),
  ADD COLUMN trial_ends_at timestamptz;
