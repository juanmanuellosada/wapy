-- Seed the superadmin whitelist entry.
-- Idempotent: ON CONFLICT DO NOTHING.

INSERT INTO public.whitelist (email, grant_role)
VALUES ('juanmalosada01@gmail.com', 'superadmin')
ON CONFLICT (email) DO NOTHING;
