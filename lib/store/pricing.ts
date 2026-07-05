// Pure pricing helper — the single source of truth for the "effective price"
// of a product/variant item. Shared by the server-side charge/snapshot
// (createPendingOrder) and the storefront display (useVariantSelection) so the
// price shown to the buyer and the price actually charged can never diverge.
//
// Rule (see openspec/changes/add-product-promo-price/design.md, Decisión 1):
// - regularCents = variant?.price_override ?? product.price_cents
// - promoCandidate = variant ? variant.promo_price_override : product.promo_price_cents
// - onPromo = promoCandidate != null && promoCandidate < regularCents
// - effectiveCents = onPromo ? promoCandidate : regularCents
//
// A variant's promo does NOT inherit from the product's promo — when a variant
// is passed, only its own promo_price_override is considered.

export interface PriceableProduct {
  price_cents: number;
  promo_price_cents: number | null;
}

export interface PriceableVariant {
  price_override: number | null;
  promo_price_override: number | null;
}

export interface EffectivePrice {
  regularCents: number;
  effectiveCents: number;
  onPromo: boolean;
}

export function resolveEffectivePrice(
  product: PriceableProduct,
  variant?: PriceableVariant | null
): EffectivePrice {
  const regularCents = variant ? variant.price_override ?? product.price_cents : product.price_cents;
  const promoCandidate = variant ? variant.promo_price_override : product.promo_price_cents;
  const onPromo = promoCandidate != null && promoCandidate < regularCents;
  const effectiveCents = onPromo ? promoCandidate : regularCents;
  return { regularCents, effectiveCents, onPromo };
}
