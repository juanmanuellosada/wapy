"use client";

import React, { useState, useMemo } from "react";
import Image from "next/image";
import { Plus } from "lucide-react";
import type { StorefrontOptionType, StorefrontVariant } from "@/lib/storefront/resolve";
import { useCart, cartItemKey } from "./CartContext";

// Inline placeholder SVG — matches StoreClient's PLACEHOLDER_IMAGE
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

export interface SimpleProduct {
  id: string;
  name: string;
  price: number; // ARS float (price_cents / 100)
  image: string;
  stock: number | null;
  description: string;
}

interface Props<T extends SimpleProduct> {
  product: T;
  accentColor: string;
  onOpenModal: (p: T) => void;
  // Variant data — undefined for simple products
  optionTypes?: StorefrontOptionType[];
  variants?: StorefrontVariant[];
  /** Product price in cents — needed to resolve variant price_override */
  priceCents: number;
}

// ─── Simple product card (no variants) ───────────────────────────────────────

function SimpleProductCard<T extends SimpleProduct>({
  product,
  accentColor,
  onOpenModal,
}: {
  product: T;
  accentColor: string;
  onOpenModal: (p: T) => void;
}) {
  const { addItem, openCart } = useCart();
  const isOutOfStock = product.stock === 0;
  const isLowStock = product.stock !== null && product.stock >= 1 && product.stock <= 5;

  function handleAdd(e: React.MouseEvent) {
    e.stopPropagation();
    if (isOutOfStock) return;
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
    });
    openCart();
  }

  return (
    <article
      className={`store-card cursor-pointer flex flex-col rounded-2xl overflow-hidden${isOutOfStock ? " opacity-60" : ""}`}
      onClick={() => onOpenModal(product)}
      style={{
        background: "var(--store-surface)",
        border: "1px solid var(--store-border)",
      }}
      aria-label={`${product.name}, ${formatARS(product.price)}${isOutOfStock ? ", sin stock" : ""}`}
    >
      {/* Image */}
      <div
        className="relative overflow-hidden"
        style={{ aspectRatio: "3/4", background: "var(--store-border)" }}
      >
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="store-card-image object-cover"
          unoptimized={product.image.startsWith("data:")}
        />
        {isOutOfStock && (
          <div className="absolute inset-0 flex items-end justify-start p-2 pointer-events-none">
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-600/90 text-white">
              Sin stock
            </span>
          </div>
        )}
        {isLowStock && (
          <div className="absolute inset-0 flex items-end justify-start p-2 pointer-events-none">
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-500/90 text-white">
              Quedan {product.stock}
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-2 p-3 sm:p-4">
        <h3
          className="text-sm sm:text-base font-semibold leading-snug"
          style={{ color: "var(--store-ink)" }}
        >
          {product.name}
        </h3>
        <div className="flex items-center justify-between gap-2 mt-auto">
          <span className="text-sm sm:text-base font-bold" style={{ color: "var(--store-ink)" }}>
            {formatARS(product.price)}
          </span>
          <button
            onClick={handleAdd}
            disabled={isOutOfStock}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity${isOutOfStock ? " opacity-40 cursor-not-allowed" : " cursor-pointer hover:opacity-80"}`}
            style={{ background: accentColor, color: "#ffffff" }}
            aria-label={isOutOfStock ? `${product.name} sin stock` : `Agregar ${product.name} al carrito`}
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            {isOutOfStock ? "Sin stock" : "Agregar"}
          </button>
        </div>
      </div>
    </article>
  );
}

// ─── Variant product card ─────────────────────────────────────────────────────

function VariantProductCard<T extends SimpleProduct>({
  product,
  accentColor,
  onOpenModal,
  optionTypes,
  variants,
  priceCents,
}: {
  product: T;
  accentColor: string;
  onOpenModal: (p: T) => void;
  optionTypes: StorefrontOptionType[];
  variants: StorefrontVariant[];
  priceCents: number;
}) {
  const { addItem, openCart } = useCart();

  // State: for each optionTypeId, which optionValueId is selected (undefined = not yet picked)
  const [selectedValues, setSelectedValues] = useState<Record<string, string>>({});

  // Is the selection complete? (all option types have a chosen value)
  const isSelectionComplete = useMemo(
    () => optionTypes.every((ot) => selectedValues[ot.id] !== undefined),
    [optionTypes, selectedValues]
  );

  // Find the active variant: the one whose optionValues map exactly matches selectedValues
  const activeVariant = useMemo<StorefrontVariant | null>(() => {
    if (!isSelectionComplete) return null;
    return (
      variants.find((v) => {
        // Every selected value must be present in this variant's optionValues
        return optionTypes.every(
          (ot) => v.optionValues[ot.id] === selectedValues[ot.id]
        );
      }) ?? null
    );
  }, [isSelectionComplete, variants, optionTypes, selectedValues]);

  // Effective display values from active variant (or defaults)
  const effectivePriceCents = activeVariant?.price_override ?? priceCents;
  const effectivePrice = effectivePriceCents / 100;
  const effectiveImage = activeVariant?.image_url ?? product.image;
  const effectiveStock = activeVariant?.stock ?? null;

  const isOutOfStock = isSelectionComplete && effectiveStock === 0;
  const isLowStock =
    isSelectionComplete &&
    effectiveStock !== null &&
    effectiveStock >= 1 &&
    effectiveStock <= 5;

  const canAdd = isSelectionComplete && !isOutOfStock;

  // For a given optionType, which valueIds are "reachable" given current selection of OTHER types?
  // A value is reachable if there exists at least one non-deleted variant that has that value
  // AND matches all currently selected values for other types.
  function isValueReachable(optionTypeId: string, optionValueId: string): boolean {
    const otherSelections = Object.entries(selectedValues).filter(
      ([typeId]) => typeId !== optionTypeId
    );
    return variants.some((v) => {
      // Variant must have this value for this type
      if (v.optionValues[optionTypeId] !== optionValueId) return false;
      // Variant must also have the currently selected values for all other types
      for (const [typeId, valueId] of otherSelections) {
        if (v.optionValues[typeId] !== valueId) return false;
      }
      return true;
    });
  }

  // Build variant label from current selection (sorted by type position)
  const variantLabel = useMemo<string | null>(() => {
    if (!isSelectionComplete) return null;
    const sorted = [...optionTypes].sort((a, b) => a.position - b.position);
    const parts: string[] = [];
    for (const ot of sorted) {
      const valueId = selectedValues[ot.id];
      const value = ot.values.find((v) => v.id === valueId)?.value;
      if (value) parts.push(value);
    }
    return parts.join(" / ") || null;
  }, [isSelectionComplete, optionTypes, selectedValues]);

  function handleSelect(optionTypeId: string, optionValueId: string) {
    setSelectedValues((prev) => ({ ...prev, [optionTypeId]: optionValueId }));
  }

  function handleAdd(e: React.MouseEvent) {
    e.stopPropagation();
    if (!canAdd || !activeVariant) return;
    addItem({
      productId: product.id,
      name: product.name,
      price: effectivePrice,
      image: effectiveImage ?? PLACEHOLDER_IMAGE,
      variantId: activeVariant.id,
      variantLabel,
      variantPrice: effectivePrice,
      variantImageUrl: activeVariant.image_url,
    });
    openCart();
  }

  // Button label
  let btnLabel = "Agregar";
  if (!isSelectionComplete) btnLabel = "Elegí opción";
  else if (isOutOfStock) btnLabel = "Sin stock";

  const displayImage = effectiveImage || PLACEHOLDER_IMAGE;

  return (
    <article
      className="store-card flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: "var(--store-surface)",
        border: "1px solid var(--store-border)",
      }}
      aria-label={`${product.name}${variantLabel ? ` — ${variantLabel}` : ""}, ${formatARS(effectivePrice)}`}
    >
      {/* Image — clickable to open modal for description */}
      <div
        className="relative overflow-hidden cursor-pointer"
        style={{ aspectRatio: "3/4", background: "var(--store-border)" }}
        onClick={() => onOpenModal(product)}
      >
        <Image
          src={displayImage}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="store-card-image object-cover"
          unoptimized={displayImage.startsWith("data:")}
        />
        {isOutOfStock && (
          <div className="absolute inset-0 flex items-end justify-start p-2 pointer-events-none">
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-600/90 text-white">
              Sin stock
            </span>
          </div>
        )}
        {isLowStock && (
          <div className="absolute inset-0 flex items-end justify-start p-2 pointer-events-none">
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-500/90 text-white">
              Quedan {effectiveStock}
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-2 p-3 sm:p-4">
        <h3
          className="text-sm sm:text-base font-semibold leading-snug cursor-pointer"
          style={{ color: "var(--store-ink)" }}
          onClick={() => onOpenModal(product)}
        >
          {product.name}
        </h3>

        {/* Option selectors — one per type */}
        {optionTypes
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((ot) => (
            <div key={ot.id} className="flex flex-col gap-1">
              <span
                className="text-xs font-medium"
                style={{ color: "var(--store-ink-secondary)" }}
              >
                {ot.name}
              </span>
              {/* Mobile: native select for compact layout (5.6) */}
              <div className="sm:hidden">
                <select
                  value={selectedValues[ot.id] ?? ""}
                  onChange={(e) => {
                    if (e.target.value) handleSelect(ot.id, e.target.value);
                  }}
                  className="w-full rounded-lg px-2 py-1.5 text-xs border"
                  style={{
                    background: "var(--store-surface)",
                    color: "var(--store-ink)",
                    border: "1px solid var(--store-border-strong)",
                  }}
                  aria-label={`Elegir ${ot.name}`}
                >
                  <option value="">Elegir...</option>
                  {ot.values
                    .slice()
                    .sort((a, b) => a.position - b.position)
                    .map((ov) => {
                      const reachable = isValueReachable(ot.id, ov.id);
                      return (
                        <option key={ov.id} value={ov.id} disabled={!reachable}>
                          {ov.value}{!reachable ? " (no disponible)" : ""}
                        </option>
                      );
                    })}
                </select>
              </div>
              {/* Desktop: button group (5.3, 5.4) */}
              <div className="hidden sm:flex flex-wrap gap-1">
                {ot.values
                  .slice()
                  .sort((a, b) => a.position - b.position)
                  .map((ov) => {
                    const reachable = isValueReachable(ot.id, ov.id);
                    const isSelected = selectedValues[ot.id] === ov.id;
                    return (
                      <button
                        key={ov.id}
                        type="button"
                        disabled={!reachable}
                        onClick={() => handleSelect(ot.id, ov.id)}
                        className={`px-2 py-1 rounded-md text-xs font-medium border transition-colors${
                          isSelected
                            ? " cursor-pointer"
                            : reachable
                            ? " cursor-pointer hover:opacity-80"
                            : " opacity-40 cursor-not-allowed line-through"
                        }`}
                        style={
                          isSelected
                            ? { background: accentColor, color: "#ffffff", border: `1px solid ${accentColor}` }
                            : { background: "var(--store-surface)", color: "var(--store-ink)", border: "1px solid var(--store-border-strong)" }
                        }
                        aria-pressed={isSelected}
                        aria-label={`${ot.name}: ${ov.value}${!reachable ? " (no disponible)" : ""}`}
                      >
                        {ov.value}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}

        {/* Price + Add button */}
        {/* Show price only when no variant is active yet (selection incomplete) or the active variant
            has a price_override. When the variant has no price_override its price equals the product
            price, which is redundant here. */}
        {(() => {
          const showPrice = activeVariant === null || activeVariant.price_override !== null;
          return (
            <div className={`flex items-center gap-2 mt-auto${showPrice ? " justify-between" : " justify-end"}`}>
              {showPrice && (
                <span className="text-sm sm:text-base font-bold" style={{ color: "var(--store-ink)" }}>
                  {formatARS(effectivePrice)}
                </span>
              )}
              <button
                onClick={handleAdd}
                disabled={!canAdd}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity${canAdd ? " cursor-pointer hover:opacity-80" : " opacity-40 cursor-not-allowed"}`}
                style={{ background: accentColor, color: "#ffffff" }}
                aria-label={
                  !isSelectionComplete
                    ? `Elegí las opciones de ${product.name} para agregar`
                    : isOutOfStock
                    ? `${product.name} sin stock`
                    : `Agregar ${product.name}${variantLabel ? ` (${variantLabel})` : ""} al carrito`
                }
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                {btnLabel}
              </button>
            </div>
          );
        })()}
      </div>
    </article>
  );
}

// ─── Public export: dispatches to simple or variant card ─────────────────────

export default function ProductCardClient<T extends SimpleProduct>({
  product,
  accentColor,
  onOpenModal,
  optionTypes,
  variants,
  priceCents,
}: Props<T>) {
  if (!optionTypes || optionTypes.length === 0) {
    return (
      <SimpleProductCard
        product={product}
        accentColor={accentColor}
        onOpenModal={onOpenModal}
      />
    );
  }
  return (
    <VariantProductCard
      product={product}
      accentColor={accentColor}
      onOpenModal={onOpenModal}
      optionTypes={optionTypes}
      variants={variants ?? []}
      priceCents={priceCents}
    />
  );
}
