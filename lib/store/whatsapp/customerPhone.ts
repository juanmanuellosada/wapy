// Validación/normalización del teléfono de la compradora en el checkout por
// WhatsApp. Mismo criterio que el número de WhatsApp de la tienda
// (lib/onboarding/schemas.ts whatsappSchema): si no viene con "+" se asume
// Argentina y se antepone +549, después se valida contra E.164.
import { z } from 'zod';

const E164_REGEX = /^\+[1-9]\d{6,14}$/;

export function normalizeCustomerPhone(raw: string): string {
  const clean = raw.trim().replace(/[\s\-()]/g, '');
  return clean.startsWith('+') ? clean : `+549${clean}`;
}

export const customerPhoneSchema = z
  .string()
  .min(1, 'Ingresá tu WhatsApp')
  .transform(normalizeCustomerPhone)
  .pipe(z.string().regex(E164_REGEX, 'Número de WhatsApp inválido'));
