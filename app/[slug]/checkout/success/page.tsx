// task 5.8: Success result page
//
// MP redirects the buyer here via back_urls.success after a payment attempt.
// This page does NOT mark the order as paid — the authoritative state update
// is performed exclusively by the orders webhook (Group 6).
// We show "pago en verificación" to avoid confirming a payment that hasn't been
// validated yet (design decision D5).
//
// When payment_status === 'approved' (set by the webhook), we additionally show
// a WhatsApp notify button so the buyer can alert the store owner.

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { buildOrderWhatsappMessage, formatARS } from "@/lib/store/whatsapp/buildMessage";
import WhatsAppNotifyButton from "./WhatsAppNotifyButton";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CheckoutSuccessPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const externalReference = typeof sp.external_reference === 'string' ? sp.external_reference : null;

  let whatsappUrl: string | null = null;

  if (externalReference) {
    const admin = createAdminClient();

    const { data: order } = await admin
      .from('orders')
      .select('id, store_id, payment_status, mp_payment_id, customer_name, total_cents, discount_cents, coupon_code')
      .eq('id', externalReference)
      .maybeSingle();

    if (order && order.payment_status === 'approved') {
      const [storeResult, itemsResult] = await Promise.all([
        admin
          .from('stores')
          .select('name, whatsapp_number')
          .eq('id', order.store_id)
          .maybeSingle(),
        admin
          .from('order_items')
          .select('product_name, quantity, unit_price_cents, variant_label')
          .eq('order_id', order.id),
      ]);

      const store = storeResult.data;
      const orderItems = itemsResult.data ?? [];

      if (store?.whatsapp_number) {
        const lines = orderItems.map((item) => {
          const label = item.variant_label ? ` (${item.variant_label})` : '';
          const lineTotal = (item.unit_price_cents * item.quantity) / 100;
          return `• ${item.quantity}x ${item.product_name}${label} — ${formatARS(lineTotal)}`;
        });

        const total = order.total_cents / 100;
        const discountAmount = order.discount_cents ? order.discount_cents / 100 : null;

        const message = buildOrderWhatsappMessage({
          storeName: store.name ?? '',
          lines,
          couponCode: order.coupon_code ?? null,
          discountAmount,
          total,
          orderRef: order.id.slice(0, 8),
          payment: {
            method: 'mercadopago',
            paymentId: order.mp_payment_id ?? null,
            customerName: order.customer_name ?? null,
          },
        });

        const normalized = store.whatsapp_number.replace(/\D/g, '');
        whatsappUrl = `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
      }
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16 gap-6 text-center">
      {/* Icon */}
      <div
        className="flex h-20 w-20 items-center justify-center rounded-full text-4xl"
        style={{ background: "rgba(34,197,94,0.12)" }}
        aria-hidden="true"
      >
        ⏳
      </div>

      <div className="flex flex-col gap-3 max-w-sm">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-rubik, Rubik)" }}>
          ¡Gracias por tu compra!
        </h1>
        <p className="text-base" style={{ color: "var(--store-ink-secondary, #6b7280)" }}>
          Recibimos tu pago. Estamos verificando la transacción con Mercado Pago.
          Te notificaremos por email cuando el pago sea confirmado.
        </p>
        <p className="text-sm" style={{ color: "var(--store-ink-muted, #9ca3af)" }}>
          Este proceso puede tardar unos minutos.
        </p>
      </div>

      {whatsappUrl && <WhatsAppNotifyButton url={whatsappUrl} />}

      <Link
        href={`/${slug}`}
        className="mt-2 rounded-full px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-80"
        style={{ background: "#22c55e", color: "#ffffff" }}
      >
        Volver a la tienda
      </Link>
    </div>
  );
}
