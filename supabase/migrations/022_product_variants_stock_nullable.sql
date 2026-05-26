-- Fix post-prod: product_variants.stock nullable
-- null = sin tracking (stock infinito), alineado con products.stock = null
-- Las filas existentes con stock=0 quedan como están; el dueño puede dejarlas vacías para volverlas "infinitas"
ALTER TABLE public.product_variants ALTER COLUMN stock DROP NOT NULL;
ALTER TABLE public.product_variants ALTER COLUMN stock DROP DEFAULT;
