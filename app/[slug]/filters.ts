// ─── Catalog Filters ─────────────────────────────────────────────────────────
// Pure module: no React, no Next.js deps. Safe to import in server and client.

import type { StorefrontVariant, ProductVariantData } from "@/lib/storefront/resolve";

export interface UIProduct {
  id: string;
  sectionId: string;
  name: string;
  description: string;
  price: number; // ARS float (price_cents / 100)
  priceCents: number;
  image: string;
  stock: number | null;
}

export interface CatalogFilters {
  q: string;
  priceMin: number | null; // pesos (entero)
  priceMax: number | null; // pesos (entero)
  sectionIds: string[];
  inStockOnly: boolean;
}

export const DEFAULT_FILTERS: CatalogFilters = {
  q: "",
  priceMin: null,
  priceMax: null,
  sectionIds: [],
  inStockOnly: false,
};

// ─── parse ────────────────────────────────────────────────────────────────────

type SearchParamsLike =
  | URLSearchParams
  | { [k: string]: string | string[] | undefined };

function getFirst(sp: SearchParamsLike, key: string): string | undefined {
  if (sp instanceof URLSearchParams) {
    return sp.get(key) ?? undefined;
  }
  const v = sp[key];
  if (Array.isArray(v)) return v[0];
  return v;
}

export function parseFiltersFromSearchParams(
  sp: SearchParamsLike
): CatalogFilters {
  const q = getFirst(sp, "q") ?? "";

  const minRaw = getFirst(sp, "min");
  const maxRaw = getFirst(sp, "max");
  const priceMin = minRaw && /^\d+$/.test(minRaw) ? parseInt(minRaw, 10) : null;
  const priceMax = maxRaw && /^\d+$/.test(maxRaw) ? parseInt(maxRaw, 10) : null;

  const secRaw = getFirst(sp, "sec");
  const sectionIds =
    secRaw && secRaw.trim().length > 0
      ? secRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const stockRaw = getFirst(sp, "stock");
  const inStockOnly = stockRaw === "1";

  return { q, priceMin, priceMax, sectionIds, inStockOnly };
}

// ─── serialize ────────────────────────────────────────────────────────────────

/** Serialize filters to URLSearchParams, omitting values equal to their defaults. */
export function serializeFiltersToSearchParams(
  f: CatalogFilters
): URLSearchParams {
  const sp = new URLSearchParams();

  if (f.q.trim()) sp.set("q", f.q.trim());
  if (f.priceMin !== null) sp.set("min", String(f.priceMin));
  if (f.priceMax !== null) sp.set("max", String(f.priceMax));
  if (f.sectionIds.length > 0) sp.set("sec", f.sectionIds.join(","));
  if (f.inStockOnly) sp.set("stock", "1");

  return sp;
}

// ─── applyFilters ─────────────────────────────────────────────────────────────

/** Normalize a string for accent- and case-insensitive matching. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Returns the effective price for a product.
 * If the product has variants, uses the minimum variant price.
 * Otherwise uses product.price.
 */
function effectivePrice(
  product: UIProduct,
  variants: StorefrontVariant[]
): number {
  if (variants.length === 0) return product.price;
  const prices = variants
    .filter((v) => v.price_override !== null)
    .map((v) => v.price_override! / 100);
  if (prices.length === 0) return product.price;
  return Math.min(...prices);
}

/**
 * Returns true if a product is "in stock":
 * - If the product has no variant data: stock === null (no tracking) OR stock > 0
 * - If the product has variants: at least one active variant has stock > 0 or stock === null
 */
function isInStock(
  product: UIProduct,
  variantData: ProductVariantData | undefined
): boolean {
  if (!variantData || variantData.variants.length === 0) {
    // Simple product
    return product.stock === null || product.stock > 0;
  }
  // Product with variants — in stock if at least one variant has stock > 0 or null
  return variantData.variants.some(
    (v) => v.stock === null || v.stock > 0
  );
}

export function applyFilters<T extends UIProduct>(
  products: T[],
  variantsByProduct: Record<string, ProductVariantData>,
  f: CatalogFilters
): T[] {
  const q = normalize(f.q.trim());

  return products.filter((p) => {
    // Text filter
    if (q) {
      const inName = normalize(p.name).includes(q);
      const inDesc = normalize(p.description).includes(q);
      if (!inName && !inDesc) return false;
    }

    // Section filter
    if (f.sectionIds.length > 0 && !f.sectionIds.includes(p.sectionId)) {
      return false;
    }

    // Price filter
    const variantData = variantsByProduct[p.id];
    const variants = variantData?.variants ?? [];
    const price = effectivePrice(p, variants);

    if (f.priceMin !== null && price < f.priceMin) return false;
    if (f.priceMax !== null && price > f.priceMax) return false;

    // Stock filter
    if (f.inStockOnly && !isInStock(p, variantData)) return false;

    return true;
  });
}
