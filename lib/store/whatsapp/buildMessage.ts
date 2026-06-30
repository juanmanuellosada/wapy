// Pure helper — no server-only dependency; safe to import from client components.

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
 * @param input.orderRef   - Short order reference string (e.g. first 8 chars of UUID).
 * @param input.payment    - Payment info for paid MP orders; adds a "Pagado" block at the end.
 */
export function buildOrderWhatsappMessage(input: {
  storeName: string;
  lines: string[];
  couponCode?: string | null;
  discountAmount?: number | null;
  total: number;
  orderRef?: string | null;
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

  if (input.orderRef) {
    parts.push('', `Referencia: #${input.orderRef}`);
  }

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
