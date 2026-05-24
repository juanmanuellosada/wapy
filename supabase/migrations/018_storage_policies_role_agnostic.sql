-- ---------------------------------------------------------------------------
-- Fix: storage policies fallaban con publishable apikey + user JWT.
--
-- Síntoma: 403 "new row violates row-level security policy" al subir logo
-- desde el browser, incluso con `authorization: Bearer <user-jwt>` válido y
-- el user siendo el owner del store.
--
-- Causa: con el formato nuevo de keys (sb_publishable_...) y user JWT firmado
-- con ES256, el storage worker no upgradea el rol Postgres de `anon` a
-- `authenticated` (PostgREST sí lo hace). Las policies estaban con
-- `TO authenticated`, así que no se evaluaban → denegado.
--
-- Fix: quitar la restricción de rol de las policies de storage.objects que
-- usamos. El gate real lo sigue haciendo `auth.uid()` (que SÍ está poblada
-- por el JWT) vía el subquery a `stores.owner_id`. Si la sesión fuera anon
-- de verdad, `auth.uid()` retorna NULL y el subquery no matchea nada.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS store_logos_owner_write ON storage.objects;
DROP POLICY IF EXISTS store_logos_owner_update ON storage.objects;
DROP POLICY IF EXISTS store_logos_owner_delete ON storage.objects;
DROP POLICY IF EXISTS product_images_owner_write ON storage.objects;
DROP POLICY IF EXISTS product_images_owner_update ON storage.objects;
DROP POLICY IF EXISTS product_images_owner_delete ON storage.objects;

CREATE POLICY store_logos_owner_write ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'store-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.stores WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY store_logos_owner_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'store-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.stores WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY store_logos_owner_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'store-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.stores WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY product_images_owner_write ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.stores WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY product_images_owner_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.stores WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY product_images_owner_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.stores WHERE owner_id = auth.uid()
    )
  );
