"use client";

import React, { useState, useMemo, useCallback } from "react";
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

// ─── Variant selection hook ───────────────────────────────────────────────────

export interface VariantSelectionState {
  selectedValues: Record<string, string>;
  handleSelect: (optionTypeId: string, optionValueId: string) => void;
  isValueReachable: (optionTypeId: string, optionValueId: string) => boolean;
  activeVariant: StorefrontVariant | null;
  isSelectionComplete: boolean;
  effectivePriceCents: number;
  effectivePrice: number;
  effectiveImage: string | null;
  effectiveStock: number | null;
  isOutOfStock: boolean;
  variantLabel: string | null;
}

export function useVariantSelection(
  optionTypes: StorefrontOptionType[],
  variants: StorefrontVariant[],
  priceCents: number,
  productImage: string
): VariantSelectionState {
  const [selectedValues, setSelectedValues] = useState<Record<string, string>>({});

  const isSelectionComplete = useMemo(
    () => optionTypes.every((ot) => selectedValues[ot.id] !== undefined),
    [optionTypes, selectedValues]
  );

  const activeVariant = useMemo<StorefrontVariant | null>(() => {
    if (!isSelectionComplete) return null;
    return (
      variants.find((v) =>
        optionTypes.every((ot) => v.optionValues[ot.id] === selectedValues[ot.id])
      ) ?? null
    );
  }, [isSelectionComplete, variants, optionTypes, selectedValues]);

  const effectivePriceCents = activeVariant?.price_override ?? priceCents;
  const effectivePrice = effectivePriceCents / 100;
  const effectiveImage = activeVariant?.image_url ?? productImage;
  const effectiveStock = activeVariant?.stock ?? null;
  const isOutOfStock = isSelectionComplete && effectiveStock === 0;

  const isValueReachable = useCallback(
    (optionTypeId: string, optionValueId: string): boolean => {
      const otherSelections = Object.entries(selectedValues).filter(
        ([typeId]) => typeId !== optionTypeId
      );
      return variants.some((v) => {
        if (v.optionValues[optionTypeId] !== optionValueId) return false;
        for (const [typeId, valueId] of otherSelections) {
          if (v.optionValues[typeId] !== valueId) return false;
        }
        return true;
      });
    },
    [selectedValues, variants]
  );

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

  const handleSelect = useCallback((optionTypeId: string, optionValueId: string) => {
    setSelectedValues((prev) => ({ ...prev, [optionTypeId]: optionValueId }));
  }, []);

  return {
    selectedValues,
    handleSelect,
    isValueReachable,
    activeVariant,
    isSelectionComplete,
    effectivePriceCents,
    effectivePrice,
    effectiveImage,
    effectiveStock,
    isOutOfStock,
    variantLabel,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export interface SimpleProduct {
  id: string;
  name: string;
  price: number; // ARS float (price_cents / 100)
  image: string;
  stock: number | null;
  description: string;
  min_quantity: number; // default 1
  qty_step: number; // default 1
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
  /** When true, renders a ring highlight (deep-link arrival effect) */
  isHighlighted?: boolean;
}

// ─── Simple product card (no variants) ───────────────────────────────────────

/** D4: quantity to add on a single click. First add = min_quantity; subsequent = qty_step. */
function quantityToAdd(minQty: number, step: number, currentQty: number): number {
  return currentQty === 0 ? minQty : step;
}

function SimpleProductCard<T extends SimpleProduct>({
  product,
  accentColor,
  onOpenModal,
  isHighlighted,
}: {
  product: T;
  accentColor: string;
  onOpenModal: (p: T) => void;
  isHighlighted?: boolean;
}) {
  const { addItem, setQty, items, openCart } = useCart();
  const isOutOfStock = product.stock === 0;
  const isLowStock = product.stock !== null && product.stock >= 1 && product.stock <= 5;
  const minQty = product.min_quantity ?? 1;
  const step = product.qty_step ?? 1;

  // Sum all line items for this product (across any variants) to compute currentQty
  const currentQtyInCart = items
    .filter((i) => i.productId === product.id)
    .reduce((s, i) => s + i.quantity, 0);

  function handleAdd(e: React.MouseEvent) {
    e.stopPropagation();
    if (isOutOfStock) return;
    const toAdd = quantityToAdd(minQty, step, currentQtyInCart);
    const existingItem = items.find((i) => i.productId === product.id && !i.variantId);
    if (existingItem) {
      const key = cartItemKey(product.id, null);
      setQty(key, existingItem.quantity + toAdd);
    } else {
      addItem({
        productId: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
      });
      if (toAdd > 1) {
        // addItem sets quantity to 1; correct it via setQty after a tick
        // (CartContext's ADD action starts at 1 for new items)
        const key = cartItemKey(product.id, null);
        setQty(key, toAdd);
      }
    }
    openCart();
  }

  const showMinStepLabel = minQty > 1 || step > 1;
  const minStepLabel = minQty > 1 && step > 1
    ? `Mín. ${minQty}, de a ${step}`
    : minQty > 1
    ? `Mín. ${minQty}`
    : `De a ${step}`;

  return (
    <article
      id={`product-${product.id}`}
      className={`store-card cursor-pointer flex flex-col rounded-2xl overflow-hidden${isOutOfStock ? " opacity-60" : ""}`}
      onClick={() => onOpenModal(product)}
      style={{
        background: "var(--store-surface)",
        border: "1px solid var(--store-border)",
        boxShadow: isHighlighted ? `0 0 0 3px ${accentColor}` : undefined,
        transition: "box-shadow 0.3s ease",
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
        {/* D9: sub-label shown only when there's a restriction */}
        {showMinStepLabel && (
          <p className="text-xs" style={{ color: "var(--store-ink-muted)" }}>
            {minStepLabel}
          </p>
        )}
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

// ─── Shared variant selector (selectors + add button) ────────────────────────
// Used by both VariantProductCard and ProductModal.

export interface VariantSelectorProduct {
  id: string;
  name: string;
  image: string;
  min_quantity: number;
  qty_step: number;
}

/**
 * Renders option-type selectors and an "Agregar" button for a product with
 * variants. Handles all selection state, reachability, and cart interaction.
 *
 * layout="card"  — compact pill button + price row (used inside product cards)
 * layout="modal" — full-width button without price row (modal already has it)
 *
 * Pass `externalState` to use controlled mode (state managed by the caller,
 * e.g. VariantProductCard). Without it the component manages its own state.
 */
export function VariantSelector({
  product,
  accentColor,
  optionTypes,
  variants,
  priceCents,
  layout = "card",
  externalState,
}: {
  product: VariantSelectorProduct;
  accentColor: string;
  optionTypes: StorefrontOptionType[];
  variants: StorefrontVariant[];
  priceCents: number;
  layout?: "card" | "modal";
  externalState?: VariantSelectionState;
}) {
  const { addItem, setQty, items, openCart } = useCart();
  const minQty = product.min_quantity ?? 1;
  const step = product.qty_step ?? 1;

  // Self-managed state (used when no externalState is provided, e.g. modal)
  const selfState = useVariantSelection(optionTypes, variants, priceCents, product.image);

  const {
    selectedValues,
    handleSelect,
    isValueReachable,
    activeVariant,
    isSelectionComplete,
    effectivePrice,
    effectiveImage,
    isOutOfStock,
    variantLabel,
  } = externalState ?? selfState;

  const canAdd = isSelectionComplete && !isOutOfStock;

  const totalQtyInCart = items
    .filter((i) => i.productId === product.id)
    .reduce((s, i) => s + i.quantity, 0);

  function handleAdd(e: React.MouseEvent) {
    e.stopPropagation();
    if (!canAdd || !activeVariant) return;
    const toAdd = quantityToAdd(minQty, step, totalQtyInCart);
    const existingVariantItem = items.find(
      (i) => i.productId === product.id && i.variantId === activeVariant.id
    );
    if (existingVariantItem) {
      const key = cartItemKey(product.id, activeVariant.id);
      setQty(key, existingVariantItem.quantity + toAdd);
    } else {
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
      if (toAdd > 1) {
        const key = cartItemKey(product.id, activeVariant.id);
        setQty(key, toAdd);
      }
    }
    openCart();
  }

  let btnLabel = "Agregar";
  if (!isSelectionComplete) btnLabel = "Elegí opción";
  else if (isOutOfStock) btnLabel = "Sin stock";

  const btnAriaLabel = !isSelectionComplete
    ? `Elegí las opciones de ${product.name} para agregar`
    : isOutOfStock
    ? `${product.name} sin stock`
    : `Agregar ${product.name}${variantLabel ? ` (${variantLabel})` : ""} al carrito`;

  return (
    <>
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
            {/* Mobile: native select for compact layout */}
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
            {/* Desktop: button group */}
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

      {/* Price + Add button row (card layout) or full-width button (modal layout) */}
      {layout === "card" ? (
        <div className="flex items-center justify-between gap-2 mt-auto">
          <span className="text-sm sm:text-base font-bold" style={{ color: "var(--store-ink)" }}>
            {formatARS(effectivePrice)}
          </span>
          <button
            onClick={handleAdd}
            disabled={!canAdd}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity${canAdd ? " cursor-pointer hover:opacity-80" : " opacity-40 cursor-not-allowed"}`}
            style={{ background: accentColor, color: "#ffffff" }}
            aria-label={btnAriaLabel}
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            {btnLabel}
          </button>
        </div>
      ) : (
        <button
          onClick={handleAdd}
          disabled={!canAdd}
          className={`w-full rounded-full py-3.5 text-sm font-semibold flex items-center justify-center gap-2 transition-opacity${canAdd ? " cursor-pointer hover:opacity-85" : " opacity-50 cursor-not-allowed"}`}
          style={{ background: accentColor, color: "#ffffff" }}
          aria-label={btnAriaLabel}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {isOutOfStock ? "Sin stock disponible" : btnLabel}
        </button>
      )}
    </>
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
  isHighlighted,
}: {
  product: T;
  accentColor: string;
  onOpenModal: (p: T) => void;
  optionTypes: StorefrontOptionType[];
  variants: StorefrontVariant[];
  priceCents: number;
  isHighlighted?: boolean;
}) {
  const minQty = product.min_quantity ?? 1;
  const step = product.qty_step ?? 1;
  const showMinStepLabel = minQty > 1 || step > 1;
  const minStepLabel = minQty > 1 && step > 1
    ? `Mín. ${minQty}, de a ${step}`
    : minQty > 1
    ? `Mín. ${minQty}`
    : `De a ${step}`;

  // Shared selection state — used by both the image overlay and VariantSelector
  const selectionState = useVariantSelection(optionTypes, variants, priceCents, product.image);
  const { isSelectionComplete, effectiveStock, isOutOfStock } = selectionState;

  const isLowStock =
    isSelectionComplete &&
    effectiveStock !== null &&
    effectiveStock >= 1 &&
    effectiveStock <= 5;

  const displayImage = product.image || PLACEHOLDER_IMAGE;

  return (
    <article
      id={`product-${product.id}`}
      className="store-card flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: "var(--store-surface)",
        border: "1px solid var(--store-border)",
        boxShadow: isHighlighted ? `0 0 0 3px ${accentColor}` : undefined,
        transition: "box-shadow 0.3s ease",
      }}
      aria-label={product.name}
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

        {/* D9: sub-label shown only when there's a restriction */}
        {showMinStepLabel && (
          <p className="text-xs" style={{ color: "var(--store-ink-muted)" }}>
            {minStepLabel}
          </p>
        )}

        <VariantSelector
          product={product}
          accentColor={accentColor}
          optionTypes={optionTypes}
          variants={variants}
          priceCents={priceCents}
          layout="card"
          externalState={selectionState}
        />
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
  isHighlighted,
}: Props<T>) {
  if (!optionTypes || optionTypes.length === 0) {
    return (
      <SimpleProductCard
        product={product}
        accentColor={accentColor}
        onOpenModal={onOpenModal}
        isHighlighted={isHighlighted}
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
      isHighlighted={isHighlighted}
    />
  );
}
