-- 042_cost_is_estimated.sql
-- Distingue, en cada línea de pedido, si su costo se congeló al momento de
-- la venta o se completó después con `backfillProductCost`. Ver
-- openspec/changes/add-cost-backfill-on-save/design.md, Decisión D3.
--
-- Sin esta columna, un costo real congelado al vender y uno reconstruido
-- después son indistinguibles: el dueño no puede saber si la ganancia que
-- ve es exacta o una estimación, y no hay forma de revertir solo lo
-- estimado si hiciera falta.
--
-- `NOT NULL DEFAULT false`: el default describe el camino normal, que es
-- congelar el costo vigente al crear el pedido (add-product-cost-tracking,
-- Decisión D1). Solo lo que se completa después queda en true.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS cost_is_estimated boolean NOT NULL DEFAULT false;

-- Backfill de la marca: el costo de mercadería se desplegó el 2026-09-11
-- (add-product-cost-tracking), así que ninguna línea de un pedido anterior a
-- esa fecha puede tener un costo real congelado al vender. Las que hoy
-- tienen `cost_at_purchase` son, por construcción, las que se completaron a
-- mano en la tienda que motivó este change (39 líneas en producción) —
-- quedan marcadas como estimadas sin depender de recordar sus ids.
UPDATE public.order_items oi
SET cost_is_estimated = true
FROM public.orders o
WHERE oi.order_id = o.id
  AND oi.cost_at_purchase IS NOT NULL
  AND o.created_at < '2026-09-11'::timestamptz;

-- Rollback: ALTER TABLE public.order_items DROP COLUMN cost_is_estimated;
-- Se pierde la distinción entre costo real y estimado; no se pierde ningún
-- costo ni pedido.
