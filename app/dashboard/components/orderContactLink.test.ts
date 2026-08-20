import { describe, it, expect } from 'vitest';
import { toWaMeLink } from './orderContactLink';

describe('toWaMeLink', () => {
  it('arma el link para un teléfono ya en E.164 (checkout de WhatsApp)', () => {
    expect(toWaMeLink('+5491112345678')).toBe('https://wa.me/5491112345678');
  });

  it('normaliza un número argentino local sin código de país (checkout de Mercado Pago)', () => {
    expect(toWaMeLink('11 1234-5678')).toBe('https://wa.me/5491112345678');
  });

  it('devuelve null cuando el teléfono no se puede normalizar a un E.164 válido', () => {
    expect(toWaMeLink('no tengo whatsapp')).toBeNull();
  });

  it('devuelve null para un string vacío', () => {
    expect(toWaMeLink('')).toBeNull();
  });
});
