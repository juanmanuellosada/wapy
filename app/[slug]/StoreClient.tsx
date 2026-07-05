"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
// Note: hover affordances are CSS-driven via .store-scope rules in globals.css
import {
  ShoppingBag,
  X,
  Plus,
  Minus,
  Trash2,
  ChevronRight,
  Search,
  Sun,
  Moon,
} from "lucide-react";
import type { SocialLinks } from "@/lib/store/social-links";
import { extractSocialHandle } from "@/lib/store/social-links";
import type { StoreRow, SectionRow, ProductRow, ProductVariantData } from "@/lib/storefront/resolve";
import { parseBanner } from "@/lib/store/theme";
import { useCart, cartItemKey } from "./CartContext";
import ProductCardClient, { VariantSelector, useVariantSelection } from "./ProductCardClient";
import WapyFooter from "@/app/components/WapyFooter";
import { createPendingOrder } from "@/lib/store/orders/actions";
import { buildOrderWhatsappMessage } from "@/lib/store/whatsapp/buildMessage";
import { startCheckout } from "@/lib/store/checkout/actions";
import { validateCoupon } from "@/lib/store/coupons/actions";
import { toast } from "@/lib/toast";
import ProductGallery from "./ProductGallery";
import CatalogFiltersUI from "./CatalogFilters";
import type { SectionLite } from "./CatalogFilters";
import {
  type CatalogFilters,
  DEFAULT_FILTERS,
  serializeFiltersToSearchParams,
  applyFilters,
} from "./filters";
import type { UIProduct } from "./types";
import TopSellers from "./TopSellers";
import RelatedProducts from "./RelatedProducts";
import ShareCartButton from "./ShareCartButton";
import { getRelatedProductIds } from "@/lib/storefront/insights";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Inline SVG data URI so we never need a separate asset file. Gray box with
// "Sin imagen" centered — used when a product has no image_urls.
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


function getAccentColor(theme: unknown): string {
  if (
    theme !== null &&
    typeof theme === "object" &&
    "accent_color" in theme &&
    typeof (theme as { accent_color: unknown }).accent_color === "string"
  ) {
    return (theme as { accent_color: string }).accent_color;
  }
  return "#22c55e";
}

function getProductImage(product: ProductRow): string {
  if (product.image_urls && product.image_urls.length > 0) {
    return product.image_urls[0];
  }
  return PLACEHOLDER_IMAGE;
}

// WhatsApp SVG (not in lucide-react)
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// Social media SVGs — lucide-react v1 doesn't include social icons

function InstagramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
  );
}

function FacebookIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function TikTokIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.91a8.16 8.16 0 0 0 4.77 1.52V7a4.85 4.85 0 0 1-1.84-.31z" />
    </svg>
  );
}

function TwitterIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function YoutubeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} aria-hidden>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

// ─── Dark Mode Hook ───────────────────────────────────────────────────────────

function useDarkMode(slug: string) {
  const storageKey = `wapy-theme-${slug}`;
  const scopeId = `store-scope-${slug}`;

  // Read initial theme from the DOM (set by the inline no-flash script)
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document === "undefined") return false;
    const el = document.getElementById(scopeId);
    return el?.getAttribute("data-theme") === "dark";
  });

  const toggle = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      const el = document.getElementById(scopeId);
      if (el) {
        if (next) el.setAttribute("data-theme", "dark");
        else el.removeAttribute("data-theme");
      }
      try {
        localStorage.setItem(storageKey, next ? "dark" : "light");
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, [scopeId, storageKey]);

  return { isDark, toggle };
}

// ─── Checkout idempotency key ────────────────────────────────────────────────
// Generates one key per distinct cart (so a double submit — reload/back/tab
// timeout — of the SAME cart reuses the same key and createPendingOrder just
// returns the existing order instead of duplicating it / re-deducting stock).
// The key changes whenever the cart contents change or after a successful
// checkout. Persisted to localStorage so a reload doesn't lose it.

function cartSignature(items: { productId: string; variantId?: string | null; quantity: number }[]): string {
  return items.map((i) => `${i.productId}:${i.variantId ?? ""}:${i.quantity}`).join("|");
}

