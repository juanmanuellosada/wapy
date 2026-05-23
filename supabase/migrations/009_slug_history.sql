-- slug_history: permanent record of retired store slugs for 301 redirects.

CREATE TABLE public.slug_history (
  id         uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  store_id   uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  old_slug   text NOT NULL UNIQUE,
  changed_at timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE public.slug_history ENABLE ROW LEVEL SECURITY;

-- Anon read: needed for public route handler to resolve old slugs
CREATE POLICY "slug_history_anon_read"
  ON public.slug_history FOR SELECT
  TO anon, authenticated
  USING (TRUE);

-- Owner insert: only for their own store (trigger-driven, but policy allows it)
CREATE POLICY "slug_history_owner_insert"
  ON public.slug_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.owner_id = auth.uid()
    )
  );

-- Superadmin all
CREATE POLICY "slug_history_superadmin_all"
  ON public.slug_history FOR ALL
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

-- Trigger: automatically insert old slug into history when stores.slug changes
CREATE OR REPLACE FUNCTION public.archive_old_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.slug IS DISTINCT FROM NEW.slug THEN
    INSERT INTO public.slug_history (store_id, old_slug)
    VALUES (OLD.id, OLD.slug)
    ON CONFLICT (old_slug) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stores_archive_slug
  BEFORE UPDATE OF slug ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.archive_old_slug();

-- Indexes
CREATE INDEX slug_history_old_slug_idx ON public.slug_history (old_slug);
CREATE INDEX slug_history_store_id_idx ON public.slug_history (store_id);
