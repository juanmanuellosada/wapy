-- 043_order_action_log.sql
-- Registro de las acciones del dueño sobre pedidos (confirmar, cancelar,
-- entregar, borrar — individuales o en lote), para poder deshacerlas dentro
-- de una ventana acotada. Ver openspec/changes/add-order-action-undo/design.md.
--
-- Una fila por OPERACIÓN (un clic del dueño), no por pedido (Decisión D1): un
-- lote de 50 pedidos es una fila con 50 entradas en `entries`, no 50 filas.
-- Las entradas viven como JSON en vez de en una tabla hija porque nada
-- necesita consultarlas por order_id (D2 compara contra el estado actual del
-- pedido, no contra el log).
--
-- No toca `orders` ni ninguna tabla existente: no hay riesgo sobre datos
-- actuales, y el rollback es un simple DROP TABLE.

CREATE TABLE public.order_action_log (
  id                  uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  store_id            uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  action_type         text NOT NULL CHECK (action_type IN ('confirm','deliver','cancel','delete')),
  performed_at        timestamptz NOT NULL DEFAULT now(),
  performed_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  undone_at           timestamptz,
  -- Cada elemento: { order_id, status_before, status_after, cancelled_by_before,
  -- cancelled_by_after, deleted_at_before, deleted_at_after, stock_restored,
  -- coupon_reverted } — hechos observados al aplicar la acción (Decisión D3),
  -- nunca inferidos al momento de deshacer.
  entries             jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- No nulo únicamente cuando la operación superó el tope de entradas
  -- (tarea 2.6): la fila queda registrada como no deshacible con su motivo,
  -- en vez de guardar una fila gigante con miles de entradas.
  non_undoable_reason text
);

-- Sirve la consulta de la ventana de deshacer (Decisión D6): por tienda, no
-- deshechas, ordenadas por momento descendente.
CREATE INDEX order_action_log_store_pending_idx
  ON public.order_action_log (store_id, performed_at DESC)
  WHERE undone_at IS NULL;

ALTER TABLE public.order_action_log ENABLE ROW LEVEL SECURITY;

-- Patrón de tabla hija de stores (019_orders.sql:47): la dueña ve solo las
-- operaciones de su propia tienda. Sin policy de INSERT/UPDATE/DELETE para
-- `authenticated`: el registro y el deshacer los escribe siempre el admin
-- client desde las server actions, igual que orders (cuyo INSERT también
-- está bloqueado para clientes autenticados; service_role bypasses RLS).
CREATE POLICY "order_action_log_owner_select"
  ON public.order_action_log FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT owner_id FROM public.stores WHERE id = order_action_log.store_id
    )
  );

-- Superadmin: acceso total, mismo patrón que 035_product_price_tiers.sql.
CREATE POLICY "order_action_log_superadmin_all"
  ON public.order_action_log FOR ALL
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

-- Rollback: DROP TABLE public.order_action_log;
-- Se pierde la posibilidad de deshacer, no se pierde ningún pedido.
