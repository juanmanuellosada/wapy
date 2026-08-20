// Link de WhatsApp a partir del teléfono guardado en el pedido.
import { customerPhoneSchema } from '@/lib/store/whatsapp/customerPhone';

/**
 * Arma el link `wa.me` para el teléfono de la compradora. El de WhatsApp
 * checkout ya viene normalizado a E.164, pero el de Mercado Pago es un campo
 * libre opcional que se guarda tal cual (lib/store/checkout/schemas.ts), así
 * que puede no traer código de país. Devuelve `null` cuando el teléfono no
 * se puede normalizar a un E.164 válido: un link roto abriría el chat de
 * otra persona, que es peor que no tener link.
 */
export function toWaMeLink(phone: string): string | null {
  const result = customerPhoneSchema.safeParse(phone);
  if (!result.success) return null;
  return `https://wa.me/${result.data.slice(1)}`;
}
