-- Orden de productos configurable por sección.
--
-- El catálogo público se ordenaba siempre por products.position, así que la
-- única forma de reordenar una sección era arrastrar de a un producto. Con
-- altas de hasta 150 productos por ZIP eso es inviable en la práctica.

-- sections.sort_mode: NULL significa "heredar el default de la tienda", que NO
-- es lo mismo que 'manual'. Una sección en NULL sigue al default cuando la
-- dueña lo cambia; una sección en 'manual' se queda en manual pase lo que pase.
-- Sin esa distinción, cambiar el default no tendría forma de propagarse a las
-- secciones que nunca se configuraron (o sea, todas las existentes).
ALTER TABLE public.sections
  ADD COLUMN sort_mode text,
  ADD CONSTRAINT sections_sort_mode_valid CHECK (
    sort_mode IS NULL OR sort_mode IN (
      'manual', 'price_asc', 'price_desc', 'name_asc', 'newest', 'best_selling'
    )
  );

COMMENT ON COLUMN public.sections.sort_mode IS
  'Modo de orden de los productos de la sección. NULL = heredar stores.default_product_sort (distinto de ''manual'', que es una elección explícita).';

-- Default de tienda: se aplica solo a las secciones en modo heredado.
ALTER TABLE public.stores
  ADD COLUMN default_product_sort text NOT NULL DEFAULT 'manual',
  ADD CONSTRAINT stores_default_product_sort_valid CHECK (
    default_product_sort IN (
      'manual', 'price_asc', 'price_desc', 'name_asc', 'newest', 'best_selling'
    )
  );

COMMENT ON COLUMN public.stores.default_product_sort IS
  'Orden por defecto del catálogo. Aplica a las secciones con sort_mode NULL.';

-- Ortogonal al modo de orden: parte cada sección en disponibles / sin stock y
-- aplica el mismo comparador a cada mitad. Arranca en TRUE porque es lo que
-- hace cualquier catálogo serio y nadie lo va a ir a buscar a la configuración.
ALTER TABLE public.stores
  ADD COLUMN out_of_stock_last boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.stores.out_of_stock_last IS
  'Si es TRUE, los productos sin stock se muestran al final de cada sección, conservando el modo de orden dentro de cada bloque.';

-- Sin backfill: sections.sort_mode queda en NULL y stores.default_product_sort
-- en 'manual', o sea el comportamiento previo a esta migración.
