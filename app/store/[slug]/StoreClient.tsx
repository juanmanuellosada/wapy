"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Product, Section, Store } from "../../../lib/stores";
import { useCart } from "./CartContext";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatARS(amount: number): string {
  return amount.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
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
      className="sticky top-0 z-40 border-b border-black/10 bg-white/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 gap-4">
        {/* Logo */}
        <span
          className="text-xl font-bold tracking-tight"
          style={{ color: store.accentColor }}
        >
          {store.name}
        </span>

        {/* Section nav — hidden on very small screens, horizontal scroll on sm */}
        <nav className="hidden sm:flex items-center gap-1 overflow-x-auto flex-1 justify-center">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="shrink-0 rounded-full px-3 py-1 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            >
              {s.name}
            </a>
          ))}
        </nav>

        {/* Cart button */}
        <button
          onClick={openCart}
          className="relative flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 shrink-0"
          style={{ backgroundColor: store.accentColor }}
          aria-label="Abrir carrito"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          <span className="hidden sm:inline">Carrito</span>
          {totalItems > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold"
              style={{ color: store.accentColor }}
            >
              {totalItems}
            </span>
          )}
        </button>
      </div>

      {/* Mobile section nav */}
      <div className="sm:hidden flex gap-1 overflow-x-auto px-4 pb-2">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="shrink-0 rounded-full px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
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
      className="py-14 px-4 text-center"
      style={{ backgroundColor: store.accentColor, color: store.accentForeground }}
    >
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-3">
        {store.name}
      </h1>
      <p className="text-lg sm:text-xl opacity-90 max-w-md mx-auto">
        {store.tagline}
      </p>
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
      className="group rounded-2xl overflow-hidden border border-gray-200 bg-white hover:shadow-lg transition-shadow cursor-pointer"
      onClick={() => onOpenModal(product)}
    >
      <div className="relative aspect-square overflow-hidden bg-gray-100">
        <Image
          src={product.image}
          alt={product.name}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-300"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        />
      </div>
      <div className="p-3 sm:p-4 flex flex-col gap-2">
        <h3 className="font-semibold text-gray-900 text-sm sm:text-base leading-snug">
          {product.name}
        </h3>
        <p className="text-gray-500 text-xs sm:text-sm line-clamp-2 leading-relaxed">
          {product.description}
        </p>
        <div className="flex items-center justify-between mt-1 gap-2">
          <span className="font-bold text-gray-900 text-sm sm:text-base">
            {formatARS(product.price)}
          </span>
          <button
            onClick={handleAdd}
            className="rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-85 shrink-0"
            style={{
              backgroundColor: accentColor,
              color: accentForeground,
            }}
          >
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
    return () => { document.body.style.overflow = ""; };
  }, []);

  function handleAdd() {
    if (existingItem) {
      setQty(product.id, existingItem.quantity + qty);
    } else {
      // add once, then adjust quantity if qty > 1
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl overflow-hidden max-h-[90dvh] flex flex-col">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white hover:bg-black/40 transition-colors"
          aria-label="Cerrar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Image */}
        <div className="relative w-full aspect-square sm:aspect-[4/3] bg-gray-100 shrink-0">
          <Image
            src={product.image}
            alt={product.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 32rem"
          />
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-3 overflow-y-auto">
          <h2 className="text-xl font-bold text-gray-900">{product.name}</h2>
          <p className="text-gray-600 text-sm leading-relaxed">{product.description}</p>
          <p className="text-2xl font-bold text-gray-900">{formatARS(product.price)}</p>

          {/* Quantity selector */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">Cantidad:</span>
            <div className="flex items-center gap-2 border border-gray-200 rounded-full overflow-hidden">
              <button
                onClick={() => setLocalQty(Math.max(1, qty - 1))}
                className="w-9 h-9 flex items-center justify-center text-gray-700 hover:bg-gray-100 transition-colors font-bold"
              >
                −
              </button>
              <span className="w-8 text-center font-semibold text-gray-900 text-sm">
                {qty}
              </span>
              <button
                onClick={() => setLocalQty(qty + 1)}
                className="w-9 h-9 flex items-center justify-center text-gray-700 hover:bg-gray-100 transition-colors font-bold"
              >
                +
              </button>
            </div>
          </div>

          <button
            onClick={handleAdd}
            className="w-full rounded-full py-3.5 text-base font-bold transition-opacity hover:opacity-90"
            style={{ backgroundColor: accentColor, color: accentForeground }}
          >
            Agregar al carrito
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Cart Drawer ──────────────────────────────────────────────────────────────

function CartDrawer({
  store,
}: {
  store: Store;
}) {
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
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={closeCart}
        />
      )}

      {/* Drawer */}
      <aside
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-sm bg-white shadow-2xl flex flex-col transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Tu carrito</h2>
          <button
            onClick={closeCart}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Cerrar carrito"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-gray-600">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-16 w-16 text-gray-300">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
              <p className="text-gray-500 font-medium">Tu carrito está vacío</p>
              <p className="text-gray-400 text-sm">Agregá productos para armar tu pedido</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {items.map((item) => (
                <li key={item.productId} className="flex gap-3 items-start">
                  <div className="relative h-16 w-16 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      className="object-cover"
                      sizes="4rem"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 leading-snug truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatARS(item.price)} / u
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex items-center gap-1 border border-gray-200 rounded-full text-xs">
                        <button
                          onClick={() => setQty(item.productId, item.quantity - 1)}
                          className="w-7 h-7 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors font-bold text-gray-700"
                        >
                          −
                        </button>
                        <span className="w-5 text-center font-semibold text-gray-900">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => setQty(item.productId, item.quantity + 1)}
                          className="w-7 h-7 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors font-bold text-gray-700"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => removeItem(item.productId)}
                        className="text-xs text-red-400 hover:text-red-600 transition-colors"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-gray-900 shrink-0">
                    {formatARS(item.price * item.quantity)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-gray-200 px-5 py-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-gray-700">Total</span>
              <span className="text-xl font-bold text-gray-900">
                {formatARS(totalPrice)}
              </span>
            </div>
            <button
              onClick={handleWhatsApp}
              className="w-full rounded-full py-4 text-base font-bold flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#25D366", color: "#fff" }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Pedir por WhatsApp
            </button>
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
    <section id={section.id} className="scroll-mt-28">
      <h2 className="text-2xl font-bold text-gray-900 mb-5">{section.name}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
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
    <footer className="mt-16 border-t border-gray-200 py-8 px-4 text-center text-sm text-gray-400">
      <p>
        <span className="font-semibold" style={{ color: store.accentColor }}>
          {store.name}
        </span>{" "}
        · Todos los precios en pesos argentinos (ARS)
      </p>
      <p className="mt-1">
        Tienda creada con{" "}
        <a href="/" className="font-semibold text-[#F5C84B] hover:underline">
          Wapy
        </a>
      </p>
    </footer>
  );
}

// ─── Floating cart button (mobile, shows only when cart is closed) ─────────────

function FloatingCartButton({ accentColor, accentForeground }: { accentColor: string; accentForeground: string }) {
  const { totalItems, openCart, open } = useCart();
  if (open || totalItems === 0) return null;
  return (
    <button
      onClick={openCart}
      className="fixed bottom-5 right-5 z-30 sm:hidden flex items-center gap-2 rounded-full px-4 py-3 shadow-lg font-bold text-sm transition-opacity hover:opacity-90"
      style={{ backgroundColor: accentColor, color: accentForeground }}
      aria-label="Ver carrito"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
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

      <main className="mx-auto w-full max-w-6xl px-4 py-10 flex flex-col gap-12">
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
      <FloatingCartButton accentColor={store.accentColor} accentForeground={store.accentForeground} />

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
