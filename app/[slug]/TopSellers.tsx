"use client";

import React from "react";
import ProductCardClient from "./ProductCardClient";
import type { UIProduct } from "./types";
import type { ProductVariantData } from "@/lib/storefront/resolve";

interface Props {
  products: UIProduct[];
  accentColor: string;
  variantsByProduct: Record<string, ProductVariantData>;
  onOpenModal: (p: UIProduct) => void;
}

/**
 * "Lo más pedido" — renders a horizontal-scrollable row on mobile and a
 * 4-column grid on desktop. Only renders when products.length >= 3.
 */
export default function TopSellers({
  products,
  accentColor,
  variantsByProduct,
  onOpenModal,
}: Props) {
  if (products.length < 3) return null;

  return (
    <section aria-labelledby="top-sellers-heading">
      <div className="flex items-center gap-3 mb-6 sm:mb-8">
        <h2
          id="top-sellers-heading"
          className="text-xl sm:text-2xl font-bold shrink-0"
          style={{ color: "var(--store-ink)", fontFamily: "var(--font-rubik, Rubik)" }}
        >
          Lo más pedido
        </h2>
        <div
          className="h-px flex-1"
          style={{ background: "var(--store-border)" }}
          aria-hidden="true"
        />
      </div>

      {/* Mobile: horizontal scroll with snap. Desktop: 4-column grid. */}
      <div
        className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 sm:pb-0 sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 md:gap-5 lg:gap-6 scrollbar-none"
        style={{ scrollbarWidth: "none" }}
      >
        {products.map((p) => {
          const vd = variantsByProduct[p.id];
          return (
            <div key={`top-seller-${p.id}`} className="shrink-0 w-44 sm:w-auto">
              <ProductCardClient
                product={p}
                accentColor={accentColor}
                onOpenModal={onOpenModal}
                optionTypes={vd?.optionTypes}
                variants={vd?.variants}
                priceCents={p.priceCents}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
