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

// ---------------------------------------------------------------------------
// Tramos de precio por cantidad ("llevando 3, te sale más barato por unidad")
//
// Reglas (ver openspec/changes/add-quantity-price-tiers/design.md):
//  1. Se elige el tramo de mayor min_quantity que sea <= cantidad. Su precio
//     unitario aplica a TODAS las unidades de la línea, no solo al excedente.
//  2. La cantidad se agrega POR PRODUCTO: en un producto con variantes, 2 M + 1 L
//     son 3 unidades y activan el tramo de 3 (mismo criterio que min_quantity).
//  3. El tramo se configura contra products.price_cents. Para una variante con
//     price_override se aplica como ratio proporcional, así una XL más cara sigue
//     costando más que una S.
//  4. Gana el más barato: se cobra min(precio efectivo actual, precio del tramo).
//     Nunca se puede configurar algo que haga que llevar más salga más caro.
// ---------------------------------------------------------------------------

export interface PriceTier {
  min_quantity: number;
  unit_price_cents: number;
}

export interface TieredPrice extends EffectivePrice {
  /** Precio unitario final de la línea, ya con tramo y promo resueltos. */
  unitCents: number;
  /** true solo si el tramo ganó, es decir si abarató respecto del precio efectivo. */
  onTier: boolean;
  /** El tramo alcanzado por la cantidad (aunque no haya ganado), o null. */
  tier: PriceTier | null;
}

/** Ordena los tramos por cantidad mínima ascendente (copia, no muta). */
export function sortTiers(tiers: readonly PriceTier[]): PriceTier[] {
  return [...tiers].sort((a, b) => a.min_quantity - b.min_quantity);
}

/** Devuelve el tramo de mayor min_quantity que la cantidad alcanza, o null. */
export function pickTier(tiers: readonly PriceTier[] | null | undefined, quantity: number): PriceTier | null {
  if (!tiers || tiers.length === 0) return null;
  let best: PriceTier | null = null;
  for (const t of tiers) {
    if (quantity >= t.min_quantity && (best === null || t.min_quantity > best.min_quantity)) {
      best = t;
    }
  }
  return best;
}

/**
 * Precio unitario de una línea de carrito/orden, resolviendo promo y tramo.
 *
 * @param aggregatedQty cantidad TOTAL de ese producto en el carrito, sumando
 *   todas sus variantes — no la cantidad de esta línea sola.
 */
export function resolveTieredPrice(
  product: PriceableProduct,
  variant: PriceableVariant | null | undefined,
  aggregatedQty: number,
  tiers: readonly PriceTier[] | null | undefined
): TieredPrice {
  const base = resolveEffectivePrice(product, variant);
  const tier = pickTier(tiers, aggregatedQty);

  if (!tier) {
    return { ...base, unitCents: base.effectiveCents, onTier: false, tier: null };
  }

  // Para una variante el tramo se traduce a ratio sobre su precio regular; para
  // un producto simple el ratio es la identidad y el precio se respeta al centavo.
  const tierUnitForLine =
    variant && product.price_cents > 0
      ? Math.round(base.regularCents * (tier.unit_price_cents / product.price_cents))
      : tier.unit_price_cents;

  const unitCents = Math.min(base.effectiveCents, tierUnitForLine);
  return { ...base, unitCents, onTier: unitCents < base.effectiveCents, tier };
}

/** Porcentaje de ahorro de un tramo respecto de un precio base, redondeado. */
export function tierSavingsPercent(tierUnitCents: number, baseCents: number): number {
  if (baseCents <= 0 || tierUnitCents >= baseCents) return 0;
  return Math.round(((baseCents - tierUnitCents) / baseCents) * 100);
}

/**
 * Precio unitario que tendría una línea si alcanzara exactamente `tier`.
 * Usado por el storefront para listar los tramos de un producto respetando la
 * variante activa (el tramo se traduce a ratio) y la promo vigente.
 */
export function tierUnitCentsFor(
  product: PriceableProduct,
  variant: PriceableVariant | null | undefined,
  tier: PriceTier
): number {
  return resolveTieredPrice(product, variant, tier.min_quantity, [tier]).unitCents;
}

// ---------------------------------------------------------------------------
// Grupos de tramos combinables
//
// Dos productos con la MISMA escalera (mismas cantidades y mismos precios
// unitarios) forman un grupo: las cantidades del carrito se suman entre ellos
// para decidir qué tramo aplica. Así "llevá 3 alfajores" se cumple con 1 de
// cada sabor y no solo con 3 del mismo.
//
// El grupo es implícito, derivado de los tramos: no hay tabla ni columna nueva.
// El corolario es que cambiar un tramo de un producto lo saca del grupo.
// ---------------------------------------------------------------------------

/**
 * Clave de agrupación de una escalera. Los productos que la comparten combinan
 * cantidades. Un producto sin tramos devuelve '' y no pertenece a ningún grupo.
 */
export function tierGroupKey(tiers: readonly PriceTier[] | null | undefined): string {
  if (!tiers || tiers.length === 0) return '';
  return sortTiers(tiers)
    .map((t) => `${t.min_quantity}:${t.unit_price_cents}`)
    .join('|');
}

/**
 * Cuántos productos comparten la escalera de cada uno. Sirve para decidir si
 * anunciar "combinable con otros productos": con 1 solo el aviso sería mentira.
 */
export function buildTierGroupSizes(
  entries: ReadonlyArray<{ id: string; tiers: readonly PriceTier[] | null | undefined }>
): Map<string, number> {
  const countByKey = new Map<string, number>();
  for (const entry of entries) {
    const key = tierGroupKey(entry.tiers);
    if (!key) continue;
    countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
  }

  const sizeByProduct = new Map<string, number>();
  for (const entry of entries) {
    const key = tierGroupKey(entry.tiers);
    if (!key) continue;
    sizeByProduct.set(entry.id, countByKey.get(key) ?? 1);
  }
  return sizeByProduct;
}

/** Tramo inmediatamente superior al que la cantidad ya alcanzó, o null si no hay. */
export function nextTier(
  tiers: readonly PriceTier[] | null | undefined,
  quantity: number
): PriceTier | null {
  if (!tiers || tiers.length === 0) return null;
  let best: PriceTier | null = null;
  for (const t of tiers) {
    if (t.min_quantity > quantity && (best === null || t.min_quantity < best.min_quantity)) {
      best = t;
    }
  }
  return best;
}
