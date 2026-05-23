-- Address Supabase advisor warnings from migrations 001-011.
-- Decisions:
--   1. Pin search_path on functions that lacked it (deterministic resolution).
--   2. Revoke REST exposure of trigger-only SECURITY DEFINER functions.
--   3. Drop broad public SELECT policies on storage.objects for our public
--      buckets — object URL serving works without them; the policies only
--      enabled the LIST API which leaks the file inventory.
-- Intentional: whitelist_check_email remains callable by anon (spec requires
-- it for the signup flow).

ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.whitelist_lowercase_email() SET search_path = public;
ALTER FUNCTION public.check_reserved_slug() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.archive_old_slug() FROM anon, authenticated, public;

DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
DROP POLICY IF EXISTS "store_logos_public_read" ON storage.objects;
