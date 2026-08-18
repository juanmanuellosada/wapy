-- 035_product_price_tiers.sql
-- Tramos de precio por cantidad ("si llevás 3, te sale más barato por unidad").
--
-- Cada fila es un tramo de un producto: a partir de `min_quantity` unidades, el
-- precio unitario pasa a ser `unit_price_cents` para TODAS las unidades de la
-- línea (no solo las que exceden el mínimo). Ver
-- openspec/changes/add-quantity-price-tiers/design.md, Decisión 1.
--
-- Un producto sin filas acá se comporta exactamente como hoy: no hay backfill.
--
-- `unit_price_cents` es entero en centavos porque `mp_items[].unit_price` que se
-- manda a Mercado Pago tiene que ser representable en centavos y se multiplica
-- por la cantidad. Por eso un tramo "3 por $2800" se guarda como 93333 c/u.
--
-- La cantidad que activa el tramo se agrega POR PRODUCTO (sumando todas las
-- variantes del carrito), igual que `min_quantity` / `qty_step`. Para variantes
-- con `price_override` el tramo se aplica como ratio proporcional, resuelto
-- server-side en lib/store/pricing.ts (resolveTieredPrice).
--
-- El CHECK "unit_price_cents < products.price_cents" es cross-table y se valida
-- server-side (lib/store/product-validation.ts + lib/store/actions.ts), igual
-- que el promo de variantes en 034.

CREATE TABLE public.product_price_tiers (
  id               uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  product_id       uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  min_quantity     int         NOT NULL CHECK (min_quantity >= 2),
  unit_price_cents int         NOT NULL CHECK (unit_price_cents >= 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, min_quantity)
);

CREATE INDEX product_price_tiers_product_id_idx ON public.product_price_tiers (product_id);

ALTER TABLE public.product_price_tiers ENABLE ROW LEVEL SECURITY;

-- Owner CRUD
CREATE POLICY "product_price_tiers_owner_crud"
  ON public.product_price_tiers FOR ALL
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
CREATE POLICY "product_price_tiers_select_public"
  ON public.product_price_tiers FOR SELECT
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
CREATE POLICY "product_price_tiers_superadmin_all"
  ON public.product_price_tiers FOR ALL
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
