-- orders: one row per checkout. Insert only via service_role (server action).
-- order_items: immutable snapshot of cart items at checkout time.
-- RLS: authenticated store owners can SELECT/UPDATE/DELETE own orders.
-- INSERT is blocked for all client roles; service_role bypasses RLS naturally.

CREATE TABLE public.orders (
  id           uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  store_id     uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','confirmed','cancelled','delivered')),
  customer_name text,
  total_cents  bigint NOT NULL CHECK (total_cents >= 0),
  currency     text NOT NULL DEFAULT 'ARS',
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  delivered_at timestamptz
);

CREATE TABLE public.order_items (
  id               uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id       uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name     text NOT NULL,
  unit_price_cents bigint NOT NULL CHECK (unit_price_cents >= 0),
  quantity         integer NOT NULL CHECK (quantity > 0),
  section_id       uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  section_name     text
);

CREATE INDEX orders_store_created_idx ON public.orders (store_id, created_at DESC);
CREATE INDEX orders_store_status_idx  ON public.orders (store_id, status);
CREATE INDEX order_items_order_idx    ON public.order_items (order_id);
CREATE INDEX order_items_product_idx  ON public.order_items (product_id);

ALTER TABLE public.orders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- orders: owner SELECT
CREATE POLICY "orders_owner_select"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT owner_id FROM public.stores WHERE id = orders.store_id
    )
  );

-- orders: owner UPDATE (status transitions)
CREATE POLICY "orders_owner_update"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT owner_id FROM public.stores WHERE id = orders.store_id
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT owner_id FROM public.stores WHERE id = orders.store_id
    )
  );

-- orders: owner DELETE
CREATE POLICY "orders_owner_delete"
  ON public.orders FOR DELETE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT owner_id FROM public.stores WHERE id = orders.store_id
    )
  );

-- order_items: owner SELECT
CREATE POLICY "order_items_owner_select"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.stores s ON s.id = o.store_id
      WHERE o.id = order_items.order_id
        AND s.owner_id = auth.uid()
    )
  );

-- order_items: owner UPDATE
CREATE POLICY "order_items_owner_update"
  ON public.order_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.stores s ON s.id = o.store_id
      WHERE o.id = order_items.order_id
        AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.stores s ON s.id = o.store_id
      WHERE o.id = order_items.order_id
        AND s.owner_id = auth.uid()
    )
  );

-- order_items: owner DELETE
CREATE POLICY "order_items_owner_delete"
  ON public.order_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.stores s ON s.id = o.store_id
      WHERE o.id = order_items.order_id
        AND s.owner_id = auth.uid()
    )
  );
