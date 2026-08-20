-- 038_orders_soft_delete.sql
-- Le da a la dueña una forma de sacar un pedido de su vista sin destruirlo.
-- Ver openspec/changes/add-order-soft-delete/design.md.
--
-- ─── orders.deleted_at (Decisión 1) ─────────────────────────────────────────
-- Marca de borrado, no `DELETE`: el requisito de producto es invisible para
-- la dueña pero recuperable a nivel de datos (un borrado por error, o un
-- reclamo de una compradora sobre algo que la dueña limpió en lote, no
-- pueden ser irreversibles). Nullable, sin backfill: ningún pedido existente
-- nace borrado.
--
-- Toda lectura de la dueña (listado, búsqueda, exportación, métricas,
-- backlog) filtra por `deleted_at IS NULL` desde los helpers compartidos
-- del código de la app (fetchFilteredOrders, getOrderById). Esta migración
-- cubre la otra mitad: las dos RPCs SECURITY DEFINER de storefront que
-- consultan `orders` por fuera de ese código.
--
-- ─── Índice parcial para listado/búsqueda (Decisión 1) ──────────────────────
-- Las consultas de la dueña siempre filtran por tienda y por no borrado, y
-- ordenan por fecha descendente — mismo shape que `orders_store_created_idx`
-- (migración 019) pero con la condición `deleted_at IS NULL` para que los
-- pedidos borrados no inflen el índice que sirve al uso diario.
--
-- ─── RPCs de storefront (Decisión 4) ────────────────────────────────────────
-- `storefront_top_sellers` y `storefront_co_purchased` (migración 025)
-- alimentan "lo más pedido" y los productos relacionados de la tienda
-- pública. Se reescriben para excluir pedidos borrados, conservando el
-- resto de su lógica, su firma, `SECURITY DEFINER` y sus GRANTs — es el
-- punto más fácil de pasar por alto porque ningún filtro de TypeScript las
-- alcanza.
--
-- Reversibilidad: la columna y el índice son aditivos (rollback = DROP
-- COLUMN/INDEX). Revertir las RPCs a su versión de la migración 025 las deja
-- funcionando como antes; los pedidos marcados volverían a aparecer, que es
-- el estado previo a este change.

-- ─── orders: columna nueva ──────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN deleted_at timestamptz;

CREATE INDEX orders_store_id_created_at_not_deleted_idx
  ON public.orders (store_id, created_at DESC)
  WHERE deleted_at IS NULL;


-- ─── storefront_top_sellers: excluir pedidos borrados ───────────────────────

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
      AND o.deleted_at IS NULL
      AND o.created_at >= now() - make_interval(days => p_days)
      AND oi.product_id IS NOT NULL
    GROUP BY oi.product_id
    ORDER BY units_sold DESC, oi.product_id ASC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.storefront_top_sellers(uuid, int, int) TO anon, authenticated;


-- ─── storefront_co_purchased: excluir pedidos borrados ──────────────────────

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
        AND o.deleted_at IS NULL
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
