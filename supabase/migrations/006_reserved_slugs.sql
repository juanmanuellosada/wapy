-- reserved_slugs: strings that cannot be used as store slugs.
-- Seeded with all current + foreseeable system routes.

CREATE TABLE public.reserved_slugs (
  slug text PRIMARY KEY
);

ALTER TABLE public.reserved_slugs ENABLE ROW LEVEL SECURITY;

-- Public read: the app (and store-insert trigger) needs to check this
CREATE POLICY "reserved_slugs_public_read"
  ON public.reserved_slugs FOR SELECT
  TO anon, authenticated
  USING (TRUE);

-- Superadmin write (insert/update/delete)
CREATE POLICY "reserved_slugs_superadmin_write"
  ON public.reserved_slugs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
  );

-- Seed: English system routes + Spanish equivalents
INSERT INTO public.reserved_slugs (slug) VALUES
  -- English system routes
  ('admin'),
  ('api'),
  ('dashboard'),
  ('signup'),
  ('login'),
  ('logout'),
  ('onboarding'),
  ('forgot-password'),
  ('reset-password'),
  ('settings'),
  ('account'),
  ('billing'),
  ('help'),
  ('support'),
  ('terms'),
  ('privacy'),
  ('about'),
  ('pricing'),
  ('contact'),
  ('static'),
  ('_next'),
  ('favicon.ico'),
  ('robots.txt'),
  ('sitemap.xml'),
  ('apple-icon'),
  ('icon'),
  ('manifest.json'),
  ('wapy'),
  ('app'),
  ('auth'),
  ('public'),
  -- Spanish equivalents
  ('panel'),
  ('tienda'),
  ('tiendas'),
  ('ingresar'),
  ('registro'),
  ('cuenta'),
  ('ayuda'),
  ('terminos'),
  ('privacidad'),
  ('nosotros'),
  ('precios'),
  ('contacto')
ON CONFLICT DO NOTHING;
