-- 036_whatsapp_order_lifecycle.sql
-- Da a los pedidos de WhatsApp un ciclo de vida definido: numeración
-- correlativa por tienda, reversión confiable del uso de cupón, política de
-- expiración configurable por tienda, y trazabilidad de quién canceló un
-- pedido. Ver openspec/changes/fix-whatsapp-order-lifecycle/design.md.
--
-- ─── stores.order_seq (Decisión 2) ─────────────────────────────────────────
-- Contador atómico por tienda. Se incrementa con
-- `UPDATE stores SET order_seq = order_seq + 1 RETURNING order_seq` dentro de
-- la creación del pedido — una sola sentencia, sin carrera. No se usa
-- `SELECT max()+1` (carrera) ni una sequence por tienda (no se crean
-- dinámicamente).
--
-- ─── orders.store_order_number (Decisión 2) ────────────────────────────────
-- Número de negocio visible del pedido, estable para siempre. Nullable
-- porque el propio backfill de esta migración lo asigna en un segundo paso;
-- por eso el índice único es PARCIAL (`WHERE store_order_number IS NOT
-- NULL`), no total. Pedidos cancelados o abandonados consumen número: la
-- secuencia queda con huecos a propósito (ver Trade-off aceptado, Decisión 2).
--
-- ─── orders.coupon_counted (Decisión 3) ────────────────────────────────────
-- Hoy `revertCouponUse` decide si devolver el uso del cupón mirando
-- `status = 'confirmed'`, pero *cuándo* se cuenta el uso depende del canal
-- (WhatsApp lo cuenta al crear el pedido, Mercado Pago recién al aprobar el
-- pago). Los dos criterios no coinciden, y por eso cancelar un pedido de
-- WhatsApp pendiente quema el cupón para siempre. Esta bandera reemplaza esa
-- inferencia: se prende cuando efectivamente se incrementa `uses_count` y se
-- apaga al revertir, sin importar el canal ni el status actual.
--
-- ─── stores.wa_pending_ttl_days / wa_auto_confirm (Decisión 4) ─────────────
-- Ventana de expiración de pedidos `whatsapp` pendientes, y qué hacer al
-- vencer. `wa_auto_confirm` nace apagado: confirmar sin evidencia de pago
-- contamina el historial de ingresos, así que lo default es cancelar
-- (reponiendo stock y cupón) y no inventar ventas.
--
-- ─── stores.wa_lifecycle_effective_from (Decisión 5) ───────────────────────
-- Traza la línea desde la que la política nueva rige. El cron solo evalúa
-- pedidos con `created_at >= wa_lifecycle_effective_from`. El backlog de
-- pendientes anterior al release mezcla ventas reales sin confirmar con
-- carritos abandonados sin forma de distinguirlos automáticamente: decide la
-- dueña, no el sistema. Para tiendas existentes se backfillea a `now()` en
-- esta misma migración para que el historial no quede sujeto a la política
-- nueva; las tiendas creadas después ya nacen con esa fecha por el DEFAULT.
--
-- ─── orders.cancelled_by (Decisión 9) ───────────────────────────────────────
-- Distingue una cancelación decidida por la dueña (`owner`, terminal) de una
-- aplicada por el cron al vencer la ventana (`system`, reversible a
-- `confirmed`). Con una ventana de 7 días, la bolsa de pendientes del día del
-- release contiene ventas reales; cancelarlas sin poder revertir sería
-- pérdida de datos garantizada. Backfill: toda cancelación existente se
-- marca `owner`, porque hoy no existe ningún proceso automático que cancele
-- pedidos de WhatsApp.
--
-- Reversibilidad: todas las columnas son aditivas y no rompen el código
-- anterior (rollback = DROP columns/index). Lo único no trivialmente
-- reversible es el backfill de `store_order_number`, que de todos modos es
-- información derivada de `created_at` y se puede recalcular.

-- ─── stores: columnas nuevas ────────────────────────────────────────────────

ALTER TABLE public.stores
  ADD COLUMN order_seq                   integer     NOT NULL DEFAULT 0,
  ADD COLUMN wa_pending_ttl_days         integer     NOT NULL DEFAULT 7,
  ADD COLUMN wa_auto_confirm             boolean     NOT NULL DEFAULT FALSE,
  ADD COLUMN wa_lifecycle_effective_from timestamptz NOT NULL DEFAULT now();


-- ─── orders: columnas nuevas ────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN store_order_number integer,
  ADD COLUMN coupon_counted     boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN cancelled_by       text CHECK (cancelled_by IN ('owner', 'system'));

-- Índice único PARCIAL: durante el propio backfill de abajo hay filas con
-- store_order_number todavía NULL, así que un índice único total rechazaría
-- la migración.
CREATE UNIQUE INDEX orders_store_id_store_order_number_unique_idx
  ON public.orders (store_id, store_order_number)
  WHERE store_order_number IS NOT NULL;


-- ─── Backfill: store_order_number por created_at dentro de cada tienda ─────
-- Se ordena por (created_at, id) y no solo por created_at porque created_at
-- puede empatar entre pedidos; id (uuid) desempata de forma determinística.

WITH numbered AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY store_id ORDER BY created_at, id) AS rn
  FROM public.orders
)
UPDATE public.orders o
SET store_order_number = numbered.rn
FROM numbered
WHERE o.id = numbered.id;


-- ─── Backfill: stores.order_seq con el máximo store_order_number ───────────
-- Tiendas sin pedidos quedan en 0 (el DEFAULT ya cubre ese caso).

UPDATE public.stores s
SET order_seq = counted.max_number
FROM (
  SELECT store_id, max(store_order_number) AS max_number
  FROM public.orders
  GROUP BY store_id
) counted
WHERE s.id = counted.store_id;


-- ─── Backfill: coupon_counted (Decisión 3) ──────────────────────────────────
-- El criterio difiere por canal porque hoy WhatsApp cuenta el uso del cupón
-- AL CREAR el pedido, y Mercado Pago recién AL APROBAR el pago:
--   - whatsapp:    todo pedido con coupon_code ya incrementó uses_count,
--                  sin importar su status actual.
--   - mercadopago: solo si además está confirmed o delivered, que es la
--                  única señal disponible de que el pago se aprobó.

UPDATE public.orders
SET coupon_counted = TRUE
WHERE coupon_code IS NOT NULL
  AND (
    channel = 'whatsapp'
    OR (channel = 'mercadopago' AND status IN ('confirmed', 'delivered'))
  );


-- ─── Backfill: cancelled_by en cancelaciones existentes (Decisión 9) ────────
-- No existe hoy ningún proceso automático que cancele pedidos de WhatsApp
-- (expire-orders solo alcanza a mercadopago), así que toda cancelación
-- previa a este change fue decidida por la dueña.

UPDATE public.orders
SET cancelled_by = 'owner'
WHERE status = 'cancelled';

-- wa_lifecycle_effective_from ya quedó en now() para las tiendas existentes
-- por el DEFAULT del ALTER TABLE de arriba (se evalúa una sola vez, al
-- correr la migración, igual para todas las filas existentes). Las tiendas
-- nuevas heredan el mismo DEFAULT desde su creación.
