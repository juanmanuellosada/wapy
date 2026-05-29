"use client";

import React from "react";
import Image from "next/image";
import type { UIProduct } from "./types";

// Inline placeholder matches the one in StoreClient / ProductCardClient
const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#e5e7eb"/><text x="100" y="105" font-family="system-ui,sans-serif" font-size="14" fill="#9ca3af" text-anchor="middle">Sin imagen</text></svg>'
  );

function formatARS(amount: number): string {
  return amount.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

interface Props {
  /** Ordered list of related product IDs (from the RPC, most co-purchased first). */
  relatedIds: string[];
  /** Full product catalog — used to resolve ids to UIProduct. */
  products: UIProduct[];
  /** Called when the visitor clicks a mini-card. */
  onSelect: (p: UIProduct) => void;
  /** Accent color for hover/focus ring. */
  accentColor: string;
}

/**
 * "Quienes lo pidieron, también pidieron…"
 *
 * Renders a horizontal-scrollable row of mini-cards. Only renders when there
 * is at least one active related product in the catalog.
 */
export default function RelatedProducts({
  relatedIds,
  products,
  onSelect,
  accentColor,
}: Props) {
  // Build a lookup map for O(1) resolution
  const productMap = React.useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  // Map ids → UIProduct, filtering out missing or inactive products.
  // "inactive" means the product isn't in the catalog (already filtered by the
  // storefront resolver to is_active=true).
  const related = React.useMemo<UIProduct[]>(() => {
    const result: UIProduct[] = [];
    for (const id of relatedIds) {
      const p = productMap.get(id);
      if (p) result.push(p);
    }
    return result;
  }, [relatedIds, productMap]);

  if (related.length === 0) return null;

  return (
    <section aria-labelledby="related-products-heading" className="mt-4">
      <h3
        id="related-products-heading"
        className="text-sm font-semibold mb-3"
        style={{ color: "var(--store-ink-secondary)" }}
      >
        Quienes lo pidieron, también pidieron…
      </h3>

      <div
        className="flex gap-3 overflow-x-auto pb-1 scrollbar-none"
        style={{ scrollbarWidth: "none" }}
        role="list"
      >
        {related.map((p) => {
          const img = p.image || PLACEHOLDER_IMAGE;
          return (
            <button
              key={p.id}
              type="button"
              role="listitem"
              onClick={() => onSelect(p)}
              className="shrink-0 flex flex-col gap-1.5 rounded-xl overflow-hidden cursor-pointer transition-opacity hover:opacity-80 focus-visible:outline-none"
              style={{
                width: 88,
                background: "var(--store-surface)",
                border: "1px solid var(--store-border)",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.boxShadow = `0 0 0 2px ${accentColor}`)
              }
              onBlur={(e) => (e.currentTarget.style.boxShadow = "")}
              aria-label={`Ver ${p.name}, ${formatARS(p.price)}`}
            >
              {/* Image */}
              <div
                className="relative w-full overflow-hidden"
                style={{ aspectRatio: "1/1", background: "var(--store-border)" }}
              >
                <Image
                  src={img}
                  alt={p.name}
                  fill
                  sizes="88px"
                  className="object-cover"
                  unoptimized={img.startsWith("data:")}
                />
              </div>

              {/* Name + price */}
              <div className="px-2 pb-2 flex flex-col gap-0.5">
                <p
                  className="text-xs font-medium leading-snug line-clamp-2"
                  style={{ color: "var(--store-ink)" }}
                >
                  {p.name}
                </p>
                <p
                  className="text-xs font-semibold"
                  style={{ color: "var(--store-ink-secondary)" }}
                >
                  {formatARS(p.price)}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
