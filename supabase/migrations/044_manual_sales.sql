-- 044_manual_sales.sql
-- Tercer canal de pedido para ventas ocurridas fuera del sitio (feria,
-- Instagram, venta en persona). Ver openspec/changes/add-manual-sales/design.md.
--
-- ─── orders.channel: tercer valor 'manual' (Decisión D1) ────────────────────
-- Una venta manual es un pedido más en la misma tabla, no una entidad
-- paralela: entra sola en métricas, listado, búsqueda, exportación y filtro
-- por canal ya existentes. El CHECK se agregó sin nombre en
-- 031_mercadopago_checkout.sql, así que Postgres le asignó un nombre
-- autogenerado — mismo caso que `payment_status` en la misma migración 031,
-- que 033_mp_order_lifecycle.sql ya resolvió buscando el nombre real en vez
-- de asumirlo. Se replica ese mismo patrón acá en vez de asumir
-- `orders_channel_check`, para que esta migración no rompa si el nombre real
-- difiere.
--
-- ─── orders.sold_at (Decisión D2) ────────────────────────────────────────────
-- Fecha en que la venta ocurrió, distinta de `created_at` (cuándo se cargó
-- el registro) únicamente para ventas manuales cargadas en retrospectiva.
-- `NOT NULL DEFAULT now()` + backfill a `created_at`: para todo pedido no
-- manual las dos fechas siempre coinciden, porque el pedido se crea cuando
-- ocurre. Las métricas (getOrderStats, getRangeStart, el bucketing por día en
-- America/Argentina/Buenos_Aires) y los filtros de fecha de
-- fetchFilteredOrders pasan a agrupar por esta columna en vez de created_at.
--
-- ─── orders.stock_applied (Decisión D3) ─────────────────────────────────────
-- Si una venta manual no descontó stock (el dueño ya lo había ajustado a
-- mano), cancelarla o borrarla no debe reponer unidades que nunca salieron
-- — sería stock fantasma. `NOT NULL DEFAULT true` describe lo que hacen hoy
-- todos los pedidos existentes (todos descuentan stock al crearse), así que
-- el default ES el backfill. `replenishOrderStock` consulta esta columna
-- antes de reponer.
--
-- ─── Índice (store_id, sold_at) ──────────────────────────────────────────────
-- Sirve las mismas consultas que antes usaban (store_id, created_at): rango
-- de métricas y filtro de fecha del panel.
--
-- Reversibilidad: sold_at y stock_applied son aditivas (rollback = DROP
-- COLUMN). El CHECK de channel NO es trivialmente reversible: achicarlo de
-- vuelta a ('whatsapp','mercadopago') exige que no existan filas con
-- channel = 'manual' — si ya se cargaron ventas manuales, hay que borrarlas
-- primero (ver design.md, Migration Plan, paso 4).

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT con.conname INTO con_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'orders'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%channel%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_channel_check
    CHECK (channel IN ('whatsapp', 'mercadopago', 'manual'));

ALTER TABLE public.orders
  ADD COLUMN sold_at timestamptz NOT NULL DEFAULT now();

UPDATE public.orders SET sold_at = created_at;

ALTER TABLE public.orders
  ADD COLUMN stock_applied boolean NOT NULL DEFAULT true;

CREATE INDEX orders_store_sold_at_idx
  ON public.orders (store_id, sold_at);
