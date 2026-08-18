// NOTE: No hay test runner configurado en package.json (ver otros *.test.ts del
// repo). Ejecutar con: npx vitest run lib/store/pricing.test.ts

import { describe, it, expect } from 'vitest';
import {
  resolveEffectivePrice,
  resolveTieredPrice,
  pickTier,
  tierSavingsPercent,
  tierGroupKey,
  buildTierGroupSizes,
  nextTier,
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

// ---------------------------------------------------------------------------
// Grupos de tramos combinables
// ---------------------------------------------------------------------------

describe('tierGroupKey', () => {
  it('sin tramos devuelve cadena vacía (no pertenece a ningún grupo)', () => {
    expect(tierGroupKey([])).toBe('');
    expect(tierGroupKey(null)).toBe('');
    expect(tierGroupKey(undefined)).toBe('');
  });

  it('la misma escalera da la misma clave sin importar el orden', () => {
    expect(tierGroupKey(TIERS)).toBe(tierGroupKey([TIERS[1], TIERS[0]]));
  });

  it('un centavo de diferencia parte el grupo', () => {
    const other: PriceTier[] = [
      { min_quantity: 3, unit_price_cents: 9334 },
      { min_quantity: 6, unit_price_cents: 8800 },
    ];
    expect(tierGroupKey(other)).not.toBe(tierGroupKey(TIERS));
  });

  it('una cantidad mínima distinta parte el grupo', () => {
    const other: PriceTier[] = [
      { min_quantity: 4, unit_price_cents: 9333 },
      { min_quantity: 6, unit_price_cents: 8800 },
    ];
    expect(tierGroupKey(other)).not.toBe(tierGroupKey(TIERS));
  });
});

describe('buildTierGroupSizes', () => {
  const OTHER: PriceTier[] = [{ min_quantity: 3, unit_price_cents: 2100000 }];

  it('cuenta cuántos productos comparten cada escalera', () => {
    const sizes = buildTierGroupSizes([
      { id: 'choco', tiers: TIERS },
      { id: 'dulce', tiers: TIERS },
      { id: 'coco', tiers: TIERS },
      { id: 'remera-negra', tiers: OTHER },
      { id: 'remera-blanca', tiers: OTHER },
    ]);
    expect(sizes.get('choco')).toBe(3);
    expect(sizes.get('dulce')).toBe(3);
    expect(sizes.get('coco')).toBe(3);
    expect(sizes.get('remera-negra')).toBe(2);
  });

  it('un producto solo en su grupo cuenta 1 (no se anuncia como combinable)', () => {
    const sizes = buildTierGroupSizes([
      { id: 'unico', tiers: TIERS },
      { id: 'otro', tiers: OTHER },
    ]);
    expect(sizes.get('unico')).toBe(1);
  });

  it('los productos sin tramos no entran en ningún grupo', () => {
    const sizes = buildTierGroupSizes([
      { id: 'sin-tramos', tiers: [] },
      { id: 'tambien-sin', tiers: null },
    ]);
    expect(sizes.has('sin-tramos')).toBe(false);
    expect(sizes.has('tambien-sin')).toBe(false);
  });
});

describe('nextTier', () => {
  it('devuelve el escalón inmediatamente superior', () => {
    expect(nextTier(TIERS, 0)?.min_quantity).toBe(3);
    expect(nextTier(TIERS, 2)?.min_quantity).toBe(3);
    expect(nextTier(TIERS, 3)?.min_quantity).toBe(6);
    expect(nextTier(TIERS, 5)?.min_quantity).toBe(6);
  });

  it('devuelve null cuando ya se alcanzó el tramo más alto', () => {
    expect(nextTier(TIERS, 6)).toBeNull();
    expect(nextTier(TIERS, 99)).toBeNull();
  });

  it('sin tramos devuelve null', () => {
    expect(nextTier([], 1)).toBeNull();
  });
});

describe('combinación de productos con la misma escalera', () => {
  // 3 sabores distintos, $100 cada uno, misma escalera: 1 de cada uno = 3 unidades.
  it('la cantidad agregada del grupo dispara el tramo en cada línea', () => {
    const aggregated = 1 + 1 + 1;
    for (const _sabor of ['choco', 'dulce', 'coco']) {
      const result = resolveTieredPrice(product(), null, aggregated, TIERS);
      expect(result.unitCents).toBe(9333);
      expect(result.onTier).toBe(true);
    }
  });

  it('sin combinar, 1 unidad de cada uno no alcanza ningún tramo', () => {
    const result = resolveTieredPrice(product(), null, 1, TIERS);
    expect(result.unitCents).toBe(10000);
    expect(result.onTier).toBe(false);
  });
});
