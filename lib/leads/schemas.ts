import { z } from 'zod';

// ---------------------------------------------------------------------------
// WhatsApp normalization
// ---------------------------------------------------------------------------

/**
 * Tries to normalize an Argentine (or international) phone number to E.164.
 * Accepts formats like:
 *   "11 1234 5678"          → "+5491112345678"
 *   "9 11 1234 5678"        → "+5491112345678"
 *   "+54 9 11 1234 5678"    → "+5491112345678"
 *   "1112345678"            → "+5491112345678"
 * Returns null if the stripped digits don't look like a valid number.
 */
export function normalizeWhatsapp(input: string): string | null {
  // Strip everything that is not a digit or leading +
  const stripped = input.replace(/[^\d+]/g, '');
  const digits = stripped.replace(/^\+/, '');

  // Already E.164 with country code: +54...
  if (stripped.startsWith('+')) {
    // Must be at least 10 digits after +
    if (digits.length >= 10 && digits.length <= 15) {
      return `+${digits}`;
    }
    return null;
  }

  // Argentina: mobile numbers have 10 digits (area + number)
  // Some inputs include the "9" mobile prefix after 54
  if (digits.startsWith('54')) {
    const rest = digits.slice(2);
    // With mobile 9: 54 + 9 + 10 digits = 13
    if (rest.startsWith('9') && rest.length === 11) {
      return `+54${rest}`;
    }
    // Without mobile 9: 54 + 10 digits = 12
    if (rest.length === 10) {
      return `+549${rest}`;
    }
    return null;
  }

  // Local 10-digit number (area code + number, no country prefix)
  if (digits.length === 10) {
    return `+549${digits}`;
  }

  // With leading mobile 9: 9 + 10 digits = 11
  if (digits.startsWith('9') && digits.length === 11) {
    return `+54${digits}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

export const leadFormSchema = z.object({
  email: z
    .string()
    .min(1, 'El email es requerido')
    .email('El email no es válido'),
  name: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(80, 'El nombre no puede superar 80 caracteres')
    .trim(),
  whatsapp: z
    .string()
    .min(1, 'El WhatsApp es requerido')
    .refine(
      (val) => normalizeWhatsapp(val) !== null,
      'Número de WhatsApp inválido. Ej: +54 9 11 1234 5678'
    ),
  plan: z.enum(['inicial', 'medio', 'pro'], { error: 'Plan inválido' }),
});

export type LeadFormInput = z.infer<typeof leadFormSchema>;
