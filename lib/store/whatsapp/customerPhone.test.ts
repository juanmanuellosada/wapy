import { describe, it, expect } from 'vitest';
import { customerPhoneSchema, normalizeCustomerPhone } from './customerPhone';

describe('normalizeCustomerPhone', () => {
  it('antepone +549 a un número local sin "+"', () => {
    expect(normalizeCustomerPhone('11 1234-5678')).toBe('+5491112345678');
  });

  it('respeta un número que ya viene con "+"', () => {
    expect(normalizeCustomerPhone('+56912345678')).toBe('+56912345678');
  });

  it('quita espacios, guiones y paréntesis', () => {
    expect(normalizeCustomerPhone('(011) 1234-5678')).toBe('+54901112345678');
  });
});

describe('customerPhoneSchema', () => {
  it('rechaza un string vacío', () => {
    expect(customerPhoneSchema.safeParse('').success).toBe(false);
  });

  it('rechaza un número demasiado corto', () => {
    expect(customerPhoneSchema.safeParse('123').success).toBe(false);
  });

  it('acepta un número argentino típico (10 dígitos)', () => {
    const result = customerPhoneSchema.safeParse('11 1234 5678');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('+5491112345678');
  });

  it('acepta un número internacional ya en E.164', () => {
    const result = customerPhoneSchema.safeParse('+5491112345678');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('+5491112345678');
  });

  it('rechaza texto no numérico', () => {
    expect(customerPhoneSchema.safeParse('no tengo whatsapp').success).toBe(false);
  });
});
