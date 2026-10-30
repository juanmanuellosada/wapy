-- 045_store_under_construction.sql
-- Cartel "En construcción" para la tienda pública. Mientras está activo, los
-- visitantes ven la tienda desenfocada detrás de un aviso y no pueden navegar
-- ni comprar. El catálogo se sigue renderizando por debajo, así se nota que la
-- tienda tiene contenido. A diferencia de la pantalla de mantenimiento (bloqueo
-- por suscripción), lo controla la dueña desde Ajustes y es reversible al toque.
ALTER TABLE public.stores
  ADD COLUMN under_construction boolean NOT NULL DEFAULT false;
