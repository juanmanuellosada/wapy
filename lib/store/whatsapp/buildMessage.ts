// Pure helper — no server-only dependency; safe to import from client components.

import { buildOrderDashboardUrl } from '@/lib/store/orders/links';

export function formatARS(amount: number): string {
  return amount.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export type WhatsAppPayment = {
  method: 'mercadopago';
  paymentId?: string | null;
  customerName?: string | null;
};

/**
 * Builds the WhatsApp message text for a store order.
 *
 * @param input.storeName  - Display name of the store.
 * @param input.lines      - Pre-formatted item lines (e.g. "• 2x Producto — $1.000").
 * @param input.couponCode - Coupon code applied, if any.
 * @param input.discountAmount - Discount in ARS, if any (only used when couponCode is also set).
 * @param input.total      - Effective order total in ARS (after discount).
 * @param input.orderId    - Order UUID, used to build the deep link to the order in the owner's panel.
 * @param input.storeOrderNumber - Correlative order number for the store (task 2.1). When absent,
 *   falls back to a short UUID reference so older callers keep working.
 * @param input.payment    - Payment info for paid MP orders; adds a "Pagado" block at the end.
 */
export function buildOrderWhatsappMessage(input: {
  storeName: string;
  lines: string[];
  couponCode?: string | null;
  discountAmount?: number | null;
  total: number;
  orderId: string;
  storeOrderNumber?: number | null;
  payment?: WhatsAppPayment | null;
}): string {
  const parts: string[] = [
    `*Pedido en ${input.storeName}*`,
    '',
    ...input.lines,
    '',
  ];

  if (input.couponCode && input.discountAmount && input.discountAmount > 0) {
    parts.push(`Cupón *${input.couponCode}*: -${formatARS(input.discountAmount)}`);
  }
  parts.push(`*Total: ${formatARS(input.total)}*`);

  const ref = input.storeOrderNumber != null ? input.storeOrderNumber : input.orderId.slice(0, 8);
  parts.push('', `Pedido #${ref}`, buildOrderDashboardUrl(input.orderId));

  if (input.payment) {
    parts.push('', '✅ *Pagado con Mercado Pago*');
    if (input.payment.paymentId) {
      parts.push(`Pago #${input.payment.paymentId}`);
    }
    if (input.payment.customerName) {
      parts.push(input.payment.customerName);
    }
  }

  return parts.join('\n');
}
