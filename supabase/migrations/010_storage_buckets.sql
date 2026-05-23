-- Storage buckets: product-images and store-logos.
-- Both are public-read; writes are scoped to the owning store_id prefix.

-- Create buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('product-images', 'product-images', TRUE),
  ('store-logos',    'store-logos',    TRUE)
ON CONFLICT (id) DO NOTHING;

-- ─── product-images policies ──────────────────────────────────────────────────

-- Public read (anon can GET any object)
CREATE POLICY "product_images_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'product-images');

-- Owner insert/update/delete: path must start with their store_id
CREATE POLICY "product_images_owner_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.stores WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "product_images_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.stores WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "product_images_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.stores WHERE owner_id = auth.uid()
    )
  );

-- Superadmin unrestricted on product-images
CREATE POLICY "product_images_superadmin_all"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
  );

-- ─── store-logos policies ─────────────────────────────────────────────────────

-- Public read
CREATE POLICY "store_logos_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'store-logos');

-- Owner insert/update/delete
CREATE POLICY "store_logos_owner_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'store-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.stores WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "store_logos_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'store-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.stores WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "store_logos_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'store-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.stores WHERE owner_id = auth.uid()
    )
  );

-- Superadmin unrestricted on store-logos
CREATE POLICY "store_logos_superadmin_all"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'store-logos'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
  )
  WITH CHECK (
    bucket_id = 'store-logos'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
  );
