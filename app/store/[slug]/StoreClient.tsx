"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
// Note: hover affordances are CSS-driven via .store-scope rules in globals.css
import {
  ShoppingBag,
  X,
  Plus,
  Minus,
  Trash2,
  ChevronRight,
  MapPin,
  Clock,
  Search,
  Sun,
  Moon,
} from "lucide-react";
import type { Contact, Product, Section, Store } from "../../../lib/stores";
import { useCart } from "./CartContext";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// Instagram SVG (not available in this version of lucide-react)
function InstagramIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
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

// ─── Store Header ─────────────────────────────────────────────────────────────

function StoreHeader({
  store,
  sections,
  searchQuery,
  onSearchChange,
}: {
  store: Store;
  sections: Section[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
}) {
  const { totalItems, openCart } = useCart();
  const { isDark, toggle } = useDarkMode(store.slug);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileInputRef = useRef<HTMLInputElement>(null);

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
        {/* Store name */}
        <span
          className="text-base font-semibold tracking-tight shrink-0"
          style={{ color: store.accentColor, fontFamily: "var(--font-rubik, Rubik)" }}
        >
          {store.name}
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
          <a
            href="#contacto"
            className="store-nav-link shrink-0 px-3 py-1.5 text-sm font-medium rounded-full transition-colors cursor-pointer"
            style={{ color: "var(--store-ink-secondary)" }}
          >
            Contacto
          </a>
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
              background: store.accentColor,
              color: store.accentForeground,
            }}
            aria-label={`Carrito${totalItems > 0 ? `, ${totalItems} producto${totalItems !== 1 ? "s" : ""}` : ""}`}
          >
            <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline text-sm">Carrito</span>
            {totalItems > 0 && (
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: "rgba(255,255,255,0.25)", color: store.accentForeground }}
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
          <a
            href="#contacto"
            className="shrink-0 px-3 py-1 text-xs font-medium rounded-full cursor-pointer whitespace-nowrap"
            style={{
              background: "var(--store-border)",
              color: "var(--store-ink-secondary)",
            }}
          >
            Contacto
          </a>
        </div>
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function StoreHero({ store }: { store: Store }) {
  return (
    <section
      className="py-16 sm:py-24 px-4 sm:px-6"
      style={{ background: "var(--store-surface)" }}
      aria-label="Presentación de la tienda"
    >
      <div className="mx-auto max-w-6xl flex flex-col gap-3">
        {/* Eyebrow */}
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: store.accentColor }}
        >
          Nueva colección
        </p>
        {/* Headline */}
        <h1
          className="text-5xl sm:text-7xl font-bold tracking-tight leading-none"
          style={{ color: "var(--store-ink)", fontFamily: "var(--font-rubik, Rubik)" }}
        >
          {store.name}
        </h1>
        {/* Tagline */}
        <p
          className="text-base sm:text-lg max-w-md mt-1"
          style={{ color: "var(--store-ink-secondary)" }}
        >
          {store.tagline}
        </p>
        {/* Decorative rule */}
        <div
          className="mt-6 h-px w-16"
          style={{ background: store.accentColor, opacity: 0.6 }}
          aria-hidden="true"
        />
      </div>
    </section>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  accentColor,
  accentForeground,
  onOpenModal,
}: {
  product: Product;
  accentColor: string;
  accentForeground: string;
  onOpenModal: (p: Product) => void;
}) {
  const { addItem, openCart } = useCart();

  function handleAdd(e: React.MouseEvent) {
    e.stopPropagation();
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
      className="store-card cursor-pointer flex flex-col rounded-2xl overflow-hidden"
      onClick={() => onOpenModal(product)}
      style={{
        background: "var(--store-surface)",
        border: "1px solid var(--store-border)",
      }}
      aria-label={`${product.name}, ${formatARS(product.price)}`}
    >
      {/* Image container */}
      <div
        className="relative overflow-hidden"
        style={{ aspectRatio: "3/4", background: "var(--store-border)" }}
      >
        <Image
          src={product.image}
          alt={product.name}
          fill
          className="store-card-image object-cover"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        />
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
          <span
            className="text-sm sm:text-base font-bold"
            style={{ color: "var(--store-ink)" }}
          >
            {formatARS(product.price)}
          </span>
          <button
            onClick={handleAdd}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer transition-opacity hover:opacity-80"
            style={{ background: accentColor, color: accentForeground }}
            aria-label={`Agregar ${product.name} al carrito`}
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            Agregar
          </button>
        </div>
      </div>
    </article>
  );
}

