-- sections and products: belong to a store, linked via store_id / section_id.

CREATE TABLE public.sections (
  id         uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  store_id   uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name       text NOT NULL,
  slug       text NOT NULL,
  position   int NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, slug)
);

CREATE TRIGGER set_sections_updated_at
  BEFORE UPDATE ON public.sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

-- Owner CRUD on own store's sections
CREATE POLICY "sections_owner_crud"
  ON public.sections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.owner_id = auth.uid()
    )
  );

-- Public anon read: only sections of published stores
CREATE POLICY "sections_select_public"
  ON public.sections FOR SELECT
  TO anon
  USING (
    is_active = TRUE AND
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.status = 'published'
    )
  );

-- Superadmin all
CREATE POLICY "sections_superadmin_all"
  ON public.sections FOR ALL
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

CREATE INDEX sections_store_id_idx ON public.sections (store_id);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.products (
  id          uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  store_id    uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  section_id  uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  name        text NOT NULL,
  description text,
  price_cents int NOT NULL CHECK (price_cents >= 0),
  currency    text NOT NULL DEFAULT 'ARS',
  stock       int,  -- NULL = unlimited
  image_urls  text[] NOT NULL DEFAULT '{}' CHECK (array_length(image_urls, 1) IS NULL OR array_length(image_urls, 1) <= 10),
  is_active   boolean NOT NULL DEFAULT TRUE,
  position    int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Owner CRUD on own store's products
CREATE POLICY "products_owner_crud"
  ON public.products FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.owner_id = auth.uid()
    )
  );

-- Public anon read: only products of published stores that are active
CREATE POLICY "products_select_public"
  ON public.products FOR SELECT
  TO anon
  USING (
    is_active = TRUE AND
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.status = 'published'
    )
  );

-- Superadmin all
CREATE POLICY "products_superadmin_all"
  ON public.products FOR ALL
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

CREATE INDEX products_store_id_idx ON public.products (store_id);
CREATE INDEX products_section_id_idx ON public.products (section_id);
