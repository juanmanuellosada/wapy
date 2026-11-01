-- 047_store_top_sellers_position.sql
-- Posición del bloque "Lo más pedido" dentro de la lista de secciones de la
-- tienda pública. Guarda cuántas secciones de primer nivel se muestran ANTES
-- del bloque: 0 (default) lo deja arriba de todo, como hasta ahora. Si el valor
-- supera la cantidad de secciones visibles, el render lo recorta al final.
ALTER TABLE public.stores
  ADD COLUMN top_sellers_position int NOT NULL DEFAULT 0 CHECK (top_sellers_position >= 0);
