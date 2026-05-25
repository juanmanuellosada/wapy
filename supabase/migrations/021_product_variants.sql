-- product variants: 4 new tables + 3 new columns on order_items.
--
-- product_option_types  → tipos de opción por producto (ej. "Color", "Talle")
-- product_option_values → valores por tipo (ej. "Rojo", "M")
-- product_variants      → combinaciones con stock, precio e imagen opcionales
-- product_variant_option_values → join entre variant y sus option_values
--
-- order_items additions:
--   variant_id         (nullable FK) — ref a la variedad comprada
--   price_at_purchase  (int, not null) — snapshot de precio al momento de la compra
--   variant_label      (text, nullable) — snapshot de la etiqueta de variedad (ej. "Rojo / M")
--
-- Nota: price_override usa int (cents) para ser consistente con products.price_cents y
-- order_items.unit_price_cents, que ya usan entero en centavos. El design.md dice "numeric"
-- pero el proyecto usa exclusivamente int para precios.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. product_option_types
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.product_option_types (
  id          uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  product_id  uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name        text        NOT NULL CHECK (char_length(name) <= 32 AND char_length(name) > 0),
  position    int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, name)
);

CREATE INDEX product_option_types_product_id_idx ON public.product_option_types (product_id);

ALTER TABLE public.product_option_types ENABLE ROW LEVEL SECURITY;

-- Owner CRUD
CREATE POLICY "product_option_types_owner_crud"
  ON public.product_option_types FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = product_id AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = product_id AND s.owner_id = auth.uid()
    )
  );

-- Public anon read: only if product is active and store is published
CREATE POLICY "product_option_types_select_public"
  ON public.product_option_types FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = product_id
        AND p.is_active = TRUE
        AND s.status = 'published'
    )
  );

-- Superadmin all
CREATE POLICY "product_option_types_superadmin_all"
  ON public.product_option_types FOR ALL
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. product_option_values
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.product_option_values (
  id             uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  option_type_id uuid        NOT NULL REFERENCES public.product_option_types(id) ON DELETE CASCADE,
  value          text        NOT NULL CHECK (char_length(value) <= 32 AND char_length(value) > 0),
  position       int         NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (option_type_id, value)
);

CREATE INDEX product_option_values_option_type_id_idx ON public.product_option_values (option_type_id);

ALTER TABLE public.product_option_values ENABLE ROW LEVEL SECURITY;

-- Owner CRUD (join through product_option_types → products → stores)
CREATE POLICY "product_option_values_owner_crud"
  ON public.product_option_values FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.product_option_types ot
      JOIN public.products p ON p.id = ot.product_id
      JOIN public.stores s ON s.id = p.store_id
      WHERE ot.id = option_type_id AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.product_option_types ot
      JOIN public.products p ON p.id = ot.product_id
      JOIN public.stores s ON s.id = p.store_id
      WHERE ot.id = option_type_id AND s.owner_id = auth.uid()
    )
  );

-- Public anon read
CREATE POLICY "product_option_values_select_public"
  ON public.product_option_values FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.product_option_types ot
      JOIN public.products p ON p.id = ot.product_id
      JOIN public.stores s ON s.id = p.store_id
      WHERE ot.id = option_type_id
        AND p.is_active = TRUE
        AND s.status = 'published'
    )
  );

-- Superadmin all
CREATE POLICY "product_option_values_superadmin_all"
  ON public.product_option_values FOR ALL
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. product_variants
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.product_variants (
  id             uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  product_id     uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  stock          int         NOT NULL DEFAULT 0 CHECK (stock >= 0),
  price_override int         NULL CHECK (price_override IS NULL OR price_override >= 0),  -- cents; null = hereda del producto
  image_url      text        NULL,
  position       int         NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz NULL  -- soft-delete: variedades referenciadas en order_items históricos
);

CREATE TRIGGER set_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX product_variants_product_id_idx ON public.product_variants (product_id);
-- Filtra variedades activas (sin soft-delete) en queries frecuentes
CREATE INDEX product_variants_product_id_active_idx ON public.product_variants (product_id) WHERE deleted_at IS NULL;

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- Owner CRUD
CREATE POLICY "product_variants_owner_crud"
  ON public.product_variants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = product_id AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = product_id AND s.owner_id = auth.uid()
    )
  );

