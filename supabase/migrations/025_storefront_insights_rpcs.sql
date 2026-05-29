-- Storefront insights RPCs for wapy-storefront-growth change.
--
-- storefront_top_sellers: returns products ordered by units sold in the last N days.
-- storefront_co_purchased: returns products co-purchased with a given product.
--
-- Both functions:
--   - STABLE SECURITY DEFINER (anon can't SELECT orders directly; DEFINER bypasses RLS)
--   - SET search_path = public (defend against search_path injection)
--   - validate stores.status = 'published' before returning any data
--   - GRANT EXECUTE to anon + authenticated

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. storefront_top_sellers
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.storefront_top_sellers(
  p_store_id uuid,
  p_days     int  DEFAULT 30,
  p_limit    int  DEFAULT 10
)
RETURNS TABLE (product_id uuid, units_sold bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate that the store exists and is published.
  -- Return empty result if not (no error raised).
  IF NOT EXISTS (
    SELECT 1 FROM stores WHERE id = p_store_id AND status = 'published'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT oi.product_id, SUM(oi.quantity)::bigint AS units_sold
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.store_id = p_store_id
      AND o.status IN ('confirmed', 'delivered')
      AND o.created_at >= now() - make_interval(days => p_days)
      AND oi.product_id IS NOT NULL
    GROUP BY oi.product_id
    ORDER BY units_sold DESC, oi.product_id ASC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.storefront_top_sellers(uuid, int, int) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. storefront_co_purchased
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.storefront_co_purchased(
  p_product_id uuid,
  p_store_id   uuid,
  p_limit      int  DEFAULT 6
)
RETURNS TABLE (product_id uuid, co_orders bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate that the store exists and is published.
  IF NOT EXISTS (
    SELECT 1 FROM stores WHERE id = p_store_id AND status = 'published'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
    WITH orders_with_target AS (
      SELECT DISTINCT o.id
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.store_id = p_store_id
        AND oi.product_id = p_product_id
        AND o.status IN ('confirmed', 'delivered')
    )
    SELECT oi.product_id, COUNT(DISTINCT oi.order_id)::bigint AS co_orders
    FROM order_items oi
    WHERE oi.order_id IN (SELECT id FROM orders_with_target)
      AND oi.product_id IS NOT NULL
      AND oi.product_id <> p_product_id
    GROUP BY oi.product_id
    ORDER BY co_orders DESC, oi.product_id ASC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.storefront_co_purchased(uuid, uuid, int) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Composite index for insights queries (if not already covered)
-- ─────────────────────────────────────────────────────────────────────────────

-- The existing indexes are:
--   orders_store_created_idx ON orders(store_id, created_at DESC)
--   orders_store_status_idx  ON orders(store_id, status)
--   order_items_order_idx    ON order_items(order_id)
--   order_items_product_idx  ON order_items(product_id)
--
-- A composite index (store_id, status, created_at) helps top_sellers filter
-- by store + status + date window in one scan.

CREATE INDEX IF NOT EXISTS idx_orders_store_status_created
  ON public.orders (store_id, status, created_at DESC);

-- A composite index (product_id, order_id) helps co_purchased join faster.
CREATE INDEX IF NOT EXISTS idx_order_items_product_order
  ON public.order_items (product_id, order_id);
