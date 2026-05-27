-- Storage bucket for store banners (3:1 cover images).
-- Upload path: {store_id}/banner.{ext}
-- Writes go through a Server Action + admin client (ES256 JWT gotcha — same pattern as store-logos).

INSERT INTO storage.buckets (id, name, public)
VALUES ('store-banners', 'store-banners', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ─── store-banners policies ───────────────────────────────────────────────────

-- Public read
DROP POLICY IF EXISTS "store_banners_public_read" ON storage.objects;
CREATE POLICY "store_banners_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'store-banners');

-- Owner insert/update/delete
DROP POLICY IF EXISTS "store_banners_owner_write" ON storage.objects;
CREATE POLICY "store_banners_owner_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'store-banners'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.stores WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "store_banners_owner_update" ON storage.objects;
CREATE POLICY "store_banners_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'store-banners'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.stores WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "store_banners_owner_delete" ON storage.objects;
CREATE POLICY "store_banners_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'store-banners'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.stores WHERE owner_id = auth.uid()
    )
  );

-- Superadmin unrestricted on store-banners
DROP POLICY IF EXISTS "store_banners_superadmin_all" ON storage.objects;
CREATE POLICY "store_banners_superadmin_all"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'store-banners'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
  )
  WITH CHECK (
    bucket_id = 'store-banners'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
  );
