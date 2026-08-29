import { z } from 'zod';
import { TRIAL_DAYS } from '@/lib/subscription/constants';

export const addEmailSchema = z.object({
  email: z.string().email('Email inválido'),
  grant_role: z.enum(['owner', 'superadmin']),
  plan: z.enum(['inicial', 'medio', 'pro']).default('inicial'),
  trial_days: z.coerce
    .number({ message: 'Los días de prueba deben ser un número' })
    .int('Los días de prueba deben ser un número entero')
    .min(0, 'Los días de prueba no pueden ser negativos')
    .max(365, 'Los días de prueba no pueden superar 365')
    .default(TRIAL_DAYS),
});

// Output type (after Zod applies coercion/defaults) — what the action receives.
export type AddEmailInput = z.infer<typeof addEmailSchema>;
// Input type (before coercion/defaults) — what react-hook-form manages.
export type AddEmailFormInput = z.input<typeof addEmailSchema>;

export const adminDeleteStoreSchema = z.object({
  storeId: z.string().uuid('ID de tienda inválido'),
  confirmSlug: z.string().min(1, 'El slug es requerido'),
});

export type AdminDeleteStoreInput = z.infer<typeof adminDeleteStoreSchema>;
