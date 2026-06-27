// task 5.8: Failure result page
//
// MP redirects the buyer here via back_urls.failure when the payment fails.
// This page does NOT modify the order — the webhook handles state.
// We offer the buyer a chance to retry or go back to the store.

import Link from "next/link";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CheckoutFailurePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;

  // MP passes status_detail as a query param — we use it to show a friendlier message.
  const statusDetail = typeof sp.status_detail === "string" ? sp.status_detail : null;

  const reasonMessage =
    statusDetail === "cc_rejected_bad_filled_card_number"
      ? "Revisá los datos de tu tarjeta e intentá de nuevo."
      : statusDetail === "cc_rejected_insufficient_amount"
        ? "Tu tarjeta no tiene fondos suficientes."
        : statusDetail === "cc_rejected_other_reason"
          ? "Tu tarjeta fue rechazada. Intentá con otro medio de pago."
          : "Podés intentar de nuevo con otro medio de pago.";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16 gap-6 text-center">
      {/* Icon */}
      <div
        className="flex h-20 w-20 items-center justify-center rounded-full text-4xl"
        style={{ background: "rgba(239,68,68,0.1)" }}
        aria-hidden="true"
      >
        ✗
      </div>

      <div className="flex flex-col gap-3 max-w-sm">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-rubik, Rubik)" }}>
          El pago no pudo procesarse
        </h1>
        <p className="text-base" style={{ color: "var(--store-ink-secondary, #6b7280)" }}>
          {reasonMessage}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mt-2">
        <Link
          href={`/${slug}`}
          className="rounded-full px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ background: "#ef4444", color: "#ffffff" }}
        >
          Reintentar pago
        </Link>
        <Link
          href={`/${slug}`}
          className="rounded-full px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ background: "var(--store-border, #e5e7eb)", color: "var(--store-ink, #111827)" }}
        >
          Volver a la tienda
        </Link>
      </div>
    </div>
  );
}