// ─── Product Modal ────────────────────────────────────────────────────────────

function ProductModal({
  product,
  accentColor,
  accentForeground,
  onClose,
}: {
  product: Product;
  accentColor: string;
  accentForeground: string;
  onClose: () => void;
}) {
  const { addItem, setQty, items, openCart } = useCart();
  const [qty, setLocalQty] = useState(1);
  const overlayRef = useRef<HTMLDivElement>(null);

  const existingItem = items.find((i) => i.productId === product.id);

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

  function handleAdd() {
    if (existingItem) {
      setQty(product.id, existingItem.quantity + qty);
    } else {
      addItem({
        productId: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
      });
      if (qty > 1) {
        setQty(product.id, qty);
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
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 36rem"
            priority
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

          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--store-ink-secondary)" }}
          >
            {product.description}
          </p>

          {/* Quantity selector */}
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
                onClick={() => setLocalQty(qty + 1)}
                className="store-icon-btn flex h-10 w-10 items-center justify-center cursor-pointer transition-colors"
                style={{ color: "var(--store-ink)" }}
                aria-label="Aumentar cantidad"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <button
            onClick={handleAdd}
            className="w-full rounded-full py-3.5 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-opacity hover:opacity-85"
            style={{ background: accentColor, color: accentForeground }}
          >
            <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            Agregar al carrito
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Cart Drawer ──────────────────────────────────────────────────────────────

function CartDrawer({ store }: { store: Store }) {
  const { items, open, totalPrice, removeItem, setQty, closeCart } = useCart();

  function handleWhatsApp() {
    const lines = items.map(
      (i) => `• ${i.quantity}x ${i.name} — ${formatARS(i.price * i.quantity)}`
    );
    const message = [
      `*Pedido en ${store.name}*`,
      "",
      ...lines,
      "",
      `*Total: ${formatARS(totalPrice)}*`,
    ].join("\n");

    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${store.whatsappNumber}?text=${encoded}`, "_blank");
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
              style={{ color: store.accentColor }}
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
              {items.map((item) => (
                <li
                  key={item.productId}
                  className="flex gap-3 items-start"
                  style={{ paddingBottom: "1rem", borderBottom: "1px solid var(--store-border)" }}
                >
                  {/* Thumbnail */}
                  <div
                    className="relative h-16 w-16 rounded-xl overflow-hidden shrink-0"
                    style={{ background: "var(--store-border)" }}
                  >
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      className="object-cover"
                      sizes="4rem"
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
                    <p className="text-xs" style={{ color: "var(--store-ink-muted)" }}>
                      {formatARS(item.price)} / u
                    </p>

                    {/* Quantity controls */}
                    <div className="flex items-center gap-2 mt-0.5">
                      <div
                        className="flex items-center rounded-full overflow-hidden"
                        style={{ border: "1px solid var(--store-border-strong)" }}
                      >
                        <button
                          onClick={() => setQty(item.productId, item.quantity - 1)}
                          className="store-icon-btn flex h-7 w-7 items-center justify-center cursor-pointer transition-colors"
                          style={{ color: "var(--store-ink)" }}
                          aria-label={`Reducir cantidad de ${item.name}`}
                        >
                          <Minus className="h-3 w-3" aria-hidden="true" />
                        </button>
                        <span
                          className="w-6 text-center text-xs font-semibold select-none"
                          style={{ color: "var(--store-ink)" }}
                        >
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => setQty(item.productId, item.quantity + 1)}
                          className="store-icon-btn flex h-7 w-7 items-center justify-center cursor-pointer transition-colors"
                          style={{ color: "var(--store-ink)" }}
                          aria-label={`Aumentar cantidad de ${item.name}`}
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>

                      <button
                        onClick={() => removeItem(item.productId)}
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
                    {formatARS(item.price * item.quantity)}
                  </p>
                </li>
              ))}
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
            <button
              onClick={handleWhatsApp}
              className="w-full rounded-full py-4 text-sm font-semibold flex items-center justify-center gap-2.5 cursor-pointer transition-opacity hover:opacity-90"
              style={{ background: "#25D366", color: "#ffffff" }}
              aria-label="Enviar pedido por WhatsApp"
            >
              <WhatsAppIcon className="h-5 w-5" />
              Pedir por WhatsApp
            </button>

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
  accentForeground,
  onOpenModal,
}: {
  section: Section;
  products: Product[];
  accentColor: string;
  accentForeground: string;
  onOpenModal: (p: Product) => void;
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
            accentForeground={accentForeground}
            onOpenModal={onOpenModal}
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
  accentForeground,
  onOpenModal,
  onClear,
}: {
  query: string;
  results: Product[];
  accentColor: string;
  accentForeground: string;
  onOpenModal: (p: Product) => void;
  onClear: () => void;
}) {
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
              accentForeground={accentForeground}
              onOpenModal={onOpenModal}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Contact Section ──────────────────────────────────────────────────────────

function ContactSection({
  store,
  contact,
}: {
  store: Store;
  contact: Contact;
}) {
  const instagramHandle = contact.instagram.replace(/^@/, "");
  const mapsEmbedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(contact.mapsQuery)}&z=15&output=embed`;

  return (
    <section
      id="contacto"
      className="scroll-mt-24"
      aria-labelledby="contacto-heading"
      style={{ borderTop: "1px solid var(--store-border)" }}
    >
      {/* Section header — matches SectionBlock style */}
      <div className="flex items-center gap-3 mb-6 sm:mb-8">
        <h2
          id="contacto-heading"
          className="text-xl sm:text-2xl font-bold"
          style={{ color: "var(--store-ink)", fontFamily: "var(--font-rubik, Rubik)" }}
        >
          Contacto
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

      {/* Two-column layout: info left, map right */}
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
        {/* Info column */}
        <div className="flex flex-col gap-6 lg:w-72 shrink-0">
          {/* Store identity */}
          <div className="flex flex-col gap-1">
            <p
              className="text-2xl font-bold tracking-tight"
              style={{ color: store.accentColor, fontFamily: "var(--font-rubik, Rubik)" }}
            >
              {store.name}
            </p>
            <p className="text-sm" style={{ color: "var(--store-ink-secondary)" }}>
              {store.tagline}
            </p>
          </div>

          {/* Address */}
          <div className="flex gap-3 items-start">
            <MapPin
              className="h-4 w-4 mt-0.5 shrink-0"
              aria-hidden="true"
              style={{ color: store.accentColor }}
            />
            <p className="text-sm leading-relaxed" style={{ color: "var(--store-ink)" }}>
              {contact.address}
            </p>
          </div>

          {/* Hours */}
          <div className="flex gap-3 items-start">
            <Clock
              className="h-4 w-4 mt-0.5 shrink-0"
              aria-hidden="true"
              style={{ color: store.accentColor }}
            />
            <ul className="flex flex-col gap-1" aria-label="Horarios de atención">
              {contact.hours.map((h) => (
                <li key={h.days} className="flex gap-2 text-sm">
                  <span
                    className="font-medium w-40 shrink-0"
                    style={{ color: "var(--store-ink)" }}
                  >
                    {h.days}
                  </span>
                  <span style={{ color: "var(--store-ink-secondary)" }}>{h.time}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Instagram */}
          <a
            href={`https://instagram.com/${instagramHandle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 self-start rounded-full px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 cursor-pointer"
            style={{
              background: "var(--store-border)",
              color: "var(--store-ink)",
            }}
            aria-label={`Seguinos en Instagram: ${contact.instagram}`}
          >
            <InstagramIcon
              className="h-4 w-4"
              style={{ color: store.accentColor }}
            />
            {contact.instagram}
          </a>
        </div>

        {/* Map */}
        <div
          className="flex-1 overflow-hidden rounded-2xl"
          style={{
            border: "1px solid var(--store-border)",
            boxShadow: "var(--store-shadow)",
          }}
        >
          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
            <iframe
              src={mapsEmbedUrl}
              title={`Mapa de ubicación de ${store.name}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                border: 0,
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Store Footer ─────────────────────────────────────────────────────────────

function StoreFooter({ store }: { store: Store }) {
  return (
    <footer
      className="mt-20 py-10 px-4 sm:px-6"
      style={{ borderTop: "1px solid var(--store-border)" }}
    >
      <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--store-ink-muted)" }}>
          <span className="font-semibold" style={{ color: store.accentColor }}>
            {store.name}
          </span>{" "}
          &mdash; Todos los precios en pesos argentinos (ARS)
        </p>
        <p className="text-xs" style={{ color: "var(--store-ink-muted)" }}>
          Tienda impulsada por{" "}
          <a
            href="/"
            className="inline-flex items-baseline hover:opacity-75 cursor-pointer transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 rounded-sm"
            style={{ color: "var(--store-ink-secondary)" }}
            aria-label="Wapy — ir al sitio de Wapy"
          >
            <span
              style={{
                fontFamily: "var(--font-agbalumo, cursive)",
                fontSize: "1.1em",
                lineHeight: 1,
                letterSpacing: "-0.01em",
              }}
            >
              wapy
            </span>
          </a>
        </p>
      </div>
    </footer>
  );
}

// ─── Floating Cart Button (mobile) ───────────────────────────────────────────

function FloatingCartButton({
  accentColor,
  accentForeground,
}: {
  accentColor: string;
  accentForeground: string;
}) {
  const { totalItems, openCart, open } = useCart();
  if (open || totalItems === 0) return null;

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

export default function StoreClient({ store }: { store: Store }) {
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const productsBySection = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const s of store.sections) {
      map.set(
        s.id,
        store.products.filter((p) => p.sectionId === s.id)
      );
    }
    return map;
  }, [store.sections, store.products]);

  // Filter products by name and description — accent- and case-insensitive
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = normalize(searchQuery.trim());
    return store.products.filter(
      (p) => normalize(p.name).includes(q) || normalize(p.description).includes(q)
    );
  }, [searchQuery, store.products]);

  const hasQuery = searchQuery.trim().length > 0;

  return (
    <>
      <StoreHeader
        store={store}
        sections={store.sections}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <StoreHero store={store} />

      <main
        className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-10 sm:py-14 flex flex-col gap-14 sm:gap-20"
        id="main-content"
      >
        {hasQuery ? (
          <SearchResults
            query={searchQuery}
            results={filteredProducts}
            accentColor={store.accentColor}
            accentForeground={store.accentForeground}
            onOpenModal={setModalProduct}
            onClear={() => setSearchQuery("")}
          />
        ) : (
          <>
            {store.sections.map((s) => (
              <SectionBlock
                key={s.id}
                section={s}
                products={productsBySection.get(s.id) ?? []}
                accentColor={store.accentColor}
                accentForeground={store.accentForeground}
                onOpenModal={setModalProduct}
              />
            ))}

            {store.contact && (
              <ContactSection store={store} contact={store.contact} />
            )}
          </>
        )}
      </main>

      <StoreFooter store={store} />

      <CartDrawer store={store} />

      <FloatingCartButton
        accentColor={store.accentColor}
        accentForeground={store.accentForeground}
      />

      {modalProduct && (
        <ProductModal
          product={modalProduct}
          accentColor={store.accentColor}
          accentForeground={store.accentForeground}
          onClose={() => setModalProduct(null)}
        />
      )}
    </>
  );
}
