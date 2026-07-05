// NOTE: No hay test runner configurado en package.json (ver otros *.test.ts del
// repo). Ejecutar con: npx vitest run lib/store/pricing.test.ts

import { describe, it, expect } from 'vitest';
import { resolveEffectivePrice, type PriceableProduct, type PriceableVariant } from './pricing';

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
