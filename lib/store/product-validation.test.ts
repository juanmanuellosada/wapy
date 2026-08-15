// Ejecutar con: npx vitest run lib/store/product-validation.test.ts

import { describe, it, expect } from 'vitest';
import { validateProductFields, isValidProductFields, checkBatchFits } from './product-validation';

describe('validateProductFields', () => {
  it('producto válido no reporta problemas', () => {
    expect(
      isValidProductFields({ name: 'Remera negra', price_cents: 10000, stock: 5, promo_price_cents: null })
    ).toBe(true);
  });

  it('nombre vacío es inválido', () => {
    const issues = validateProductFields({ name: '  ', price_cents: 1000 });
    expect(issues).toContainEqual({ field: 'name', message: 'El nombre es requerido.' });
  });

  it('nombre de más de 120 caracteres es inválido', () => {
    const issues = validateProductFields({ name: 'a'.repeat(121), price_cents: 1000 });
    expect(issues.some((i) => i.field === 'name')).toBe(true);
  });

  it('descripción de más de 500 caracteres es inválida', () => {
    const issues = validateProductFields({ name: 'Ok', description: 'a'.repeat(501), price_cents: 1000 });
    expect(issues.some((i) => i.field === 'description')).toBe(true);
  });

  it('stock negativo es inválido', () => {
    const issues = validateProductFields({ name: 'Ok', price_cents: 1000, stock: -1 });
    expect(issues.some((i) => i.field === 'stock')).toBe(true);
  });

  it('stock nulo (vacío) es válido — significa ilimitado', () => {
    expect(isValidProductFields({ name: 'Ok', price_cents: 1000, stock: null })).toBe(true);
  });

  it('promo mayor o igual al precio regular es inválida', () => {
    const issues = validateProductFields({ name: 'Ok', price_cents: 1000, promo_price_cents: 1000 });
    expect(issues.some((i) => i.field === 'promo_price_cents')).toBe(true);
  });

  it('promo negativa es inválida', () => {
    const issues = validateProductFields({ name: 'Ok', price_cents: 1000, promo_price_cents: -1 });
    expect(issues.some((i) => i.field === 'promo_price_cents')).toBe(true);
  });

  it('promo menor al precio regular es válida', () => {
    expect(isValidProductFields({ name: 'Ok', price_cents: 1000, promo_price_cents: 500 })).toBe(true);
  });
});

describe('checkBatchFits', () => {
  it('el lote entra si count + batchSize <= maxProducts', () => {
    expect(checkBatchFits(38, 12, 50)).toEqual({ ok: true });
  });

  it('rechaza el lote entero e informa cuántos lugares quedan', () => {
    const result = checkBatchFits(45, 12, 50);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('5');
  });

  it('un plan ilimitado (Infinity) siempre entra', () => {
    expect(checkBatchFits(1000, 60, Infinity)).toEqual({ ok: true });
  });
});
