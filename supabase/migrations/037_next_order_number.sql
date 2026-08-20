-- 037_next_order_number.sql
-- RPC atómica para asignar el número correlativo de un pedido (Decisión 2 de
-- openspec/changes/fix-whatsapp-order-lifecycle/design.md).
--
-- supabase-js no puede expresar `SET order_seq = order_seq + 1` desde
-- `.update()` (siempre manda un valor literal, no una expresión SQL), así que
-- el incremento atómico necesita esta función. Se llama vía
-- `admin.rpc('next_order_number', { p_store_id })` desde createPendingOrder.
--
-- Una sola sentencia UPDATE...RETURNING: Postgres serializa vía row lock,
-- sin ventana entre leer y escribir. No se usa SELECT max()+1 (carrera) ni
-- una sequence por tienda (no se crean dinámicamente).
--
-- Solo el admin client (service_role) puede ejecutarla: si un owner pudiera
-- llamarla desde el cliente de sesión, quemaría números de la tienda sin
-- crear un pedido real.
--
-- Reversibilidad: aditiva. Rollback = DROP FUNCTION.

CREATE OR REPLACE FUNCTION public.next_order_number(p_store_id uuid)
RETURNS integer
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.stores
  SET order_seq = order_seq + 1
  WHERE id = p_store_id
  RETURNING order_seq;
$$;

REVOKE EXECUTE ON FUNCTION public.next_order_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_order_number(uuid) TO service_role;
