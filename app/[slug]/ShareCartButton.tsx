"use client";

import React from "react";
import { Share2 } from "lucide-react";
import type { CartItem } from "./CartContext";
import { toast } from "@/lib/toast";

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
  /** Map from productId → { min_quantity, qty_step } for pre-share validation (D3). */
  productMinStepMap?: Map<string, { min_quantity: number; qty_step: number }>;
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
  productMinStepMap,
}: Props) {
  // Don't render if cart is empty (defensive — caller also guards this)
  if (items.length === 0) return null;

  async function handleShare() {
    // Edge case: items could be empty if called programmatically despite the guard
    if (items.length === 0) return;

    // D3: pre-validate min_quantity and qty_step (grouped by product_id)
    if (productMinStepMap && productMinStepMap.size > 0) {
      const qtyByProduct = new Map<string, number>();
      for (const item of items) {
        qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.quantity);
      }
      for (const [productId, totalQty] of qtyByProduct.entries()) {
        const rules = productMinStepMap.get(productId);
        if (!rules) continue;
        const { min_quantity, qty_step } = rules;
        if (totalQty < min_quantity) {
          const productName = items.find((i) => i.productId === productId)?.name ?? productId;
          toast.error(`Necesitás al menos ${min_quantity} unidades de '${productName}' para compartir el pedido.`);
          return;
        }
        if (qty_step > 1 && totalQty % qty_step !== 0) {
          const productName = items.find((i) => i.productId === productId)?.name ?? productId;
          toast.error(`La cantidad de '${productName}' debe ser múltiplo de ${qty_step}.`);
          return;
        }
      }
    }

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
