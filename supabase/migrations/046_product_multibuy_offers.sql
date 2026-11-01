-- 046_product_multibuy_offers.sql
-- Ofertas NxM por producto ("llevás N, pagás M": 2x1, 3x2, 3x1...).
-- Ver openspec/changes/add-multibuy-offers/design.md.
--
-- products.multibuy_buy / multibuy_pay: ambas NULL = sin oferta. Es UNA oferta
-- por producto y aplica a todas sus variantes. Un producto sin oferta se
-- comporta exactamente como hoy: no hay backfill.
--
-- order_items.discount_cents / offer_label: snapshot del descuento NxM de la
-- línea. unit_price_cents sigue siendo un entero por unidad (MP lo exige), pero
-- un 3 pagando 2 no es representable como unitario entero, así que el descuento
-- se guarda aparte. Neto de la línea = unit_price_cents * quantity - discount_cents.
-- Las filas viejas quedan con discount_cents = 0 (sin cambio de comportamiento).

ALTER TABLE public.products
  ADD COLUMN multibuy_buy smallint NULL,
  ADD COLUMN multibuy_pay smallint NULL,
  ADD CONSTRAINT products_multibuy_check CHECK (
    (multibuy_buy IS NULL AND multibuy_pay IS NULL)
    OR (multibuy_buy >= 2 AND multibuy_pay >= 1 AND multibuy_pay < multibuy_buy)
  );

ALTER TABLE public.order_items
  ADD COLUMN discount_cents int NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  ADD COLUMN offer_label text NULL;
