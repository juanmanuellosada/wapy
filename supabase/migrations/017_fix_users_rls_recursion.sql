-- ---------------------------------------------------------------------------
-- Fix: infinite recursion in public.users RLS + storage policies that read it.
--
-- The "users_select_superadmin" and "users_update_superadmin" policies on
-- public.users referenced public.users themselves (EXISTS SELECT FROM users
-- WHERE role='superadmin'), which re-triggered the same SELECT policies →
-- 42P17. This broke any RLS check that touched public.users from an
-- authenticated context, including the storage.objects superadmin_all
-- policies, surfacing as 503 DatabaseInvalidObjectDefinition on logo upload.
--
-- Fix: hoist the superadmin check into a SECURITY DEFINER function that
-- bypasses RLS, and rewrite all the recursive policies to call it.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_superadmin(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = uid AND role = 'superadmin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_superadmin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.current_user_role(uid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = uid;
$$;

REVOKE ALL ON FUNCTION public.current_user_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role(uuid) TO authenticated, anon, service_role;

-- ---- public.users policies -------------------------------------------------

DROP POLICY IF EXISTS users_select_superadmin ON public.users;
DROP POLICY IF EXISTS users_update_superadmin ON public.users;
DROP POLICY IF EXISTS users_update_self ON public.users;

CREATE POLICY users_select_superadmin ON public.users
  FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()));

CREATE POLICY users_update_superadmin ON public.users
  FOR UPDATE TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

CREATE POLICY users_update_self ON public.users
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = public.current_user_role(auth.uid())
  );

-- ---- storage.objects superadmin policies -----------------------------------

DROP POLICY IF EXISTS store_logos_superadmin_all ON storage.objects;
DROP POLICY IF EXISTS product_images_superadmin_all ON storage.objects;

CREATE POLICY store_logos_superadmin_all ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'store-logos' AND public.is_superadmin(auth.uid()))
  WITH CHECK (bucket_id = 'store-logos' AND public.is_superadmin(auth.uid()));

CREATE POLICY product_images_superadmin_all ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'product-images' AND public.is_superadmin(auth.uid()))
  WITH CHECK (bucket_id = 'product-images' AND public.is_superadmin(auth.uid()));
