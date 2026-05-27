"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Image from "next/image";
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
import ProductCardClient from "./ProductCardClient";
import WapyFooter from "@/app/components/WapyFooter";
import { createPendingOrder } from "@/lib/store/orders/actions";
import { toast } from "@/lib/toast";

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

// Normalize a string for accent- and case-insensitive matching
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
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

// ─── Local types used in cart/UI ─────────────────────────────────────────────

interface UIProduct {
  id: string;
  sectionId: string;
  name: string;
  description: string;
  price: number; // ARS float (price_cents / 100)
  priceCents: number; // raw cents — needed by ProductCardClient for variant price fallback
  image: string;
  stock: number | null; // null = no tracking, 0 = out of stock, N = N units available
}

interface UISection {
  id: string;
  name: string;
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
  sections: UISection[];
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
      <div className="mx-auto flex max-w-6xl items-center px-4 sm:px-6 h-14 gap-2 sm:gap-3">
        {/* Logo thumbnail + Store name */}
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

        {/* Section nav — desktop (md+) */}
        <nav
          className="hidden md:flex items-center gap-0.5 flex-1 justify-center"
          aria-label="Secciones de la tienda"
        >
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="store-nav-link shrink-0 px-3 py-1.5 text-sm font-medium rounded-full transition-colors cursor-pointer"
              style={{ color: "var(--store-ink-secondary)" }}
            >
              {s.name}
            </a>
          ))}
        </nav>

        {/* Right controls: search + theme toggle + cart */}
        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
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

      {/* Mobile secondary row: section nav + optional search bar */}
      <div className="md:hidden">
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
          <div className="relative w-full aspect-[4/1]">
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
            {logoUrl && (
              <div className="absolute left-4 sm:left-6 bottom-0 translate-y-1/2">
                <Image
                  src={logoUrl}
                  alt={name}
                  width={96}
                  height={96}
                  className="rounded-full object-cover"
                  style={{
                    outline: `3px solid ${accentColor}`,
                    outlineOffset: 2,
                  }}
                  priority
                />
              </div>
            )}
          </div>

          {/* Text block — padded top so it clears the overlapping logo */}
          <div className={`px-4 sm:px-6 pb-16 sm:pb-24 ${logoUrl ? 'pt-16' : 'pt-8'}`}>
            <div className="mx-auto max-w-6xl flex flex-col gap-3">
              <p
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: accentColor }}
              >
                Tienda online
              </p>
              <h1
                className="text-5xl sm:text-7xl font-bold tracking-tight leading-none"
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
        <div className="py-16 sm:py-24 px-4 sm:px-6">
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
              className="text-5xl sm:text-7xl font-bold tracking-tight leading-none"
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
}: {
  product: UIProduct;
  accentColor: string;
  onOpenModal: (p: UIProduct) => void;
  variantData?: ProductVariantData;
}) {
  return (
    <ProductCardClient
      product={product}
      accentColor={accentColor}
      onOpenModal={onOpenModal}
      optionTypes={variantData?.optionTypes}
      variants={variantData?.variants}
      priceCents={product.priceCents}
    />
  );
}

// ─── Product Modal ────────────────────────────────────────────────────────────

