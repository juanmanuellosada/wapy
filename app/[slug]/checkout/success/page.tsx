// task 5.8: Success result page
//
// MP redirects the buyer here via back_urls.success after a payment attempt.
// This page does NOT mark the order as paid — the authoritative state update
// is performed exclusively by the orders webhook (Group 6).
// We show "pago en verificación" to avoid confirming a payment that hasn't been
// validated yet (design decision D5).

import Link from "next/link";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CheckoutSuccessPage({ params }: Props) {
  const { slug } = await params;

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
