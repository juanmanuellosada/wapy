// Ejecutar con: npx vitest run lib/admin/schemas.test.ts
//
// Cubre la capa de validación que usa `addWhitelistEntry` antes de tocar la
// base de datos. No invoca la server action en sí (requiere sesión de
// superadmin autenticada), pero es la misma validación Zod que la acción
// aplica sobre los datos del FormData.

import { describe, it, expect } from 'vitest';
import { addEmailSchema } from './schemas';
import { TRIAL_DAYS } from '@/lib/subscription/constants';

const base = { email: 'nuevo@ejemplo.com', grant_role: 'owner' as const };

describe('addEmailSchema', () => {
  it('alta sin tocar los defaults produce plan inicial y TRIAL_DAYS', () => {
    const result = addEmailSchema.parse(base);
    expect(result.plan).toBe('inicial');
    expect(result.trial_days).toBe(TRIAL_DAYS);
  });

  it('acepta 0 días de prueba', () => {
    const result = addEmailSchema.safeParse({ ...base, trial_days: '0' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.trial_days).toBe(0);
  });

  it('rechaza trial_days negativo', () => {
    const result = addEmailSchema.safeParse({ ...base, trial_days: '-1' });
    expect(result.success).toBe(false);
  });

  it('rechaza trial_days mayor a 365', () => {
    const result = addEmailSchema.safeParse({ ...base, trial_days: '400' });
    expect(result.success).toBe(false);
  });

  it('rechaza trial_days no numérico', () => {
    const result = addEmailSchema.safeParse({ ...base, trial_days: 'abc' });
    expect(result.success).toBe(false);
  });

  it('rechaza un plan inválido', () => {
    const result = addEmailSchema.safeParse({ ...base, plan: 'enterprise' });
    expect(result.success).toBe(false);
  });
});
