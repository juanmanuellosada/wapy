"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
// Note: hover affordances are CSS-driven via .store-scope rules in globals.css
import {
  ShoppingBag,
  X,
  Plus,
  Minus,
  Trash2,
  ChevronRight,
} from "lucide-react";
import type { Product, Section, Store } from "../../../lib/stores";
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

// ─── Store Header ─────────────────────────────────────────────────────────────

function StoreHeader({
  store,
  sections,
}: {
  store: Store;
  sections: Section[];
}) {
  const { totalItems, openCart } = useCart();

  return (
    <header
      className="sticky top-0 z-40"
      style={{
        background: "rgba(250,250,248,0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--store-border)",
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 h-14 gap-4">
        {/* Store name */}
        <span
          className="text-base font-semibold tracking-tight shrink-0"
          style={{ color: store.accentColor, fontFamily: "var(--font-rubik, Rubik)" }}
        >
          {store.name}
        </span>

        {/* Section nav — desktop */}
        <nav
          className="hidden sm:flex items-center gap-0.5 flex-1 justify-center"
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

      {/* Mobile section nav */}
      <div
        className="sm:hidden flex gap-1.5 overflow-x-auto px-4 pb-3 scrollbar-none"
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
            className="font-semibold hover:underline cursor-pointer transition-opacity hover:opacity-75"
            style={{ color: "var(--store-ink-secondary)" }}
          >
            Wapy
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

  const productsBySection = new Map<string, Product[]>();
  for (const s of store.sections) {
    productsBySection.set(
      s.id,
      store.products.filter((p) => p.sectionId === s.id)
    );
  }

  return (
    <>
      <StoreHeader store={store} sections={store.sections} />

      <StoreHero store={store} />

      <main
        className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-10 sm:py-14 flex flex-col gap-14 sm:gap-20"
        id="main-content"
      >
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