function useCheckoutIdempotencyKey(slug: string, signature: string) {
  const storageKey = `wapy-checkout-key-${slug}`;
  const lastSignatureRef = useRef<string | null>(null);

  const [key, setKey] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { signature: string; key: string };
        if (parsed.signature === signature) return parsed.key;
      }
    } catch {
      // Ignore storage errors
    }
    return crypto.randomUUID();
  });

  const persist = useCallback(
    (sig: string, k: string) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ signature: sig, key: k }));
      } catch {
        // Ignore storage errors
      }
    },
    [storageKey]
  );

  // Regenerate the key whenever the cart signature changes (new/removed/changed items).
  useEffect(() => {
    if (lastSignatureRef.current === null) {
      lastSignatureRef.current = signature;
      persist(signature, key);
      return;
    }
    if (lastSignatureRef.current === signature) return;
    lastSignatureRef.current = signature;
    const nextKey = crypto.randomUUID();
    setKey(nextKey);
    persist(signature, nextKey);
    // key intentionally omitted: we only want to react to signature changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, persist]);

  // Call after a successful checkout so a subsequent order for the same cart
  // (e.g. the buyer intentionally orders the same items again) gets a fresh key.
  const regenerate = useCallback(() => {
    const nextKey = crypto.randomUUID();
    setKey(nextKey);
    persist(signature, nextKey);
  }, [signature, persist]);

  return { key, regenerate };
}

// ─── Local types used in cart/UI ─────────────────────────────────────────────

// UIProduct is imported from ./types (shared with TopSellers, RelatedProducts, etc.)

interface UISection {
  id: string;
  name: string;
  parentId: string | null;
}

// ─── Store Header ─────────────────────────────────────────────────────────────

function StoreHeader({
  storeName,
  storeSlug,
  accentColor,
  logoUrl,
  sections,
  searchQuery,
  onSearchChange,
}: {
  storeName: string;
  storeSlug: string;
  accentColor: string;
  logoUrl?: string | null;
  sections: SectionLite[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
}) {
  const { totalItems, openCart } = useCart();
  const { isDark, toggle } = useDarkMode(storeSlug);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const accentForeground = "#ffffff";

  // Auto-focus mobile search input when opened
  useEffect(() => {
    if (mobileSearchOpen) mobileInputRef.current?.focus();
  }, [mobileSearchOpen]);

  // Close mobile search panel when query is cleared externally
  useEffect(() => {
    if (!searchQuery) setMobileSearchOpen(false);
  }, [searchQuery]);

  function clearSearch() {
    onSearchChange("");
    setMobileSearchOpen(false);
  }

  return (
    <header className="sticky top-0 z-40 store-header-bg">
      {/* Main header row */}
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 md:px-8 h-14">
        {/* Logo thumbnail + Store name */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {logoUrl && (
            <Image
              src={logoUrl}
              alt={storeName}
              width={32}
              height={32}
              className="rounded-full shrink-0 object-cover"
              priority
            />
          )}
          <span
            className="text-base font-semibold tracking-tight shrink-0"
            style={{ color: accentColor, fontFamily: "var(--font-rubik, Rubik)" }}
          >
            {storeName}
          </span>
        </div>

        {/* Right controls: search + theme toggle + cart */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Desktop search input (sm+) */}
          <div className="relative hidden sm:flex items-center">
            <Search
              className="absolute left-3 h-3.5 w-3.5 pointer-events-none"
              aria-hidden="true"
              style={{ color: "var(--store-ink-muted)" }}
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar..."
              className="store-search-input pl-8 pr-3 py-1.5 text-sm w-36 focus:w-48 transition-all duration-200"
              aria-label="Buscar productos"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-2 store-icon-btn flex items-center justify-center h-5 w-5 rounded-full cursor-pointer"
                aria-label="Limpiar búsqueda"
                style={{ color: "var(--store-ink-muted)" }}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Mobile search icon button (below sm) */}
          <button
            className="sm:hidden store-theme-btn flex h-9 w-9 items-center justify-center rounded-full cursor-pointer transition-colors"
            style={{ color: (mobileSearchOpen || searchQuery) ? "var(--store-ink)" : "var(--store-ink-secondary)" }}
            onClick={() => setMobileSearchOpen((v) => !v)}
            aria-label={mobileSearchOpen ? "Cerrar búsqueda" : "Buscar productos"}
            aria-expanded={mobileSearchOpen}
            aria-controls="mobile-search-bar"
          >
            {mobileSearchOpen ? (
              <X className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Search className="h-4 w-4" aria-hidden="true" />
            )}
          </button>

          {/* Dark mode toggle */}
          <button
            onClick={toggle}
            className="store-theme-btn flex h-9 w-9 items-center justify-center rounded-full cursor-pointer transition-colors"
            style={{ color: "var(--store-ink-secondary)" }}
            aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            aria-pressed={isDark}
          >
            {isDark ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>

          {/* Cart button */}
          <button
            onClick={openCart}
            className="relative flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-opacity hover:opacity-80 cursor-pointer shrink-0"
            style={{
              background: accentColor,
              color: accentForeground,
            }}
            aria-label={`Carrito${totalItems > 0 ? `, ${totalItems} producto${totalItems !== 1 ? "s" : ""}` : ""}`}
          >
            <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline text-sm">Carrito</span>
            {totalItems > 0 && (
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: "rgba(255,255,255,0.25)", color: accentForeground }}
                aria-hidden="true"
              >
                {totalItems}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Desktop section nav — second row (lg+), wraps if many sections */}
      {sections.length > 0 && (
        <div className="hidden lg:flex mx-auto max-w-6xl px-4 sm:px-6 md:px-8 pb-2">
          <nav
            className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1.5 w-full"
            aria-label="Secciones de la tienda"
          >
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="store-nav-link px-3 py-1.5 text-sm font-medium rounded-full transition-colors cursor-pointer"
                style={{ color: "var(--store-ink-secondary)" }}
              >
                {s.name}
              </a>
            ))}
          </nav>
        </div>
      )}

      {/* Mobile secondary row: section nav + optional search bar */}
      <div className="lg:hidden">
        {/* Mobile search bar — shown when toggled */}
        {mobileSearchOpen && (
          <div id="mobile-search-bar" className="px-4 pb-2">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
                aria-hidden="true"
                style={{ color: "var(--store-ink-muted)" }}
              />
              <input
                ref={mobileInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Buscar productos..."
                className="store-search-input w-full pl-9 pr-9 py-2 text-sm"
                aria-label="Buscar productos"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 store-icon-btn flex items-center justify-center h-6 w-6 rounded-full cursor-pointer"
                  aria-label="Limpiar búsqueda"
                  style={{ color: "var(--store-ink-muted)" }}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Mobile section nav */}
        <div
          className="flex gap-1.5 overflow-x-auto px-4 pb-3 scrollbar-none"
          style={{ scrollbarWidth: "none" }}
          role="navigation"
          aria-label="Secciones"
        >
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="shrink-0 px-3 py-1 text-xs font-medium rounded-full cursor-pointer whitespace-nowrap"
              style={{
                background: "var(--store-border)",
                color: "var(--store-ink-secondary)",
              }}
            >
              {s.name}
            </a>
          ))}
        </div>
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function StoreHero({
  name,
  description,
  accentColor,
  logoUrl,
  socialLinks,
  banner,
}: {
  name: string;
  description: string | null;
  accentColor: string;
  logoUrl?: string | null;
  socialLinks?: SocialLinks;
  banner?: { type: 'color' | 'image'; value: string } | null;
}) {
  const socialNetworks: Array<{
    key: keyof SocialLinks;
    url?: string | null;
    renderIcon: () => React.ReactNode;
    label: string;
  }> = socialLinks
    ? [
        { key: "instagram" as const, url: socialLinks.instagram, renderIcon: () => <InstagramIcon size={18} />, label: "Instagram" },
        { key: "facebook"  as const, url: socialLinks.facebook,  renderIcon: () => <FacebookIcon  size={18} />, label: "Facebook"  },
        { key: "tiktok"    as const, url: socialLinks.tiktok,    renderIcon: () => <TikTokIcon    size={18} />, label: "TikTok"    },
        { key: "twitter"   as const, url: socialLinks.twitter,   renderIcon: () => <TwitterIcon   size={18} />, label: "Twitter"   },
        { key: "youtube"   as const, url: socialLinks.youtube,   renderIcon: () => <YoutubeIcon   size={18} />, label: "YouTube"   },
      ].filter((s) => s.url && s.url !== "")
    : [];

  return (
    <section
      style={{ background: "var(--store-surface)" }}
      aria-label="Presentación de la tienda"
    >
      {banner ? (
        <>
          {/* Banner + overlapping logo */}
          <div className="relative w-full">
            <div className="aspect-[3/1] sm:aspect-[4/1] w-full">
              {banner.type === 'color' ? (
                <div className="w-full h-full" style={{ backgroundColor: banner.value }} />
              ) : (
                <Image
                  src={banner.value}
                  alt=""
                  fill
                  className="object-cover"
                  priority
                />
              )}
            </div>
            {logoUrl && (
              <div className="absolute inset-x-0 bottom-0 px-4 sm:px-6 md:px-8">
                <div className="relative mx-auto max-w-6xl">
                  <div className="absolute bottom-0 left-0 translate-y-1/2">
                    <div className="h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24">
                      <Image
                        src={logoUrl}
                        alt={name}
                        width={96}
                        height={96}
                        className="rounded-full object-cover w-full h-full"
                        style={{
                          outline: `3px solid ${accentColor}`,
                          outlineOffset: 2,
                        }}
                        priority
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Text block — padded top so it clears the overlapping logo */}
          <div className={`px-4 sm:px-6 md:px-8 pb-16 sm:pb-24 ${logoUrl ? 'pt-12 sm:pt-14 md:pt-16' : 'pt-8'}`}>
            <div className="mx-auto max-w-6xl flex flex-col gap-3">
              <p
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: accentColor }}
              >
                Tienda online
              </p>
              <h1
                className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-none"
                style={{ color: "var(--store-ink)", fontFamily: "var(--font-rubik, Rubik)" }}
              >
                {name}
              </h1>
              {description && (
                <p
                  className="text-base sm:text-lg max-w-md mt-1"
                  style={{ color: "var(--store-ink-secondary)" }}
                >
                  {description}
                </p>
              )}
              {socialNetworks.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
                  {socialNetworks.map((s) => {
                    const handle = extractSocialHandle(s.key, s.url!);
                    return (
                      <a
                        key={s.key}
                        href={s.url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={s.label}
                        className="inline-flex items-center gap-1.5 transition-opacity hover:opacity-80"
                        style={{ color: "var(--store-ink-secondary)" }}
                      >
                        {s.renderIcon()}
                        {handle && (
                          <span className="text-sm">@{handle}</span>
                        )}
                      </a>
                    );
                  })}
                </div>
              )}
              <div
                className="mt-6 h-px w-16"
                style={{ background: accentColor, opacity: 0.6 }}
                aria-hidden="true"
              />
            </div>
          </div>
        </>
      ) : (
        /* Original layout — no banner */
        <div className="py-16 sm:py-24 px-4 sm:px-6 md:px-8">
          <div className="mx-auto max-w-6xl flex flex-col gap-3">
            {logoUrl && (
              <Image
                src={logoUrl}
                alt={name}
                width={96}
                height={96}
                className="rounded-full object-cover mb-2"
                style={{
                  outline: `3px solid ${accentColor}`,
                  outlineOffset: 2,
                }}
                priority
              />
            )}
            <p
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: accentColor }}
            >
              Tienda online
            </p>
            <h1
              className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-none"
              style={{ color: "var(--store-ink)", fontFamily: "var(--font-rubik, Rubik)" }}
            >
              {name}
            </h1>
            {description && (
              <p
                className="text-base sm:text-lg max-w-md mt-1"
                style={{ color: "var(--store-ink-secondary)" }}
              >
                {description}
              </p>
            )}
            {socialNetworks.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
                {socialNetworks.map((s) => {
                  const handle = extractSocialHandle(s.key, s.url!);
                  return (
                    <a
                      key={s.key}
                      href={s.url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={s.label}
                      className="inline-flex items-center gap-1.5 transition-opacity hover:opacity-80"
                      style={{ color: "var(--store-ink-secondary)" }}
                    >
                      {s.renderIcon()}
                      {handle && (
                        <span className="text-sm">@{handle}</span>
                      )}
                    </a>
                  );
                })}
              </div>
            )}
            <div
              className="mt-6 h-px w-16"
              style={{ background: accentColor, opacity: 0.6 }}
              aria-hidden="true"
            />
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────
// Thin wrapper that delegates to the client component; keeps SectionBlock /
// SearchResults call-sites unchanged.

function ProductCard({
  product,
  accentColor,
  onOpenModal,
  variantData,
  isHighlighted,
}: {
  product: UIProduct;
  accentColor: string;
  onOpenModal: (p: UIProduct) => void;
  variantData?: ProductVariantData;
  isHighlighted?: boolean;
}) {
  return (
    <ProductCardClient
      product={product}
      accentColor={accentColor}
      onOpenModal={onOpenModal}
      optionTypes={variantData?.optionTypes}
      variants={variantData?.variants}
      priceCents={product.priceCents}
      isHighlighted={isHighlighted}
    />
  );
}

// ─── Product Modal ────────────────────────────────────────────────────────────

function ProductModal({
  product,
  accentColor,
  onClose,
  variantData,
  relatedSlot,
}: {
  product: UIProduct;
  accentColor: string;
  onClose: () => void;
  variantData?: ProductVariantData;
  relatedSlot?: React.ReactNode;
}) {
  const { addItem, setQty, items, openCart } = useCart();
  const overlayRef = useRef<HTMLDivElement>(null);
  const accentForeground = "#ffffff";

  const minQty = product.min_quantity ?? 1;
  const step = product.qty_step ?? 1;

  // Lifted variant selection state — shared by the header price (tachado/promo,
  // reactive to the active variant) and the VariantSelector's add-to-cart flow,
  // so the price shown and the price charged can never diverge. Works for
  // simple products too: with no option types, activeVariant stays null and
  // resolveEffectivePrice falls back to the product-level promo.
  const variantSelection = useVariantSelection(
    variantData?.optionTypes ?? [],
    variantData?.variants ?? [],
    product.priceCents,
    product.image,
    product.promoPriceCents
  );
  const { regularPrice, effectivePrice, onPromo } = variantSelection;

  // For modal: simple product (no variant), key is just the productId
  const itemKey = cartItemKey(product.id, null);
  const existingItem = items.find((i) => cartItemKey(i.productId, i.variantId) === itemKey);
  const existingQty = existingItem?.quantity ?? 0;

  // Initial qty: min_quantity when cart is empty for this product, qty_step otherwise (D5)
  const [qty, setLocalQty] = useState(() => existingQty === 0 ? minQty : step);

  // Reset qty selector whenever the displayed product changes (e.g. clicking a related product)
  useEffect(() => {
    const currentExisting = items.find((i) => cartItemKey(i.productId, i.variantId) === cartItemKey(product.id, null));
    const currentExistingQty = currentExisting?.quantity ?? 0;
    setLocalQty(currentExistingQty === 0 ? minQty : step);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  const isOutOfStock = product.stock === 0;
  // availableToAdd: how many more units the user can add (null = unlimited)
  const availableToAdd = product.stock !== null ? Math.max(0, product.stock - existingQty) : null;
  // qty is invalid if adding it would leave the total below min_quantity
  const wouldBeBelowMin = existingQty + qty < minQty;
  // qty is invalid if it's not a multiple of step
  const isNotMultipleOfStep = qty % step !== 0;
  const canAdd = !isOutOfStock && (availableToAdd === null || availableToAdd > 0) && !wouldBeBelowMin && !isNotMultipleOfStep;

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  function handleIncrease() {
    if (availableToAdd !== null && qty + step > availableToAdd) {
      toast.info(`Solo quedan ${product.stock} unidades disponibles`);
      return;
    }
    setLocalQty(qty + step);
  }

  function handleDecrease() {
    const next = qty - step;
    if (next < step) return; // don't go below one step in the modal
    setLocalQty(next);
  }

  function handleAdd() {
    if (isOutOfStock) return;
    // Check total (existing + new qty) against stock
    if (product.stock !== null && existingQty + qty > product.stock) {
      toast.info(`Solo quedan ${product.stock} unidades disponibles`);
      return;
    }
    if (existingItem) {
      setQty(itemKey, existingItem.quantity + qty);
    } else {
      addItem({
        productId: product.id,
        name: product.name,
        price: effectivePrice,
        image: product.image,
      });
      if (qty > 1) {
        setQty(itemKey, qty);
      }
    }
    openCart();
    onClose();
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 store-modal-backdrop"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
    >
      <div
        className="relative w-full sm:max-w-xl sm:rounded-2xl overflow-hidden flex flex-col store-modal-enter"
        style={{
          background: "var(--store-surface)",
          maxHeight: "90dvh",
          boxShadow: "var(--store-shadow-lg)",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="store-modal-close absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full cursor-pointer transition-colors"
          style={{ background: "rgba(0,0,0,0.18)", color: "#fff" }}
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        {/* Image / Gallery */}
        <div
          className="w-full shrink-0"
          style={{
            // Single image: relative + aspectRatio so <Image fill> works.
            // Multi-image: gallery manages its own layout (aspect ratio on slides).
            position: product.imageUrls.length <= 1 ? "relative" : undefined,
            aspectRatio: product.imageUrls.length <= 1 ? "4/3" : undefined,
            background: "var(--store-border)",
          }}
        >
          <ProductGallery
            imageUrls={product.imageUrls}
            alt={product.name}
            accentColor={accentColor}
          />
        </div>

        {/* Content */}
        <div className="flex flex-col gap-4 p-5 sm:p-6 overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            <h2
              className="text-xl sm:text-2xl font-bold leading-tight"
              style={{ color: "var(--store-ink)", fontFamily: "var(--font-rubik, Rubik)" }}
            >
              {product.name}
            </h2>
            <div className="flex items-baseline gap-2 flex-wrap">
              {onPromo && (
                <span className="text-base font-medium line-through" style={{ color: "var(--store-ink-muted)" }}>
                  {formatARS(regularPrice)}
                </span>
              )}
              <p className="text-2xl font-bold" style={{ color: accentColor }}>
                {formatARS(effectivePrice)}
              </p>
            </div>
          </div>

          {product.description && (
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--store-ink-secondary)" }}
            >
              {product.description}
            </p>
          )}

          {/* Sub-label for min/step restrictions (D9) */}
          {(minQty > 1 || step > 1) && (
            <p className="text-xs" style={{ color: "var(--store-ink-muted)" }}>
              {minQty > 1 && step > 1
                ? `Mín. ${minQty}, de a ${step}`
                : minQty > 1
                ? `Mín. ${minQty}`
                : `De a ${step}`}
            </p>
          )}

          {/* Quantity selector — hidden when out of stock or when product has variants */}
          {!isOutOfStock && !(variantData && variantData.optionTypes.length > 0) && (
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium" style={{ color: "var(--store-ink)" }}>
                Cantidad
              </span>
              <div
                className="flex items-center gap-0 rounded-full overflow-hidden"
                style={{ border: "1px solid var(--store-border-strong)" }}
              >
                <button
                  onClick={handleDecrease}
                  disabled={qty <= step}
                  className={`store-icon-btn flex h-10 w-10 items-center justify-center transition-colors${qty <= step ? " opacity-40 cursor-not-allowed" : " cursor-pointer"}`}
                  style={{ color: "var(--store-ink)" }}
                  aria-label="Reducir cantidad"
                >
                  <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <span
                  className="w-8 text-center text-sm font-semibold select-none"
                  style={{ color: "var(--store-ink)" }}
                  aria-live="polite"
                  aria-label={`Cantidad: ${qty}`}
                >
                  {qty}
                </span>
                <button
                  onClick={handleIncrease}
                  disabled={availableToAdd !== null && qty + step > availableToAdd}
                  className={`store-icon-btn flex h-10 w-10 items-center justify-center transition-colors${availableToAdd !== null && qty + step > availableToAdd ? " opacity-40 cursor-not-allowed" : " cursor-pointer"}`}
                  style={{ color: "var(--store-ink)" }}
                  aria-label="Aumentar cantidad"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              {availableToAdd !== null && availableToAdd <= 5 && availableToAdd > 0 && (
                <span className="text-xs" style={{ color: "var(--store-ink-muted)" }}>
                  Quedan {availableToAdd}
                </span>
              )}
            </div>
          )}

          {variantData && variantData.optionTypes.length > 0 ? (
            <VariantSelector
              product={{
                id: product.id,
                name: product.name,
                image: product.image,
                min_quantity: product.min_quantity ?? 1,
                qty_step: product.qty_step ?? 1,
              }}
              accentColor={accentColor}
              optionTypes={variantData.optionTypes}
              variants={variantData.variants}
              priceCents={product.priceCents}
              promoPriceCents={product.promoPriceCents}
              layout="modal"
              externalState={variantSelection}
            />
          ) : (
            <button
              onClick={handleAdd}
              disabled={!canAdd}
              className={`w-full rounded-full py-3.5 text-sm font-semibold flex items-center justify-center gap-2 transition-opacity${canAdd ? " cursor-pointer hover:opacity-85" : " opacity-50 cursor-not-allowed"}`}
              style={{ background: accentColor, color: accentForeground }}
              title={wouldBeBelowMin ? `Mín. ${minQty} para agregar` : isNotMultipleOfStep ? `Debe ser múltiplo de ${step}` : undefined}
            >
              <ShoppingBag className="h-4 w-4" aria-hidden="true" />
              {isOutOfStock
                ? "Sin stock disponible"
                : wouldBeBelowMin
                ? `Mín. ${minQty} para agregar`
                : "Agregar al carrito"}
            </button>
          )}

          {/* Slot for related products — filled by wapy-storefront-growth */}
          {relatedSlot}
        </div>
      </div>
    </div>
  );
}

// ─── Cart Drawer ──────────────────────────────────────────────────────────────

interface BuyerForm {
  name: string;
  email: string;
  phone: string;
  address: string;
}

const EMPTY_BUYER: BuyerForm = { name: "", email: "", phone: "", address: "" };

function CartDrawer({
  storeId,
  storeName,
  storeSlug,
  accentColor,
  whatsappNumber,
  productStockMap,
  productMinStepMap,
  checkoutMode,
  mpConnected,
}: {
  storeId: string;
  storeName: string;
  storeSlug: string;
  accentColor: string;
  whatsappNumber: string | null;
  productStockMap: Map<string, number | null>;
  productMinStepMap: Map<string, { min_quantity: number; qty_step: number }>;
  checkoutMode: "whatsapp" | "mercadopago";
  mpConnected: boolean;
}) {
  const { items, open, totalPrice, appliedCoupon, discountAmount, finalTotal, removeItem, setQty, closeCart, applyCoupon, removeCoupon } = useCart();
  const [couponInput, setCouponInput] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  // Idempotency (#6): one key per distinct cart, reused on double submit,
  // regenerated on cart change or after a successful checkout.
  const { key: idempotencyKey, regenerate: regenerateIdempotencyKey } = useCheckoutIdempotencyKey(
    storeSlug,
    cartSignature(items)
  );
  // task 5.4, 5.5: MP checkout step state
  const isMpMode = checkoutMode === "mercadopago" && mpConnected;
  const [checkoutStep, setCheckoutStep] = useState<"cart" | "form">("cart");
  const [buyerForm, setBuyerForm] = useState<BuyerForm>(EMPTY_BUYER);
  const [buyerErrors, setBuyerErrors] = useState<Partial<Record<keyof BuyerForm, string>>>({});
  const [mpLoading, setMpLoading] = useState(false);
  const [mpError, setMpError] = useState<string | null>(null);
  const accentForeground = "#ffffff";

  // Items where quantity exceeds current stock (stock !== null only).
  // For variant items, use the composite key productId::variantId for accurate stock.
  const overStockedItems = items.filter((item) => {
    const key = item.variantId ? `${item.productId}::${item.variantId}` : item.productId;
    const stock = productStockMap.get(key) ?? productStockMap.get(item.productId);
    return stock !== undefined && stock !== null && item.quantity > stock;
  });
  const hasStockIssues = overStockedItems.length > 0;

  async function handleWhatsApp() {
    if (!whatsappNumber) return;

    // B3: block checkout if any cart item exceeds available stock
    if (hasStockIssues) {
      const names = overStockedItems.map((i) => i.name).join(", ");
      toast.error(`Hay productos sin stock suficiente: ${names}. Revisá tu carrito.`);
      return;
    }

    // D3: client-side pre-validation of min_quantity and qty_step (grouped by product_id)
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
        toast.error(`Necesitás al menos ${min_quantity} unidades de '${productName}' para comprar.`);
        return;
      }
      if (qty_step > 1 && totalQty % qty_step !== 0) {
        const productName = items.find((i) => i.productId === productId)?.name ?? productId;
        toast.error(`La cantidad de '${productName}' debe ser múltiplo de ${qty_step}.`);
        return;
      }
    }

    const lines = items.map((i) => {
      const displayPrice = i.variantPrice ?? i.price;
      const label = i.variantLabel ? ` (${i.variantLabel})` : "";
      return `• ${i.quantity}x ${i.name}${label} — ${formatARS(displayPrice * i.quantity)}`;
    });

    let orderRef: string | null = null;
    try {
      const result = await createPendingOrder({
        store_id: storeId,
        items: items.map((i) => ({ product_id: i.productId, quantity: i.quantity, variant_id: i.variantId ?? null })),
        coupon_code: appliedCoupon?.code ?? null,
        discount_amount: appliedCoupon ? discountAmount : null,
        idempotency_key: idempotencyKey,
      });
      if ('order_id' in result) {
        orderRef = result.order_id.slice(0, 8);
        // Fresh key for a possible next order with the same cart contents.
        regenerateIdempotencyKey();
      } else if ('error' in result && result.error === 'stock_insufficient') {
        toast.error("Algunos productos ya no tienen stock suficiente. Revisá tu carrito.");
        return;
      } else if ('error' in result && result.error === 'qty_violation') {
        const v = result as { error: 'qty_violation'; productName: string; min: number; step: number };
        toast.error(`Necesitás al menos ${v.min} unidades de '${v.productName}' para comprar.`);
        return;
      }
    } catch {
      // silencioso, abrir wa.me igual
    }

    const message = buildOrderWhatsappMessage({
      storeName,
      lines,
      couponCode: appliedCoupon?.code ?? null,
      discountAmount: appliedCoupon && discountAmount > 0 ? discountAmount : null,
      total: appliedCoupon && discountAmount > 0 ? finalTotal : totalPrice,
      orderRef,
    });

    const normalized = whatsappNumber.replace(/\D/g, "");
    const text = encodeURIComponent(message);
    window.open(`https://wa.me/${normalized}?text=${text}`, "_blank");
  }

  async function handleApplyCoupon() {
    const trimmed = couponInput.trim();
    if (!trimmed) return;
    setCouponLoading(true);
    setCouponError(null);
    try {
      const result = await validateCoupon({ storeId, code: trimmed, cartTotal: totalPrice });
      if ('error' in result) {
        setCouponError(result.error);
      } else {
        applyCoupon(result.coupon);
        setCouponInput('');
        setCouponError(null);
      }
    } catch {
      setCouponError('No se pudo validar el cupón. Intentá de nuevo.');
    }
    setCouponLoading(false);
  }

  // task 5.4: validate buyer form fields client-side before submitting
  function validateBuyerForm(): boolean {
    const errs: Partial<Record<keyof BuyerForm, string>> = {};
    if (buyerForm.name.trim().length < 2) errs.name = "El nombre debe tener al menos 2 caracteres";
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(buyerForm.email.trim())) errs.email = "Email inválido";
    const phoneRe = /^[0-9+\-\s()]+$/;
    const trimmedPhone = buyerForm.phone.trim();
    if (trimmedPhone !== '' && (trimmedPhone.length < 7 || !phoneRe.test(trimmedPhone))) errs.phone = "Teléfono inválido";
    const trimmedAddress = buyerForm.address.trim();
    if (trimmedAddress !== '' && trimmedAddress.length < 5) errs.address = "La dirección debe tener al menos 5 caracteres";
    setBuyerErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // task 5.7: submit buyer form → call startCheckout → redirect to initPoint
  async function handleMpCheckout() {
    if (!validateBuyerForm()) return;
    setMpLoading(true);
    setMpError(null);
    try {
      const result = await startCheckout({
        slug: storeSlug,
        cart: items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId ?? null,
          quantity: i.quantity,
        })),
        buyer: {
          name: buyerForm.name.trim(),
          email: buyerForm.email.trim(),
          phone: buyerForm.phone.trim(),
          address: buyerForm.address.trim(),
        },
        // Only the code is sent — the server re-validates against DB prices.
        couponCode: appliedCoupon?.code ?? null,
        idempotencyKey,
      });
      if ("error" in result) {
        setMpError(result.error);
        setMpLoading(false);
        return;
      }
      // Fresh key for a possible next order with the same cart contents.
      regenerateIdempotencyKey();
      // task 5.7: redirect browser to Mercado Pago checkout
      window.location.href = result.initPoint;
    } catch {
      setMpError("Error inesperado. Intentá de nuevo.");
      setMpLoading(false);
    }
  }

  // Reset MP step when drawer closes
  function handleCloseCart() {
    closeCart();
    setCheckoutStep("cart");
    setBuyerErrors({});
    setMpError(null);
  }

  // Prevent body scroll when open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={handleCloseCart}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 z-50 h-full w-full max-w-xs sm:max-w-sm flex flex-col"
        style={{
          background: "var(--store-surface)",
          boxShadow: open ? "var(--store-shadow-lg)" : "none",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Carrito de compras"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--store-border)" }}
        >
          <div className="flex items-center gap-2">
            <ShoppingBag
              className="h-4 w-4"
              aria-hidden="true"
              style={{ color: accentColor }}
            />
            <h2
              className="text-base font-semibold"
              style={{ color: "var(--store-ink)" }}
            >
              Tu carrito
            </h2>
          </div>
          <button
            onClick={handleCloseCart}
            className="store-icon-btn flex h-9 w-9 items-center justify-center rounded-full cursor-pointer transition-colors"
            style={{ color: "var(--store-ink-secondary)" }}
            aria-label="Cerrar carrito"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full"
                style={{ background: "var(--store-border)" }}
              >
                <ShoppingBag
                  className="h-7 w-7"
                  aria-hidden="true"
                  style={{ color: "var(--store-ink-muted)" }}
                />
              </div>
              <p
                className="font-medium text-sm"
                style={{ color: "var(--store-ink)" }}
              >
                Tu carrito está vacío
              </p>
              <p className="text-xs" style={{ color: "var(--store-ink-muted)" }}>
                Explorá los productos y elegí los que más te gusten
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-4" aria-label="Productos en el carrito">
              {items.map((item) => {
                const key = cartItemKey(item.productId, item.variantId);
                const stockKey = item.variantId ? `${item.productId}::${item.variantId}` : item.productId;
                const itemStock = productStockMap.get(stockKey) ?? productStockMap.get(item.productId);
                const isOverStock = itemStock !== undefined && itemStock !== null && item.quantity > itemStock;
                // For display: use variantPrice if set, else item.price
                const displayPrice = item.variantPrice ?? item.price;
                // For image: use variantImageUrl if set, else item.image
                const displayImage = item.variantImageUrl ?? item.image;

                // D6: step controls
                const productRules = productMinStepMap.get(item.productId);
                const itemStep = productRules?.qty_step ?? 1;
                // "-" becomes "Quitar" when decrementing would leave qty < itemStep
                const decrementWouldRemove = item.quantity - itemStep < itemStep;

                return (
                  <li
                    key={key}
                    className="flex gap-3 items-start"
                    style={{ paddingBottom: "1rem", borderBottom: "1px solid var(--store-border)" }}
                  >
                    {/* Thumbnail */}
                    <div
                      className="relative h-16 w-16 rounded-xl overflow-hidden shrink-0"
                      style={{ background: "var(--store-border)" }}
                    >
                        <Image
                        src={displayImage}
                        alt={item.name}
                        fill
                        sizes="64px"
                        className="object-cover"
                        unoptimized={displayImage.startsWith("data:")}
                      />
                    </div>

                    {/* Info + controls */}
                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      <p
                        className="text-sm font-semibold leading-snug truncate"
                        style={{ color: "var(--store-ink)" }}
                      >
                        {item.name}
                      </p>
                      {/* 6.1 Show variant label under product name */}
                      {item.variantLabel && (
                        <p className="text-xs" style={{ color: "var(--store-ink-secondary)" }}>
                          {item.variantLabel}
                        </p>
                      )}
                      <p className="text-xs" style={{ color: "var(--store-ink-muted)" }}>
                        {formatARS(displayPrice)} / u
                      </p>
                      {isOverStock && (
                        <p className="text-xs font-medium text-red-400">
                          Solo quedan {itemStock} unidades
                        </p>
                      )}

                      {/* Quantity controls */}
                      <div className="flex items-center gap-2 mt-0.5">
                        <div
                          className="flex items-center rounded-full overflow-hidden"
                          style={{ border: `1px solid ${isOverStock ? "rgba(248,113,113,0.5)" : "var(--store-border-strong)"}` }}
                        >
                          {/* D6: "-" transforms into "Quitar" when decrement would remove */}
                          {decrementWouldRemove ? (
                            <button
                              onClick={() => removeItem(key)}
                              className="store-icon-btn flex h-7 items-center justify-center cursor-pointer transition-colors px-2"
                              style={{ color: "var(--store-ink-muted)" }}
                              aria-label={`Quitar ${item.name} del carrito`}
                            >
                              <span className="text-xs font-medium">Quitar</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => setQty(key, item.quantity - itemStep)}
                              className="store-icon-btn flex h-7 w-7 items-center justify-center cursor-pointer transition-colors"
                              style={{ color: "var(--store-ink)" }}
                              aria-label={`Reducir cantidad de ${item.name}`}
                            >
                              <Minus className="h-3 w-3" aria-hidden="true" />
                            </button>
                          )}
                          <span
                            className="w-6 text-center text-xs font-semibold select-none"
                            style={{ color: isOverStock ? "rgb(248,113,113)" : "var(--store-ink)" }}
                          >
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => setQty(key, item.quantity + itemStep)}
                            className="store-icon-btn flex h-7 w-7 items-center justify-center cursor-pointer transition-colors"
                            style={{ color: "var(--store-ink)" }}
                            aria-label={`Aumentar cantidad de ${item.name}`}
                          >
                            <Plus className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </div>

                        <button
                          onClick={() => removeItem(key)}
                          className="store-remove-btn flex items-center justify-center h-7 w-7 rounded-full cursor-pointer transition-colors"
                          style={{ color: "var(--store-ink-muted)" }}
                          aria-label={`Eliminar ${item.name} del carrito`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {/* Line total */}
                    <p
                      className="text-sm font-bold shrink-0"
                      style={{ color: "var(--store-ink)" }}
                    >
                      {formatARS(displayPrice * item.quantity)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer — only when items exist */}
        {items.length > 0 && (
          <div
            className="px-5 py-4 flex flex-col gap-3"
            style={{ borderTop: "1px solid var(--store-border)" }}
          >
            {/* task 5.4: MP buyer form step — shown only in MP mode after pressing "Pagar" */}
            {isMpMode && checkoutStep === "form" ? (
              <>
                {/* Back link */}
                <button
                  type="button"
                  onClick={() => { setCheckoutStep("cart"); setBuyerErrors({}); setMpError(null); }}
                  className="flex items-center gap-1 text-xs cursor-pointer"
                  style={{ color: "var(--store-ink-secondary)" }}
                >
                  <ChevronRight className="h-3 w-3 rotate-180" aria-hidden="true" />
                  Volver al carrito
                </button>

                <p className="text-sm font-semibold" style={{ color: "var(--store-ink)" }}>
                  Tus datos de contacto
                </p>

                {/* Name */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: "var(--store-ink-secondary)" }}>
                    Nombre y apellido <span aria-hidden>*</span>
                  </label>
                  <input
                    type="text"
                    value={buyerForm.name}
                    onChange={(e) => { setBuyerForm((p) => ({ ...p, name: e.target.value })); setBuyerErrors((p) => ({ ...p, name: undefined })); }}
                    placeholder="Juan Pérez"
                    maxLength={120}
                    className="rounded-xl px-3 py-2 text-sm focus:outline-none"
                    style={{
                      background: "var(--store-border)",
                      color: "var(--store-ink)",
                      border: `1px solid ${buyerErrors.name ? "rgba(248,113,113,0.8)" : "var(--store-border-strong)"}`,
                    }}
                  />
                  {buyerErrors.name && <p className="text-xs text-red-400">{buyerErrors.name}</p>}
                </div>

                {/* Email */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: "var(--store-ink-secondary)" }}>
                    Email <span aria-hidden>*</span>
                  </label>
                  <input
                    type="email"
                    value={buyerForm.email}
                    onChange={(e) => { setBuyerForm((p) => ({ ...p, email: e.target.value })); setBuyerErrors((p) => ({ ...p, email: undefined })); }}
                    placeholder="juan@ejemplo.com"
                    maxLength={200}
                    className="rounded-xl px-3 py-2 text-sm focus:outline-none"
                    style={{
                      background: "var(--store-border)",
                      color: "var(--store-ink)",
                      border: `1px solid ${buyerErrors.email ? "rgba(248,113,113,0.8)" : "var(--store-border-strong)"}`,
                    }}
                  />
                  {buyerErrors.email && <p className="text-xs text-red-400">{buyerErrors.email}</p>}
                </div>

                {/* Phone */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: "var(--store-ink-secondary)" }}>
                    Teléfono <span style={{ fontWeight: 400, opacity: 0.6 }}>(opcional)</span>
                  </label>
                  <input
                    type="tel"
                    value={buyerForm.phone}
                    onChange={(e) => { setBuyerForm((p) => ({ ...p, phone: e.target.value })); setBuyerErrors((p) => ({ ...p, phone: undefined })); }}
                    placeholder="+54 9 11 1234-5678"
                    maxLength={30}
                    className="rounded-xl px-3 py-2 text-sm focus:outline-none"
                    style={{
                      background: "var(--store-border)",
                      color: "var(--store-ink)",
                      border: `1px solid ${buyerErrors.phone ? "rgba(248,113,113,0.8)" : "var(--store-border-strong)"}`,
                    }}
                  />
                  {buyerErrors.phone && <p className="text-xs text-red-400">{buyerErrors.phone}</p>}
                </div>

                {/* Address */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: "var(--store-ink-secondary)" }}>
                    Dirección de entrega <span style={{ fontWeight: 400, opacity: 0.6 }}>(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={buyerForm.address}
                    onChange={(e) => { setBuyerForm((p) => ({ ...p, address: e.target.value })); setBuyerErrors((p) => ({ ...p, address: undefined })); }}
                    placeholder="Av. Corrientes 1234, CABA"
                    maxLength={300}
                    className="rounded-xl px-3 py-2 text-sm focus:outline-none"
                    style={{
                      background: "var(--store-border)",
                      color: "var(--store-ink)",
                      border: `1px solid ${buyerErrors.address ? "rgba(248,113,113,0.8)" : "var(--store-border-strong)"}`,
                    }}
                  />
                  {buyerErrors.address && <p className="text-xs text-red-400">{buyerErrors.address}</p>}
                </div>

                {/* Total summary */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: "var(--store-ink-secondary)" }}>Total</span>
                  <span className="text-xl font-bold" style={{ color: "var(--store-ink)" }}>
                    {formatARS(appliedCoupon && discountAmount > 0 ? finalTotal : totalPrice)}
                  </span>
                </div>

                {/* Error message */}
                {mpError && (
                  <p className="text-xs text-red-400 text-center">{mpError}</p>
                )}

                {/* Confirm payment button */}
                <button
                  type="button"
                  onClick={handleMpCheckout}
                  disabled={mpLoading}
                  className={`w-full rounded-full py-4 text-sm font-semibold flex items-center justify-center gap-2.5 transition-opacity${mpLoading ? " opacity-60 cursor-not-allowed" : " cursor-pointer hover:opacity-90"}`}
                  style={{ background: accentColor, color: accentForeground }}
                >
                  {mpLoading ? "Procesando…" : "Confirmar y pagar"}
                </button>
              </>
            ) : (
              <>
                {/* Cart step: coupon + totals + CTA */}

                {/* Coupon input */}
                {!appliedCoupon ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={couponInput}
                        onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleApplyCoupon(); } }}
                        placeholder="Código de cupón"
                        maxLength={50}
                        className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none"
                        style={{
                          background: "var(--store-border)",
                          color: "var(--store-ink)",
                          border: "1px solid var(--store-border-strong)",
                        }}
                        aria-label="Código de cupón de descuento"
                      />
                      <button
                        type="button"
                        onClick={handleApplyCoupon}
                        disabled={couponLoading || !couponInput.trim()}
                        className="px-3 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-opacity cursor-pointer"
                        style={{ background: "var(--store-border-strong)", color: "var(--store-ink)" }}
                      >
                        {couponLoading ? "..." : "Aplicar"}
                      </button>
                    </div>
                    {couponError && (
                      <p className="text-xs text-red-400">{couponError}</p>
                    )}
                  </div>
                ) : (
                  <div
                    className="flex items-center justify-between rounded-xl px-3 py-2"
                    style={{ background: "var(--store-border)" }}
                  >
                    <span className="text-sm font-mono font-semibold" style={{ color: "var(--store-ink)" }}>
                      {appliedCoupon.code}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ color: "var(--store-ink-secondary)" }}>
                        -{formatARS(discountAmount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => { removeCoupon(); setCouponError(null); }}
                        className="w-5 h-5 flex items-center justify-center rounded-full cursor-pointer"
                        style={{ color: "var(--store-ink-muted)" }}
                        aria-label="Quitar cupón"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Subtotal / Total */}
                {appliedCoupon && discountAmount > 0 ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm" style={{ color: "var(--store-ink-secondary)" }}>Subtotal</span>
                      <span className="text-sm" style={{ color: "var(--store-ink-secondary)" }}>{formatARS(totalPrice)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold" style={{ color: "var(--store-ink)" }}>Total</span>
                      <span className="text-xl font-bold" style={{ color: "var(--store-ink)" }}>{formatARS(finalTotal)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium" style={{ color: "var(--store-ink-secondary)" }}>
                      Total
                    </span>
                    <span className="text-xl font-bold" style={{ color: "var(--store-ink)" }}>
                      {formatARS(totalPrice)}
                    </span>
                  </div>
                )}

                {/* Share viral CTA — above checkout button */}
                <ShareCartButton
                  storeName={storeName}
                  slug={storeSlug}
                  items={items}
                  total={totalPrice}
                  accentColor={accentColor}
                  productMinStepMap={productMinStepMap}
                />

                {/* task 5.5: CTA branch — MP mode shows payment button; WhatsApp mode shows WA */}
                {isMpMode ? (
                  <button
                    onClick={() => setCheckoutStep("form")}
                    disabled={hasStockIssues}
                    className={`w-full rounded-full py-4 text-sm font-semibold flex items-center justify-center gap-2.5 transition-opacity${hasStockIssues ? " opacity-50 cursor-not-allowed" : " cursor-pointer hover:opacity-90"}`}
                    style={{ background: accentColor, color: accentForeground }}
                    aria-label={hasStockIssues ? "Corregí el stock para continuar" : "Pagar con Mercado Pago"}
                    title={hasStockIssues ? "Reducí la cantidad de los productos marcados para continuar" : undefined}
                  >
                    <ShoppingBag className="h-5 w-5" aria-hidden="true" />
                    {hasStockIssues ? "Corregí el stock" : "Pagar con Mercado Pago"}
                  </button>
                ) : whatsappNumber ? (
                  <button
                    onClick={handleWhatsApp}
                    disabled={hasStockIssues}
                    className={`w-full rounded-full py-4 text-sm font-semibold flex items-center justify-center gap-2.5 transition-opacity${hasStockIssues ? " opacity-50 cursor-not-allowed" : " cursor-pointer hover:opacity-90"}`}
                    style={{ background: "#25D366", color: "#ffffff" }}
                    aria-label={hasStockIssues ? "Corregí el stock para continuar" : "Enviar pedido por WhatsApp"}
                    title={hasStockIssues ? "Reducí la cantidad de los productos marcados para continuar" : undefined}
                  >
                    <WhatsAppIcon className="h-5 w-5" />
                    {hasStockIssues ? "Corregí el stock" : "Pedir por WhatsApp"}
                  </button>
                ) : (
                  <div className="flex flex-col gap-1">
                    <button
                      disabled
                      className="w-full rounded-full py-4 text-sm font-semibold flex items-center justify-center gap-2.5 opacity-50 cursor-not-allowed"
                      style={{ background: "#25D366", color: "#ffffff" }}
                      title="El comercio no configuró WhatsApp aún"
                    >
                      <WhatsAppIcon className="h-5 w-5" />
                      Pedir por WhatsApp
                    </button>
                    <p className="text-center text-xs" style={{ color: "var(--store-ink-muted)" }}>
                      El comercio no configuró WhatsApp aún
                    </p>
                  </div>
                )}

                <p className="text-center text-xs" style={{ color: "var(--store-ink-muted)" }}>
                  {isMpMode ? "Serás redirigido a Mercado Pago para completar el pago" : "Te contactaremos para confirmar el pedido"}
                </p>
              </>
            )}
          </div>
        )}
      </aside>
    </>
  );
}

