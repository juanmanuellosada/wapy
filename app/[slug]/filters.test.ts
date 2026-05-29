// NOTE: No hay test runner configurado en este repo (ni jest ni vitest en
// package.json). Este archivo está escrito con sintaxis de vitest. Para
// ejecutarlo, instalar vitest: `npm install -D vitest` y agregar
// `"test": "vitest"` a los scripts de package.json.

import { describe, it, expect } from "vitest";
import {
  parseFiltersFromSearchParams,
  serializeFiltersToSearchParams,
  applyFilters,
  DEFAULT_FILTERS,
  type UIProduct,
  type CatalogFilters,
} from "./filters";
import type { ProductVariantData } from "@/lib/storefront/resolve";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<UIProduct> = {}): UIProduct {
  return {
    id: "prod-1",
    sectionId: "sec-1",
    name: "Remera básica",
    description: "Algodón 100%",
    price: 5000,
    priceCents: 500000,
    image: "",
    stock: null,
    ...overrides,
  };
}

// ─── round-trip: parse → serialize ───────────────────────────────────────────

describe("parse/serialize round-trip", () => {
  it("returns defaults when no params", () => {
    const result = parseFiltersFromSearchParams(new URLSearchParams(""));
    expect(result).toEqual(DEFAULT_FILTERS);
  });

  it("round-trips a full filter set", () => {
    const original: CatalogFilters = {
      q: "remera",
      priceMin: 5000,
      priceMax: 10000,
      sectionIds: ["sec-a", "sec-b"],
      inStockOnly: true,
    };
    const sp = serializeFiltersToSearchParams(original);
    const parsed = parseFiltersFromSearchParams(sp);
    expect(parsed).toEqual(original);
  });

  it("omits defaults from serialized output", () => {
    const sp = serializeFiltersToSearchParams(DEFAULT_FILTERS);
    expect(sp.toString()).toBe("");
  });

  it("omits stock=0 from URL", () => {
    const filters: CatalogFilters = { ...DEFAULT_FILTERS, inStockOnly: false };
    const sp = serializeFiltersToSearchParams(filters);
    expect(sp.has("stock")).toBe(false);
  });

  it("accepts plain object searchParams (Next.js Server Component shape)", () => {
    const sp = { q: "camiseta", min: "3000", sec: "verano", stock: "1" };
    const result = parseFiltersFromSearchParams(sp);
    expect(result.q).toBe("camiseta");
    expect(result.priceMin).toBe(3000);
    expect(result.sectionIds).toEqual(["verano"]);
    expect(result.inStockOnly).toBe(true);
  });
});

// ─── applyFilters ─────────────────────────────────────────────────────────────

describe("applyFilters", () => {
  const products: UIProduct[] = [
    makeProduct({ id: "p1", name: "Remera azul", price: 5000, stock: 10, sectionId: "sec-a" }),
    makeProduct({ id: "p2", name: "Pantalón verde", price: 12000, stock: 0, sectionId: "sec-b" }),
    makeProduct({ id: "p3", name: "Campera roja", price: 20000, stock: null, sectionId: "sec-a" }),
    makeProduct({ id: "p4", name: "Short gris", price: 4000, stock: 3, sectionId: "sec-b" }),
  ];

  it("returns all products when filters are defaults", () => {
    const result = applyFilters(products, {}, DEFAULT_FILTERS);
    expect(result).toHaveLength(4);
  });

  it("filters by text query (name)", () => {
    const result = applyFilters(products, {}, { ...DEFAULT_FILTERS, q: "remera" });
    expect(result.map((p) => p.id)).toEqual(["p1"]);
  });

  it("filters by section", () => {
    const result = applyFilters(products, {}, { ...DEFAULT_FILTERS, sectionIds: ["sec-b"] });
    expect(result.map((p) => p.id)).toEqual(["p2", "p4"]);
  });

  it("filters by price range", () => {
    const result = applyFilters(products, {}, { ...DEFAULT_FILTERS, priceMin: 5000, priceMax: 15000 });
    expect(result.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("stock=null is treated as available when inStockOnly", () => {
    const result = applyFilters(products, {}, { ...DEFAULT_FILTERS, inStockOnly: true });
    // p1 (stock=10) and p3 (stock=null) and p4 (stock=3) — p2 (stock=0) excluded
    expect(result.map((p) => p.id)).toEqual(["p1", "p3", "p4"]);
  });

  it("product with all variants out of stock is excluded when inStockOnly", () => {
    const variantsByProduct: Record<string, ProductVariantData> = {
      "p1": {
        optionTypes: [],
        variants: [
          { id: "v1", stock: 0, price_override: null, image_url: null, position: 0, optionValues: {} },
          { id: "v2", stock: 0, price_override: null, image_url: null, position: 1, optionValues: {} },
        ],
      },
      "p3": {
        optionTypes: [],
        variants: [
          { id: "v3", stock: null, price_override: null, image_url: null, position: 0, optionValues: {} },
        ],
      },
    };

    const result = applyFilters(
      [products[0], products[2]], // p1 and p3
      variantsByProduct,
      { ...DEFAULT_FILTERS, inStockOnly: true }
    );
    // p1 has all variants out of stock → excluded
    // p3 has a variant with stock=null → included
    expect(result.map((p) => p.id)).toEqual(["p3"]);
  });
});
