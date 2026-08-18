// NOTE: No hay test runner configurado en package.json (ver otros *.test.ts del
// repo). Ejecutar con: npx vitest run lib/store/pricing.test.ts

import { describe, it, expect } from 'vitest';
import {
  resolveEffectivePrice,
  resolveTieredPrice,
  pickTier,
  tierSavingsPercent,
  type PriceableProduct,
  type PriceableVariant,
  type PriceTier,
} from './pricing';

function product(overrides: Partial<PriceableProduct> = {}): PriceableProduct {
  return { price_cents: 10000, promo_price_cents: null, ...overrides };
}

function variant(overrides: Partial<PriceableVariant> = {}): PriceableVariant {
  return { price_override: null, promo_price_override: null, ...overrides };
}

describe('resolveEffectivePrice', () => {
  it('producto sin promo: efectivo = regular', () => {
    const result = resolveEffectivePrice(product());
    expect(result).toEqual({ regularCents: 10000, effectiveCents: 10000, onPromo: false });
  });

  it('producto en promo (promo < regular): efectivo = promo', () => {
    const result = resolveEffectivePrice(product({ promo_price_cents: 8000 }));
    expect(result).toEqual({ regularCents: 10000, effectiveCents: 8000, onPromo: true });
  });

  it('promo de producto no menor al regular: no aplica, cae al regular', () => {
    const result = resolveEffectivePrice(product({ promo_price_cents: 10000 }));
    expect(result).toEqual({ regularCents: 10000, effectiveCents: 10000, onPromo: false });

    const result2 = resolveEffectivePrice(product({ promo_price_cents: 12000 }));
    expect(result2).toEqual({ regularCents: 10000, effectiveCents: 10000, onPromo: false });
  });

  it('variante sin price_override hereda el regular del producto', () => {
    const result = resolveEffectivePrice(product(), variant());
    expect(result).toEqual({ regularCents: 10000, effectiveCents: 10000, onPromo: false });
  });

  it('variante con promo propio (promo < regular de la variante): efectivo = promo de variante', () => {
    const result = resolveEffectivePrice(
      product({ promo_price_cents: 8000 }),
      variant({ price_override: 15000, promo_price_override: 12000 })
    );
    expect(result).toEqual({ regularCents: 15000, effectiveCents: 12000, onPromo: true });
  });

  it('el promo de variante NO hereda del promo de producto', () => {
    // El producto tiene promo, pero la variante no tiene promo propio → sin promo.
    const result = resolveEffectivePrice(
      product({ promo_price_cents: 8000 }),
      variant({ price_override: 15000, promo_price_override: null })
    );
    expect(result).toEqual({ regularCents: 15000, effectiveCents: 15000, onPromo: false });
  });

  it('promo de variante no menor a su regular: no aplica', () => {
    const result = resolveEffectivePrice(
      product(),
      variant({ price_override: 5000, promo_price_override: 5000 })
    );
    expect(result).toEqual({ regularCents: 5000, effectiveCents: 5000, onPromo: false });
  });
});

// ---------------------------------------------------------------------------
// Tramos de precio por cantidad
// ---------------------------------------------------------------------------

/** $100 el producto base; tramos: 3 u → $93,33 c/u, 6 u → $88 c/u. */
const TIERS: PriceTier[] = [
  { min_quantity: 3, unit_price_cents: 9333 },
  { min_quantity: 6, unit_price_cents: 8800 },
];

describe('pickTier', () => {
  it('sin tramos devuelve null', () => {
    expect(pickTier([], 10)).toBeNull();
    expect(pickTier(null, 10)).toBeNull();
  });

  it('por debajo del primer tramo devuelve null', () => {
    expect(pickTier(TIERS, 2)).toBeNull();
  });

  it('elige el tramo de mayor cantidad que se alcanza', () => {
    expect(pickTier(TIERS, 3)?.min_quantity).toBe(3);
    expect(pickTier(TIERS, 5)?.min_quantity).toBe(3);
    expect(pickTier(TIERS, 6)?.min_quantity).toBe(6);
    expect(pickTier(TIERS, 99)?.min_quantity).toBe(6);
  });

  it('no depende del orden del array', () => {
    const shuffled = [TIERS[1], TIERS[0]];
    expect(pickTier(shuffled, 7)?.min_quantity).toBe(6);
  });
});

describe('resolveTieredPrice', () => {
  it('sin tramos se comporta como resolveEffectivePrice', () => {
    const result = resolveTieredPrice(product(), null, 10, []);
    expect(result.unitCents).toBe(10000);
    expect(result.onTier).toBe(false);
    expect(result.tier).toBeNull();
  });

  it('cantidad por debajo del primer tramo: precio regular', () => {
    const result = resolveTieredPrice(product(), null, 2, TIERS);
    expect(result.unitCents).toBe(10000);
    expect(result.onTier).toBe(false);
  });

  it('cantidad exacta del tramo: precio del tramo a todas las unidades', () => {
    const result = resolveTieredPrice(product(), null, 3, TIERS);
    expect(result.unitCents).toBe(9333);
    expect(result.onTier).toBe(true);
    expect(result.tier?.min_quantity).toBe(3);
  });

  it('cantidad entre dos tramos: aplica el tramo inferior', () => {
    expect(resolveTieredPrice(product(), null, 5, TIERS).unitCents).toBe(9333);
  });

  it('cantidad que alcanza el tramo superior', () => {
    expect(resolveTieredPrice(product(), null, 6, TIERS).unitCents).toBe(8800);
  });

  it('variante con price_override: el tramo se aplica como ratio proporcional', () => {
    // ratio = 9333/10000; variante de $120 → 12000 * 0.9333 = 11199,6 → 11200
    const result = resolveTieredPrice(product(), variant({ price_override: 12000 }), 3, TIERS);
    expect(result.regularCents).toBe(12000);
    expect(result.unitCents).toBe(11200);
    expect(result.onTier).toBe(true);
  });

  it('variante sin override: el ratio deja el precio del tramo intacto', () => {
    const result = resolveTieredPrice(product(), variant(), 3, TIERS);
    expect(result.unitCents).toBe(9333);
  });

  it('gana el más barato: la promo le gana al tramo', () => {
    const result = resolveTieredPrice(product({ promo_price_cents: 8500 }), null, 3, TIERS);
    expect(result.unitCents).toBe(8500);
    expect(result.onPromo).toBe(true);
    expect(result.onTier).toBe(false);
    expect(result.tier?.min_quantity).toBe(3); // el tramo se alcanzó, pero no ganó
  });

  it('gana el más barato: el tramo le gana a la promo', () => {
    const result = resolveTieredPrice(product({ promo_price_cents: 9500 }), null, 6, TIERS);
    expect(result.unitCents).toBe(8800);
    expect(result.onTier).toBe(true);
  });

  it('price_cents 0 en una variante no rompe el ratio', () => {
    const result = resolveTieredPrice(
      product({ price_cents: 0 }),
      variant({ price_override: 5000 }),
      3,
      [{ min_quantity: 3, unit_price_cents: 4000 }]
    );
    expect(result.unitCents).toBe(4000);
  });
});

describe('tierSavingsPercent', () => {
  it('calcula el ahorro redondeado', () => {
    expect(tierSavingsPercent(9333, 10000)).toBe(7);
    expect(tierSavingsPercent(8800, 10000)).toBe(12);
  });

  it('devuelve 0 cuando el tramo no abarata o la base es inválida', () => {
    expect(tierSavingsPercent(10000, 10000)).toBe(0);
    expect(tierSavingsPercent(5000, 0)).toBe(0);
  });
});
