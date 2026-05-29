"use client";

import React from "react";
import { Share2 } from "lucide-react";
import type { CartItem } from "./CartContext";

function formatARS(amount: number): string {
  return amount.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function buildShareText(
  storeName: string,
  slug: string,
  items: CartItem[],
  total: number
): string {
  const lines = items.map((i) => {
    const displayPrice = i.variantPrice ?? i.price;
    const label = i.variantLabel ? ` (${i.variantLabel})` : "";
    return `• ${i.quantity}x ${i.name}${label} — ${formatARS(displayPrice * i.quantity)}`;
  });

  return [
    `*Mirá lo que me voy a pedir en ${storeName}!*`,
    "",
    ...lines,
    "",
    `*Total: ${formatARS(total)}*`,
    "",
    `Ver la tienda: https://wapy.com.ar/${slug}`,
  ].join("\n");
}

interface Props {
  storeName: string;
  slug: string;
  items: CartItem[];
  total: number;
  accentColor: string;
}

/**
 * "Compartí tu pedido" — opens the native share sheet (if available) or falls
 * back to wa.me. Does NOT create orders in DB or modify cart state.
 */
export default function ShareCartButton({
  storeName,
  slug,
  items,
  total,
  accentColor,
}: Props) {
  // Don't render if cart is empty (defensive — caller also guards this)
  if (items.length === 0) return null;

  async function handleShare() {
    // Edge case: items could be empty if called programmatically despite the guard
    if (items.length === 0) return;

    const text = buildShareText(storeName, slug, items, total);
    const url = `https://wapy.com.ar/${slug}`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text, url });
        return;
      } catch {
        // User cancelled the share sheet or share failed — fall through to WhatsApp
      }
    }

    // Fallback: open WhatsApp Web without a destination number
    // (WhatsApp will prompt the user to pick a contact)
    window.open(
      "https://wa.me/?text=" + encodeURIComponent(text),
      "_blank",
      "noopener,noreferrer"
    );
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="w-full rounded-full py-3.5 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-opacity hover:opacity-80"
      style={{
        background: "var(--store-border)",
        color: accentColor,
        border: `1px solid ${accentColor}`,
      }}
      aria-label="Compartí tu pedido por WhatsApp"
    >
      <Share2 className="h-4 w-4" aria-hidden="true" />
      Compartí tu pedido
    </button>
  );
}
