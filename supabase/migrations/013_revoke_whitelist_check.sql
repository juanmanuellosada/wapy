-- Phase 2 (wapy-auth-whitelist): close the last security advisor warning from Phase 1.
-- whitelist_check_email is no longer called from the client — signup validation
-- runs server-side using the admin Supabase client in lib/auth/validation.ts.
-- Revoke EXECUTE so PostgREST will return 403 if anyone attempts to call the RPC.

REVOKE EXECUTE ON FUNCTION public.whitelist_check_email(text) FROM anon, authenticated, public;
