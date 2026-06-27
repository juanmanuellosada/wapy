// task 5.8: Pending result page
//
// MP redirects the buyer here via back_urls.pending for payments that require
// additional verification (e.g. bank transfer, ticket cash, etc.).
// This page does NOT modify the order — the webhook handles state.

import Link from "next/link";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function CheckoutPendingPage({ params }: Props) {
  const { slug } = await params;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16 gap-6 text-center">
      {/* Icon */}
      <div
        className="flex h-20 w-20 items-center justify-center rounded-full text-4xl"
        style={{ background: "rgba(234,179,8,0.12)" }}
        aria-hidden="true"
      >
        🕐
      </div>

      <div className="flex flex-col gap-3 max-w-sm">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-rubik, Rubik)" }}>
          Pago pendiente de acreditación
        </h1>
        <p className="text-base" style={{ color: "var(--store-ink-secondary, #6b7280)" }}>
          Tu pago está siendo procesado. Puede tardar hasta 2 días hábiles en acreditarse,
          dependiendo del medio de pago que usaste.
        </p>
        <p className="text-sm" style={{ color: "var(--store-ink-muted, #9ca3af)" }}>
          Recibirás una notificación por email cuando se confirme.
        </p>
      </div>

      <Link
        href={`/${slug}`}
        className="mt-2 rounded-full px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-80"
        style={{ background: "#eab308", color: "#ffffff" }}
      >
        Volver a la tienda
      </Link>
    </div>
  );
}