-- Public anon read: solo variedades activas (deleted_at IS NULL) de productos publicados
CREATE POLICY "product_variants_select_public"
  ON public.product_variants FOR SELECT
  TO anon
  USING (
    deleted_at IS NULL AND
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = product_id
        AND p.is_active = TRUE
        AND s.status = 'published'
    )
  );

-- Superadmin all
CREATE POLICY "product_variants_superadmin_all"
  ON public.product_variants FOR ALL
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. product_variant_option_values
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.product_variant_option_values (
  variant_id      uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  option_value_id uuid NOT NULL REFERENCES public.product_option_values(id) ON DELETE CASCADE,
  PRIMARY KEY (variant_id, option_value_id)
);

CREATE INDEX product_variant_option_values_variant_id_idx      ON public.product_variant_option_values (variant_id);
CREATE INDEX product_variant_option_values_option_value_id_idx ON public.product_variant_option_values (option_value_id);

ALTER TABLE public.product_variant_option_values ENABLE ROW LEVEL SECURITY;

-- Owner CRUD (join through product_variants → products → stores)
CREATE POLICY "product_variant_option_values_owner_crud"
  ON public.product_variant_option_values FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      JOIN public.stores s ON s.id = p.store_id
      WHERE pv.id = variant_id AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      JOIN public.stores s ON s.id = p.store_id
      WHERE pv.id = variant_id AND s.owner_id = auth.uid()
    )
  );

-- Public anon read
CREATE POLICY "product_variant_option_values_select_public"
  ON public.product_variant_option_values FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      JOIN public.stores s ON s.id = p.store_id
      WHERE pv.id = variant_id
        AND pv.deleted_at IS NULL
        AND p.is_active = TRUE
        AND s.status = 'published'
    )
  );

-- Superadmin all
CREATE POLICY "product_variant_option_values_superadmin_all"
  ON public.product_variant_option_values FOR ALL
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. order_items: nuevas columnas (task 1.2 y 1.3)
-- ─────────────────────────────────────────────────────────────────────────────

-- variant_id: referencia a la variedad comprada (null para productos simples)
ALTER TABLE public.order_items
  ADD COLUMN variant_id uuid REFERENCES public.product_variants(id);

-- price_at_purchase: snapshot del precio pagado en cents al momento de la compra.
-- Nota: order_items ya tiene unit_price_cents (bigint). price_at_purchase es la contraparte
-- para variedades — almacena el precio efectivo de la variedad (override o herencia del producto).
-- Para productos simples, la Server Action debe poblar price_at_purchase = unit_price_cents.
ALTER TABLE public.order_items
  ADD COLUMN price_at_purchase int NOT NULL DEFAULT 0;

-- variant_label: snapshot de la etiqueta de la variedad (ej. "Rojo / M").
-- Null para productos simples.
ALTER TABLE public.order_items
  ADD COLUMN variant_label text NULL;

CREATE INDEX order_items_variant_id_idx ON public.order_items (variant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTAS PARA EL DESARROLLADOR
-- ─────────────────────────────────────────────────────────────────────────────
-- * price_override en product_variants usa int (cents) para ser consistente con
--   products.price_cents (int) y order_items.unit_price_cents (bigint). El design.md
--   menciona "numeric" pero el proyecto no usa numeric en ninguna columna de precios.
--
-- * price_at_purchase se agrega con DEFAULT 0 para no romper filas existentes en
--   order_items. La Server Action de checkout debe poblar correctamente este campo
--   en todos los order_items nuevos (productos simples y con variedad).
--
-- * Las políticas de order_items NO se modifican — la inserción de pedidos ya ocurre
--   vía service_role (server action con admin client), que bypasea RLS. Solo se agregan
--   índices y columnas.
--
-- * Para regenerar tipos TypeScript tras aplicar esta migración en el proyecto remoto:
--   supabase gen types typescript --project-id <PROJECT_ID> > lib/supabase/types.ts
--   O desde el MCP: mcp__claude_ai_Supabase__generate_typescript_types
