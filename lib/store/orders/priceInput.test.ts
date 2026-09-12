// Ejecutar con: npx vitest run lib/store/orders/priceInput.test.ts

import { describe, it, expect } from 'vitest';
import { parsePriceDisplay } from './priceInput';

describe('parsePriceDisplay', () => {
  it('formato es-AR con coma decimal y punto de miles', () => {
    expect(parsePriceDisplay('1500,50')).toBe(150_050);
  });

  it('punto decimal (costumbre de otros sistemas / teclado numérico)', () => {
    expect(parsePriceDisplay('1500.50')).toBe(150_050);
  });

  it('punto como separador de miles, sin decimales', () => {
    expect(parsePriceDisplay('1.500')).toBe(150_000);
  });

  it('punto de miles + coma decimal combinados', () => {
    expect(parsePriceDisplay('1.500,50')).toBe(150_050);
  });

  it('varios puntos de miles y símbolo de moneda', () => {
    expect(parsePriceDisplay('$ 1.234.567')).toBe(123_456_700);
  });

  it('entero sin separadores', () => {
    expect(parsePriceDisplay('1500')).toBe(150_000);
  });

  it('campo vacío da cero', () => {
    expect(parsePriceDisplay('')).toBe(0);
  });

  it('un solo decimal después del punto también se toma como decimal', () => {
    expect(parsePriceDisplay('1500.5')).toBe(150_050);
  });

  it('tres cifras después del único punto se toman como separador de miles, no decimal', () => {
    expect(parsePriceDisplay('12.345')).toBe(1_234_500);
  });

  it('negativo o inválido da cero', () => {
    expect(parsePriceDisplay('abc')).toBe(0);
  });
});