// ─── Section Block ────────────────────────────────────────────────────────────

function SectionBlock({
  section,
  products,
  subsections,
  productsBySection,
  accentColor,
  onOpenModal,
  variantsByProduct,
  highlightedProductId,
}: {
  section: UISection;
  products: UIProduct[];
  subsections: UISection[];
  productsBySection: Map<string, UIProduct[]>;
  accentColor: string;
  onOpenModal: (p: UIProduct) => void;
  variantsByProduct: Record<string, ProductVariantData>;
  highlightedProductId?: string | null;
}) {
  const hasDirectProducts = products.length > 0;
  const hasSubsections = subsections.length > 0;
  const hasAnyContent =
    hasDirectProducts ||
    subsections.some((sub) => (productsBySection.get(sub.id) ?? []).length > 0);

  return (
    <section id={section.id} className="scroll-mt-24" aria-labelledby={`section-${section.id}`}>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-6 sm:mb-8">
        <h2
          id={`section-${section.id}`}
          className="text-xl sm:text-2xl font-bold"
          style={{ color: "var(--store-ink)", fontFamily: "var(--font-rubik, Rubik)" }}
        >
          {section.name}
        </h2>
        <div
          className="h-px flex-1"
          style={{ background: "var(--store-border)" }}
          aria-hidden="true"
        />
        <ChevronRight
          className="h-4 w-4 shrink-0"
          aria-hidden="true"
          style={{ color: "var(--store-border-strong)" }}
        />
      </div>

      {/* Empty-section placeholder — only for top-level sections */}
      {!hasAnyContent && (
        <div
          className="flex items-center justify-center rounded-xl border py-10 sm:py-12"
          style={{ borderColor: "var(--store-border)" }}
        >
          <p
            className="text-sm sm:text-base font-medium"
            style={{ color: "var(--store-ink-secondary)" }}
          >
            Próximamente
          </p>
        </div>
      )}

      {/* Direct products (if any) */}
      {hasDirectProducts && (
        <div className={`grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5 lg:gap-6${hasSubsections ? " mb-10 sm:mb-12" : ""}`}>
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              accentColor={accentColor}
              onOpenModal={onOpenModal}
              variantData={variantsByProduct[p.id]}
              isHighlighted={highlightedProductId === p.id}
            />
          ))}
        </div>
      )}

      {/* Subsections with sub-headers */}
      {hasSubsections && (
        <div className="flex flex-col gap-10 sm:gap-12">
          {subsections.map((sub) => {
            const subProducts = productsBySection.get(sub.id) ?? [];
            if (subProducts.length === 0) return null;
            return (
              <div key={sub.id} id={sub.id} className="scroll-mt-24">
                <h3
                  className="text-base sm:text-lg font-semibold mb-4 sm:mb-5"
                  style={{ color: "var(--store-ink-secondary)", fontFamily: "var(--font-rubik, Rubik)" }}
                >
                  {sub.name}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5 lg:gap-6">
                  {subProducts.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      accentColor={accentColor}
                      onOpenModal={onOpenModal}
                      variantData={variantsByProduct[p.id]}
                      isHighlighted={highlightedProductId === p.id}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}


// ─── Floating Cart Button (mobile) ───────────────────────────────────────────

function FloatingCartButton({ accentColor }: { accentColor: string }) {
  const { totalItems, openCart, open } = useCart();
  if (open || totalItems === 0) return null;
  const accentForeground = "#ffffff";

  return (
    <button
      onClick={openCart}
      className="fixed bottom-5 right-5 z-30 sm:hidden flex items-center gap-2 rounded-full px-4 py-3 font-semibold text-sm cursor-pointer transition-opacity hover:opacity-90"
      style={{
        background: accentColor,
        color: accentForeground,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
      }}
      aria-label={`Ver carrito, ${totalItems} producto${totalItems !== 1 ? "s" : ""}`}
    >
      <ShoppingBag className="h-4 w-4" aria-hidden="true" />
      Ver carrito ({totalItems})
    </button>
  );
}

// ─── Root Client Component ────────────────────────────────────────────────────

export default function StoreClient({
  store,
  sections: sectionRows,
  products: productRows,
  variantsByProduct,
  initialFilters = DEFAULT_FILTERS,
  initialProductId = null,
  topSellerProducts = [],
  initialRelatedIds = [],
  checkoutMode = "whatsapp",
  mpConnected = false,
}: {
  store: StoreRow;
  sections: SectionRow[];
  products: ProductRow[];
  variantsByProduct: Record<string, ProductVariantData>;
  initialFilters?: CatalogFilters;
  initialProductId?: string | null;
  /** Pre-fetched top seller UIProducts (SSR). Shown when length >= 3. */
  topSellerProducts?: UIProduct[];
  /** Pre-fetched related product IDs for the initial deep-link product (SSR). */
  initialRelatedIds?: string[];
  /** task 5.6: checkout mode passed from server (migration 031 column) */
  checkoutMode?: "whatsapp" | "mercadopago";
  /** task 5.6: whether the store has a valid (non-revoked) MP connection */
  mpConnected?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const accentColor = getAccentColor(store.theme);

  // Map Supabase rows to local UI types
  const sections: UISection[] = useMemo(
    () => sectionRows.map((s) => ({ id: s.id, name: s.name, parentId: s.parent_id ?? null })),
    [sectionRows]
  );

  // Only level-1 sections for the nav and filter UI
  const sectionLites: SectionLite[] = useMemo(
    () => sectionRows.filter((s) => s.parent_id == null).map((s) => ({ id: s.id, name: s.name })),
    [sectionRows]
  );

  // Map parent section id → child section ids (for filter expansion)
  const subsectionMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of sections) {
      if (s.parentId) {
        const existing = map.get(s.parentId) ?? [];
        existing.push(s.id);
        map.set(s.parentId, existing);
      }
    }
    return map;
  }, [sections]);

  const products: UIProduct[] = useMemo(
    () =>
      productRows.map((p) => ({
        id: p.id,
        sectionId: p.section_id ?? "",
        name: p.name,
        description: p.description ?? "",
        price: p.price_cents / 100,
        priceCents: p.price_cents,
        promoPriceCents: p.promo_price_cents,
        image: getProductImage(p),
        imageUrls: p.image_urls ?? [],
        stock: p.stock ?? null,
        min_quantity: (p as unknown as { min_quantity?: number }).min_quantity ?? 1,
        qty_step: (p as unknown as { qty_step?: number }).qty_step ?? 1,
      })),
    [productRows]
  );

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  // ─── Related products state ───────────────────────────────────────────────

  // In-memory cache: productId → related product IDs. Avoids re-fetching when
  // the visitor closes and re-opens the same product modal.
  const relatedCacheRef = useRef<Map<string, string[]>>(new Map());

  // Hydrate cache with SSR-resolved ids for the initial deep-link product
  useEffect(() => {
    if (initialProductId && initialRelatedIds.length > 0) {
      relatedCacheRef.current.set(initialProductId, initialRelatedIds);
    }
    // Intentionally runs only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Related IDs for the currently open modal product (drives relatedSlot rendering)
  const [currentRelatedIds, setCurrentRelatedIds] = useState<string[]>(
    () => (initialProductId && initialRelatedIds.length > 0 ? initialRelatedIds : [])
  );
  const [relatedLoading, setRelatedLoading] = useState(false);

  // Map productId → stock (and productId::variantId → variantStock) for CartDrawer validation.
  const productStockMap = useMemo(() => {
    const map = new Map<string, number | null>(products.map((p) => [p.id, p.stock]));
    for (const [productId, vd] of Object.entries(variantsByProduct)) {
      for (const variant of vd.variants) {
        map.set(`${productId}::${variant.id}`, variant.stock);
      }
    }
    return map;
  }, [products, variantsByProduct]);

  // Map productId → { min_quantity, qty_step } for CartDrawer controls and checkout validation.
  const productMinStepMap = useMemo(
    () => new Map(products.map((p) => [p.id, { min_quantity: p.min_quantity, qty_step: p.qty_step }])),
    [products]
  );

  // ─── Filters state ───────────────────────────────────────────────────────────

  const [filters, setFilters] = useState<CatalogFilters>(initialFilters);

  // ─── URL sync helper ─────────────────────────────────────────────────────────

  const updateUrl = useCallback(
    (nextFilters: CatalogFilters, nextProductId: string | null) => {
      const sp = serializeFiltersToSearchParams(nextFilters);
      if (nextProductId) sp.set("p", nextProductId);
      const query = sp.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      router.replace(url, { scroll: false });
    },
    [pathname, router]
  );

  // ─── Modal state ─────────────────────────────────────────────────────────────

  const [modalProduct, setModalProductState] = useState<UIProduct | null>(
    () => (initialProductId ? (productMap.get(initialProductId) ?? null) : null)
  );

  const openModal = useCallback(async (p: UIProduct) => {
    setModalProductState(p);

    // Fetch related products if not already cached
    const cached = relatedCacheRef.current.get(p.id);
    if (cached !== undefined) {
      setCurrentRelatedIds(cached);
      return;
    }

    // No cache — fetch asynchronously
    setCurrentRelatedIds([]);
    setRelatedLoading(true);
    try {
      const ids = await getRelatedProductIds(p.id, store.id);
      relatedCacheRef.current.set(p.id, ids);
      // Only apply if the user is still on this product
      setModalProductState((current) => {
        if (current?.id === p.id) {
          setCurrentRelatedIds(ids);
        }
        return current;
      });
    } catch {
      console.warn("[StoreClient] failed to fetch related products");
      relatedCacheRef.current.set(p.id, []);
    } finally {
      setRelatedLoading(false);
    }
  }, [store.id]);

  const closeModal = useCallback(() => {
    setModalProductState(null);
    setCurrentRelatedIds([]);
  }, []);

  // Single effect: sync URL whenever modal or filters change.
  // Skip on the very first render (initial state matches server-rendered URL).
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    updateUrl(filters, modalProduct?.id ?? null);
  }, [filters, modalProduct, updateUrl]);

  // ─── Highlight state ─────────────────────────────────────────────────────────

  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);

  // On mount: if opened via deep-link, scroll card into view + start highlight timer
  useEffect(() => {
    if (!initialProductId) return;
    setHighlightedProductId(initialProductId);
    requestAnimationFrame(() => {
      document
        .getElementById(`product-${initialProductId}`)
        ?.scrollIntoView({ block: "center", behavior: "instant" });
    });
    const timer = setTimeout(() => setHighlightedProductId(null), 2000);
    return () => clearTimeout(timer);
    // intentionally run only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Filtered products for the grid ─────────────────────────────────────────

  const visibleProducts = useMemo(
    () => applyFilters(products, variantsByProduct, filters, subsectionMap),
    [products, variantsByProduct, filters, subsectionMap]
  );

  const visibleProductsBySection = useMemo(() => {
    const map = new Map<string, UIProduct[]>();
    for (const s of sections) {
      map.set(
        s.id,
        visibleProducts.filter((p) => p.sectionId === s.id)
      );
    }
    return map;
  }, [sections, visibleProducts]);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.q.trim().length > 0 ||
      filters.priceMin !== null ||
      filters.priceMax !== null ||
      filters.sectionIds.length > 0 ||
      filters.inStockOnly
    );
  }, [filters]);

  const accentForeground = "#ffffff";

  return (
    // Inject accent CSS variable so child components can use var(--accent)
    <div style={{ "--accent": accentColor } as React.CSSProperties}>
      <StoreHeader
        storeName={store.name}
        storeSlug={store.slug}
        accentColor={accentColor}
        logoUrl={store.logo_url}
        sections={sectionLites}
        searchQuery={filters.q}
        onSearchChange={(q) => setFilters((prev) => ({ ...prev, q }))}
      />

      <StoreHero
        name={store.name}
        description={store.description}
        accentColor={accentColor}
        logoUrl={store.logo_url}
        socialLinks={(store.social_links ?? undefined) as unknown as SocialLinks | undefined}
        banner={parseBanner(store.theme)}
      />

      <main
        className="mx-auto w-full max-w-6xl px-4 sm:px-6 md:px-8 py-10 sm:py-14 flex flex-col gap-8 sm:gap-12"
        id="main-content"
      >
        {/* Catalog filters */}
        <CatalogFiltersUI
          filters={filters}
          onChange={setFilters}
          sections={sectionLites}
          accentColor={accentColor}
        />

        {/* Top sellers — only visible when no active filters */}
        {!hasActiveFilters && topSellerProducts.length >= 3 && (
          <TopSellers
            products={topSellerProducts}
            accentColor={accentColor}
            variantsByProduct={variantsByProduct}
            onOpenModal={openModal}
          />
        )}

        {/* Product grid area */}
        {hasActiveFilters ? (
          visibleProducts.length === 0 ? (
            /* Empty state for active filters */
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full"
                style={{ background: "var(--store-border)" }}
              >
                <Search className="h-7 w-7" aria-hidden="true" style={{ color: "var(--store-ink-muted)" }} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-base" style={{ color: "var(--store-ink)" }}>
                  Sin resultados
                </p>
                <p className="text-sm max-w-xs" style={{ color: "var(--store-ink-secondary)" }}>
                  No encontramos productos con esos filtros.
                </p>
              </div>
              <button
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="mt-2 rounded-full px-5 py-2.5 text-sm font-semibold cursor-pointer transition-opacity hover:opacity-80"
                style={{ background: accentColor, color: accentForeground }}
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            /* Filtered results — show as a flat grid */
            <section aria-label="Productos filtrados">
              <div className="flex items-center justify-between gap-3 mb-6">
                <span
                  className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                  style={{ background: "var(--store-border)", color: "var(--store-ink-secondary)" }}
                >
                  {visibleProducts.length} {visibleProducts.length === 1 ? "producto" : "productos"}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5 lg:gap-6">
                {visibleProducts.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    accentColor={accentColor}
                    onOpenModal={openModal}
                    variantData={variantsByProduct[p.id]}
                    isHighlighted={highlightedProductId === p.id}
                  />
                ))}
              </div>
            </section>
          )
        ) : (
          /* Default: show by section (level-1 only), keep gap for visual separation */
          <div className="flex flex-col gap-14 sm:gap-20">
            {sections
              .filter((s) => s.parentId === null)
              .map((s) => {
                const children = subsectionMap.get(s.id) ?? [];
                const subsections = sections.filter((sub) => children.includes(sub.id));
                return (
                  <SectionBlock
                    key={s.id}
                    section={s}
                    products={visibleProductsBySection.get(s.id) ?? []}
                    subsections={subsections}
                    productsBySection={visibleProductsBySection}
                    accentColor={accentColor}
                    onOpenModal={openModal}
                    variantsByProduct={variantsByProduct}
                    highlightedProductId={highlightedProductId}
                  />
                );
              })}
          </div>
        )}
      </main>

      <WapyFooter />

      <CartDrawer
        storeId={store.id}
        storeName={store.name}
        storeSlug={store.slug}
        accentColor={accentColor}
        whatsappNumber={store.whatsapp_number}
        productStockMap={productStockMap}
        productMinStepMap={productMinStepMap}
        checkoutMode={checkoutMode}
        mpConnected={mpConnected}
      />

      <FloatingCartButton accentColor={accentColor} />

      {modalProduct && (
        <ProductModal
          key={modalProduct.id}
          product={modalProduct}
          accentColor={accentColor}
          onClose={closeModal}
          variantData={variantsByProduct[modalProduct.id]}
          relatedSlot={
            relatedLoading ? (
              /* Loading skeletons while fetching related products */
              <div className="mt-4 flex gap-3 overflow-x-auto pb-1" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="shrink-0 rounded-xl overflow-hidden"
                    style={{
                      width: 88,
                      height: 140,
                      background: "var(--store-border)",
                      opacity: 0.6,
                    }}
                  />
                ))}
              </div>
            ) : currentRelatedIds.length > 0 ? (
              <RelatedProducts
                relatedIds={currentRelatedIds}
                products={products}
                onSelect={openModal}
                accentColor={accentColor}
              />
            ) : null
          }
        />
      )}
    </div>
  );
}
