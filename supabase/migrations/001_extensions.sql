-- Ensure pgcrypto is available (it's already installed in extensions schema by Supabase)
-- This migration is a no-op if pgcrypto is already installed; here for documentation.
-- gen_random_uuid() is available via the built-in extensions schema on Supabase Postgres 17.
-- We do not re-install; just confirm with a query that it resolves.
SELECT extensions.gen_random_uuid();