function ProductModal({
  product,
  accentColor,
  onClose,
  hasVariants,
}: {
  product: UIProduct;
  accentColor: string;
  onClose: () => void;
  hasVariants: boolean;
}) {
  const { addItem, setQty, items, openCart } = useCart();
  const [qty, setLocalQty] = useState(1);
  const overlayRef = useRef<HTMLDivElement>(null);
  const accentForeground = "#ffffff";

  // For modal: simple product (no variant), key is just the productId
  const itemKey = cartItemKey(product.id, null);
  const existingItem = items.find((i) => cartItemKey(i.productId, i.variantId) === itemKey);
  const existingQty = existingItem?.quantity ?? 0;
  const isOutOfStock = product.stock === 0;
  // availableToAdd: how many more units the user can add (null = unlimited)
  const availableToAdd = product.stock !== null ? Math.max(0, product.stock - existingQty) : null;
  const canAdd = !isOutOfStock && (availableToAdd === null || availableToAdd > 0);

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
    if (availableToAdd !== null && qty >= availableToAdd) {
      toast.info(`Solo quedan ${product.stock} unidades disponibles`);
      return;
    }
    setLocalQty(qty + 1);
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
        price: product.price,
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

        {/* Image */}
        <div
          className="relative w-full shrink-0"
          style={{ aspectRatio: "4/3", background: "var(--store-border)" }}
        >
            <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 100vw, 576px"
            className="object-cover"
            unoptimized={product.image.startsWith("data:")}
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
            <p className="text-2xl font-bold" style={{ color: accentColor }}>
              {formatARS(product.price)}
            </p>
          </div>

          {product.description && (
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--store-ink-secondary)" }}
            >
              {product.description}
            </p>
          )}

          {/* Quantity selector — hidden when out of stock */}
          {!isOutOfStock && (
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium" style={{ color: "var(--store-ink)" }}>
                Cantidad
              </span>
              <div
                className="flex items-center gap-0 rounded-full overflow-hidden"
                style={{ border: "1px solid var(--store-border-strong)" }}
              >
                <button
                  onClick={() => setLocalQty(Math.max(1, qty - 1))}
                  className="store-icon-btn flex h-10 w-10 items-center justify-center cursor-pointer transition-colors"
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
                  className={`store-icon-btn flex h-10 w-10 items-center justify-center transition-colors${availableToAdd !== null && qty >= availableToAdd ? " opacity-40 cursor-not-allowed" : " cursor-pointer"}`}
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

          {hasVariants ? (
            <p
              className="w-full text-center text-sm py-3.5 rounded-full"
              style={{ background: "var(--store-border)", color: "var(--store-ink-secondary)" }}
            >
              Elegí una variedad en la card para agregar
            </p>
          ) : (
            <button
              onClick={handleAdd}
              disabled={!canAdd}
              className={`w-full rounded-full py-3.5 text-sm font-semibold flex items-center justify-center gap-2 transition-opacity${canAdd ? " cursor-pointer hover:opacity-85" : " opacity-50 cursor-not-allowed"}`}
              style={{ background: accentColor, color: accentForeground }}
            >
              <ShoppingBag className="h-4 w-4" aria-hidden="true" />
              {isOutOfStock ? "Sin stock disponible" : "Agregar al carrito"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Cart Drawer ──────────────────────────────────────────────────────────────

function CartDrawer({
  storeId,
  storeName,
  accentColor,
  whatsappNumber,
  productStockMap,
}: {
  storeId: string;
  storeName: string;
  accentColor: string;
  whatsappNumber: string | null;
  productStockMap: Map<string, number | null>;
}) {
  const { items, open, totalPrice, removeItem, setQty, closeCart } = useCart();
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

    const lines = items.map((i) => {
      const displayPrice = i.variantPrice ?? i.price;
      const label = i.variantLabel ? ` (${i.variantLabel})` : "";
      return `• ${i.quantity}x ${i.name}${label} — ${formatARS(displayPrice * i.quantity)}`;
    });
    const currentMessage = [
      `*Pedido en ${storeName}*`,
      "",
      ...lines,
      "",
      `*Total: ${formatARS(totalPrice)}*`,
    ].join("\n");

    let orderRef = '';
    try {
      const result = await createPendingOrder({
        store_id: storeId,
        items: items.map((i) => ({ product_id: i.productId, quantity: i.quantity, variant_id: i.variantId ?? null })),
      });
      if ('order_id' in result) {
        orderRef = `\n\nReferencia: #${result.order_id.slice(0, 8)}`;
      } else if ('error' in result && result.error === 'stock_insufficient') {
        toast.error("Algunos productos ya no tienen stock suficiente. Revisá tu carrito.");
        return;
      }
    } catch {
      // silencioso, abrir wa.me igual
    }

    const normalized = whatsappNumber.replace(/\D/g, "");
    const text = encodeURIComponent(`${currentMessage}${orderRef}`);
    window.open(`https://wa.me/${normalized}?text=${text}`, "_blank");
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
          onClick={closeCart}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 z-50 h-full w-full max-w-sm flex flex-col"
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
            onClick={closeCart}
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
                          <button
                            onClick={() => setQty(key, item.quantity - 1)}
                            className="store-icon-btn flex h-7 w-7 items-center justify-center cursor-pointer transition-colors"
                            style={{ color: "var(--store-ink)" }}
                            aria-label={`Reducir cantidad de ${item.name}`}
                          >
                            <Minus className="h-3 w-3" aria-hidden="true" />
                          </button>
                          <span
                            className="w-6 text-center text-xs font-semibold select-none"
                            style={{ color: isOverStock ? "rgb(248,113,113)" : "var(--store-ink)" }}
                          >
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => setQty(key, item.quantity + 1)}
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
            {/* Subtotal */}
            <div className="flex items-center justify-between">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--store-ink-secondary)" }}
              >
                Total
              </span>
              <span
                className="text-xl font-bold"
                style={{ color: "var(--store-ink)" }}
              >
                {formatARS(totalPrice)}
              </span>
            </div>

            {/* WhatsApp CTA */}
            {whatsappNumber ? (
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

            <p
              className="text-center text-xs"
              style={{ color: "var(--store-ink-muted)" }}
            >
              Te contactaremos para confirmar el pedido
            </p>
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
  accentColor,
  onOpenModal,
  variantsByProduct,
}: {
  section: UISection;
  products: UIProduct[];
  accentColor: string;
  onOpenModal: (p: UIProduct) => void;
  variantsByProduct: Record<string, ProductVariantData>;
}) {
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

      {/* Product grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
        {products.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            accentColor={accentColor}
            onOpenModal={onOpenModal}
            variantData={variantsByProduct[p.id]}
          />
        ))}
      </div>
    </section>
  );
}

// ─── Search Results ───────────────────────────────────────────────────────────

function SearchResults({
  query,
  results,
  accentColor,
  onOpenModal,
  onClear,
  variantsByProduct,
}: {
  query: string;
  results: UIProduct[];
  accentColor: string;
  onOpenModal: (p: UIProduct) => void;
  onClear: () => void;
  variantsByProduct: Record<string, ProductVariantData>;
}) {
  const accentForeground = "#ffffff";
  return (
    <section aria-label="Resultados de búsqueda">
      {/* Result header */}
      <div className="flex items-center justify-between gap-3 mb-6 sm:mb-8">
        <div className="flex items-center gap-3 min-w-0">
          <h2
            className="text-xl sm:text-2xl font-bold truncate"
            style={{ color: "var(--store-ink)", fontFamily: "var(--font-rubik, Rubik)" }}
          >
            Resultados
          </h2>
          <span
            className="shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold"
            style={{ background: "var(--store-border)", color: "var(--store-ink-secondary)" }}
          >
            {results.length} {results.length === 1 ? "producto" : "productos"}
          </span>
        </div>
        <button
          onClick={onClear}
          className="shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer transition-opacity hover:opacity-80"
          style={{ background: "var(--store-border)", color: "var(--store-ink-secondary)" }}
          aria-label="Limpiar búsqueda y ver todos los productos"
        >
          <X className="h-3 w-3" aria-hidden="true" />
          Limpiar
        </button>
      </div>

      {/* Query pill */}
      <p className="text-sm mb-6" style={{ color: "var(--store-ink-secondary)" }}>
        Buscando:{" "}
        <span
          className="font-semibold px-2 py-0.5 rounded-full"
          style={{ background: "var(--store-border)", color: "var(--store-ink)" }}
        >
          {query}
        </span>
      </p>

      {results.length === 0 ? (
        /* Empty state */
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
              No encontramos productos que coincidan con tu búsqueda.
            </p>
          </div>
          <button
            onClick={onClear}
            className="mt-2 rounded-full px-5 py-2.5 text-sm font-semibold cursor-pointer transition-opacity hover:opacity-80"
            style={{ background: accentColor, color: accentForeground }}
          >
            Ver todos los productos
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
          {results.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              accentColor={accentColor}
              onOpenModal={onOpenModal}
              variantData={variantsByProduct[p.id]}
            />
          ))}
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
}: {
  store: StoreRow;
  sections: SectionRow[];
  products: ProductRow[];
  variantsByProduct: Record<string, ProductVariantData>;
}) {
  const accentColor = getAccentColor(store.theme);

  // Map Supabase rows to local UI types
  const sections: UISection[] = useMemo(
    () => sectionRows.map((s) => ({ id: s.id, name: s.name })),
    [sectionRows]
  );

  const products: UIProduct[] = useMemo(
    () =>
      productRows.map((p) => ({
        id: p.id,
        sectionId: p.section_id ?? "",
        name: p.name,
        description: p.description ?? "",
        price: p.price_cents / 100,
        priceCents: p.price_cents,
        image: getProductImage(p),
        stock: p.stock ?? null,
      })),
    [productRows]
  );

  const productsBySection = useMemo(() => {
    const map = new Map<string, UIProduct[]>();
    for (const s of sections) {
      map.set(
        s.id,
        products.filter((p) => p.sectionId === s.id)
      );
    }
    return map;
  }, [sections, products]);

  // Map productId → stock (and productId::variantId → variantStock) for CartDrawer validation.
  // Variant items use the composite key so the warning reflects variant stock, not product stock.
  const productStockMap = useMemo(() => {
    const map = new Map<string, number | null>(products.map((p) => [p.id, p.stock]));
    for (const [productId, vd] of Object.entries(variantsByProduct)) {
      for (const variant of vd.variants) {
        map.set(`${productId}::${variant.id}`, variant.stock);
      }
    }
    return map;
  }, [products, variantsByProduct]);

  const [modalProduct, setModalProduct] = useState<UIProduct | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter products by name and description — accent- and case-insensitive
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = normalize(searchQuery.trim());
    return products.filter(
      (p) => normalize(p.name).includes(q) || normalize(p.description).includes(q)
    );
  }, [searchQuery, products]);

  const hasQuery = searchQuery.trim().length > 0;

  return (
    // Inject accent CSS variable so child components can use var(--accent)
    <div style={{ "--accent": accentColor } as React.CSSProperties}>
      <StoreHeader
        storeName={store.name}
        storeSlug={store.slug}
        accentColor={accentColor}
        logoUrl={store.logo_url}
        sections={sections}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
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
        className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-10 sm:py-14 flex flex-col gap-14 sm:gap-20"
        id="main-content"
      >
        {hasQuery ? (
          <SearchResults
            query={searchQuery}
            results={filteredProducts}
            accentColor={accentColor}
            onOpenModal={setModalProduct}
            onClear={() => setSearchQuery("")}
            variantsByProduct={variantsByProduct}
          />
        ) : (
          sections.map((s) => (
            <SectionBlock
              key={s.id}
              section={s}
              products={productsBySection.get(s.id) ?? []}
              accentColor={accentColor}
              onOpenModal={setModalProduct}
              variantsByProduct={variantsByProduct}
            />
          ))
        )}
      </main>

      <WapyFooter />

      <CartDrawer
        storeId={store.id}
        storeName={store.name}
        accentColor={accentColor}
        whatsappNumber={store.whatsapp_number}
        productStockMap={productStockMap}
      />

      <FloatingCartButton accentColor={accentColor} />

      {modalProduct && (
        <ProductModal
          product={modalProduct}
          accentColor={accentColor}
          onClose={() => setModalProduct(null)}
          hasVariants={(variantsByProduct[modalProduct.id]?.optionTypes?.length ?? 0) > 0}
        />
      )}
    </div>
  );
}
