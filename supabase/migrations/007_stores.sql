-- stores: one store per owner, slug-disciplined, status-tracked.

CREATE TABLE public.stores (
  id               uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  owner_id         uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  slug             text NOT NULL UNIQUE
                     CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$'),
  status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'published', 'paused')),
  onboarding_step  int NOT NULL DEFAULT 0,
  whatsapp_number  text,
  logo_url         text,
  theme            jsonb NOT NULL DEFAULT '{}',
  published_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  updated_at       timestamptz NOT NULL DEFAULT NOW()
);

-- updated_at trigger
CREATE TRIGGER set_stores_updated_at
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Reserved slug enforcement trigger (BEFORE INSERT OR UPDATE OF slug)
CREATE OR REPLACE FUNCTION public.check_reserved_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.reserved_slugs WHERE slug = NEW.slug) THEN
    RAISE EXCEPTION 'Slug "%" is reserved and cannot be used for a store.', NEW.slug;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stores_check_reserved_slug
  BEFORE INSERT OR UPDATE OF slug ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.check_reserved_slug();

-- RLS
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- Owner sees only their own store
CREATE POLICY "stores_select_owner"
  ON public.stores FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "stores_insert_owner"
  ON public.stores FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "stores_update_owner"
  ON public.stores FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "stores_delete_owner"
  ON public.stores FOR DELETE
  USING (owner_id = auth.uid());

-- Public (anon) can read published stores
CREATE POLICY "stores_select_public_published"
  ON public.stores FOR SELECT
  TO anon
  USING (status = 'published');

-- Superadmin sees all
CREATE POLICY "stores_all_superadmin"
  ON public.stores FOR ALL
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

-- Indexes
CREATE INDEX stores_slug_idx ON public.stores (slug);
CREATE INDEX stores_owner_id_idx ON public.stores (owner_id);
CREATE INDEX stores_status_idx ON public.stores (status);
