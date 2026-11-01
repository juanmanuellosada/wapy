"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import {
  resolveTieredPrice,
  tierGroupKey,
  nextTier,
  resolveProductLinePrices,
  multibuyLabel,
  type MultibuyOffer,
  type PriceTier,
} from "@/lib/store/pricing";

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  // Variant fields — null/undefined for simple products
  variantId?: string | null;
  variantLabel?: string | null;
  variantPrice?: number | null;
  variantImageUrl?: string | null;
  // Tramos por cantidad (design.md, Decisión 4). Viajan dentro del item porque el
  // CartProvider solo recibe el slug, no el catálogo, y así el carrito sobrevive un
  // reload sin perder el tramo. Que queden stale no importa: createPendingOrder
  // recalcula todo desde la DB y nunca confía en el precio del cliente.
  priceTiers?: PriceTier[];
  /** Precio base del PRODUCTO en centavos — necesario para el ratio en variantes. */
  productPriceCents?: number;
  /** Precio regular de ESTA línea en centavos (override de variante si hay). */
  regularPriceCents?: number;
  /** Precio efectivo (ya con promo) de esta línea en centavos, sin tramo. */
  effectivePriceCents?: number;
  /**
   * Oferta NxM del producto (add-multibuy-offers). Viaja en el item por la misma
   * razón que los tramos; puede quedar stale, el servidor recalcula todo.
   */
  multibuy?: MultibuyOffer | null;
}

/**
 * Suma las cantidades del carrito por grupo de tramos. Los productos que comparten
 * la misma escalera combinan: 1 alfajor de cada sabor cuenta como 3 unidades.
 * Los items sin tramos no entran en ningún grupo.
 */
function aggregateQtyByGroup(items: CartItem[]): Map<string, number> {
  const byGroup = new Map<string, number>();
  for (const i of items) {
    const key = tierGroupKey(i.priceTiers);
    if (!key) continue;
    byGroup.set(key, (byGroup.get(key) ?? 0) + i.quantity);
  }
  return byGroup;
}

/** Cantidad que decide el tramo de una línea: la de su grupo, o la suya si no tiene tramos. */
function tierQtyForItem(item: CartItem, byGroup: Map<string, number>): number {
  const key = tierGroupKey(item.priceTiers);
  return key ? byGroup.get(key) ?? item.quantity : item.quantity;
}

/** Precio unitario de una línea en centavos, resolviendo promo + tramo por cantidad. */
export function cartLineUnitCents(item: CartItem, aggregatedQty: number): number {
  // Items viejos en localStorage (anteriores a los tramos) no traen los campos en
  // centavos: se reconstruyen desde el precio en ARS que sí guardaban.
  const fallbackCents = Math.round((item.variantPrice ?? item.price) * 100);
  const regularCents = item.regularPriceCents ?? fallbackCents;
  const effectiveCents = item.effectivePriceCents ?? fallbackCents;
  const productPriceCents = item.productPriceCents ?? regularCents;
  const promoCents = effectiveCents < regularCents ? effectiveCents : null;
  const isVariant = item.variantId != null;

  return resolveTieredPrice(
    {
      price_cents: isVariant ? productPriceCents : regularCents,
      promo_price_cents: isVariant ? null : promoCents,
    },
    isVariant ? { price_override: regularCents, promo_price_override: promoCents } : null,
    aggregatedQty,
    item.priceTiers
  ).unitCents;
}

/**
 * Cuánto le falta a un grupo de tramos para llegar al siguiente escalón. Se usa
 * para el aviso del carrito ("sumá 2 unidades más y pagás $933,33 c/u").
 */
export interface TierProgress {
  groupKey: string;
  /** Unidades que faltan para alcanzar el próximo tramo. */
  missing: number;
  /** Precio por unidad al que quedaría ese próximo tramo. */
  nextUnitCents: number;
  /** Cantidad que ya hay en el carrito de ese grupo. */
  currentQty: number;
  /** true si el grupo abarca más de un producto del carrito. */
  multiProduct: boolean;
}

/** Precio de una línea del carrito ya resuelto, en ARS. */
export interface CartLinePrice {
  /** Unitario que se cobra (con tramo aplicado si corresponde). */
  unitPrice: number;
  /** Unitario sin tramo (promo o regular) — para tacharlo cuando el tramo aplica. */
  basePrice: number;
  /** true cuando el tramo por cantidad abarató esta línea. */
  onTier: boolean;
  /** Descuento NxM de la línea en ARS (0 si no aplica). Se resta de unitPrice x cantidad. */
  discount: number;
  /** "2x1" si el NxM ganó en esta línea, o null. */
  offerLabel: string | null;
}

/** Aviso del carrito: a este producto le falta 1 unidad para activar su NxM. */
export interface MultibuyHint {
  productId: string;
  name: string;
  label: string;
}

/**
 * Precio resuelto de cada línea del carrito, indexado por `cartItemKey`.
 * Pura: la usan el provider y el compartir-carrito para no divergir.
 */
export function computeCartLinePrices(items: CartItem[]): Map<string, CartLinePrice> {
  const byGroup = aggregateQtyByGroup(items);
  const prices = new Map<string, CartLinePrice>();
  for (const i of items) {
    const key = cartItemKey(i.productId, i.variantId);
    const unitPrice = cartLineUnitCents(i, tierQtyForItem(i, byGroup)) / 100;
    const basePrice = i.variantPrice ?? i.price;
    prices.set(key, { unitPrice, basePrice, onTier: unitPrice < basePrice, discount: 0, offerLabel: null });
  }

  // Oferta NxM: por producto, con el mismo helper que usa el servidor.
  const byProduct = new Map<string, CartItem[]>();
  for (const i of items) {
    if (!i.multibuy) continue;
    byProduct.set(i.productId, [...(byProduct.get(i.productId) ?? []), i]);
  }
  for (const lines of byProduct.values()) {
    const results = resolveProductLinePrices(
      lines.map((l) => ({
        key: cartItemKey(l.productId, l.variantId),
        regularCents: l.regularPriceCents ?? Math.round((l.variantPrice ?? l.price) * 100),
        tieredUnitCents: Math.round(
          (prices.get(cartItemKey(l.productId, l.variantId))?.unitPrice ?? l.price) * 100
        ),
        quantity: l.quantity,
      })),
      lines[0].multibuy ?? null
    );
    // Si el NxM ganó, TODAS las líneas del producto pasan a precio regular (aunque
    // alguna no lleve unidades bonificadas); si no, se mantiene promo/tramo.
    if (!results.some((r) => r.offerLabel)) continue;
    for (const r of results) {
      const prev = prices.get(r.key);
      if (!prev) continue;
      prices.set(r.key, {
        unitPrice: r.unitCents / 100,
        basePrice: prev.basePrice,
        onTier: false,
        discount: r.discountCents / 100,
        offerLabel: r.offerLabel,
      });
    }
  }
  return prices;
}

/** Productos del carrito a los que les falta exactamente 1 unidad para el próximo grupo NxM. */
export function computeMultibuyHints(items: CartItem[]): MultibuyHint[] {
  const qtyByProduct = new Map<string, { item: CartItem; qty: number }>();
  for (const i of items) {
    if (!i.multibuy) continue;
    const prev = qtyByProduct.get(i.productId);
    qtyByProduct.set(i.productId, { item: prev?.item ?? i, qty: (prev?.qty ?? 0) + i.quantity });
  }
  const hints: MultibuyHint[] = [];
  for (const { item, qty } of qtyByProduct.values()) {
    const offer = item.multibuy!;
    if (qty % offer.buy === offer.buy - 1) {
      hints.push({ productId: item.productId, name: item.name, label: multibuyLabel(offer) });
    }
  }
  return hints;
}

/** Un aviso por grupo de tramos que todavía tiene un escalón por encima. */
export function computeTierProgress(items: CartItem[]): TierProgress[] {
  const byGroup = aggregateQtyByGroup(items);
  const progress: TierProgress[] = [];

  for (const [groupKey, currentQty] of byGroup) {
    const inGroup = items.filter((i) => tierGroupKey(i.priceTiers) === groupKey);
    const tiers = inGroup[0]?.priceTiers;
    const next = nextTier(tiers, currentQty);
    if (!next) continue;
    progress.push({
      groupKey,
      missing: next.min_quantity - currentQty,
      nextUnitCents: next.unit_price_cents,
      currentQty,
      multiProduct: new Set(inGroup.map((i) => i.productId)).size > 1,
    });
  }

  return progress;
}

/** Stable key used to identify a cart line (product + variant combo). */
export function cartItemKey(productId: string, variantId?: string | null): string {
  return variantId ? `${productId}::${variantId}` : productId;
}

export interface AppliedCoupon {
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
}

interface CartState {
  items: CartItem[];
  open: boolean;
  appliedCoupon: AppliedCoupon | null;
}

type CartAction =
  | { type: "ADD"; item: Omit<CartItem, "quantity"> }
  | { type: "REMOVE"; key: string }
  | { type: "SET_QTY"; key: string; qty: number }
  | { type: "SET_OPEN"; open: boolean }
  | { type: "HYDRATE"; items: CartItem[]; appliedCoupon?: AppliedCoupon | null }
  | { type: "APPLY_COUPON"; coupon: AppliedCoupon }
  | { type: "REMOVE_COUPON" };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD": {
      const key = cartItemKey(action.item.productId, action.item.variantId);
      const existing = state.items.find(
        (i) => cartItemKey(i.productId, i.variantId) === key
      );
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            cartItemKey(i.productId, i.variantId) === key
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        };
      }
      return {
        ...state,
        items: [...state.items, { ...action.item, quantity: 1 }],
      };
    }
    case "REMOVE":
      return {
        ...state,
        items: state.items.filter(
          (i) => cartItemKey(i.productId, i.variantId) !== action.key
        ),
      };
    case "SET_QTY": {
      if (action.qty <= 0) {
        return {
          ...state,
          items: state.items.filter(
            (i) => cartItemKey(i.productId, i.variantId) !== action.key
          ),
        };
      }
      return {
        ...state,
        items: state.items.map((i) =>
          cartItemKey(i.productId, i.variantId) === action.key
            ? { ...i, quantity: action.qty }
            : i
        ),
      };
    }
    case "SET_OPEN":
      return { ...state, open: action.open };
    case "HYDRATE":
      return { ...state, items: action.items, appliedCoupon: action.appliedCoupon ?? null };
    case "APPLY_COUPON":
      return { ...state, appliedCoupon: action.coupon };
    case "REMOVE_COUPON":
      return { ...state, appliedCoupon: null };
    default:
      return state;
  }
}

interface CartContextValue {
  items: CartItem[];
  open: boolean;
  totalItems: number;
  totalPrice: number;
  /** Precio resuelto por línea, indexado por `cartItemKey(productId, variantId)`. */
  linePrices: Map<string, CartLinePrice>;
  /** Grupos de tramos a los que les falta poco para el próximo escalón. */
  tierProgress: TierProgress[];
  /** Avisos "sumá 1 más y llevás 2x1". */
  multibuyHints: MultibuyHint[];
  appliedCoupon: AppliedCoupon | null;
  discountAmount: number;
  finalTotal: number;
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  openCart: () => void;
  closeCart: () => void;
  applyCoupon: (coupon: AppliedCoupon) => void;
  removeCoupon: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const storageKey = `wapy-cart-${slug}`;
  const [state, dispatch] = useReducer(cartReducer, { items: [], open: false, appliedCoupon: null });

  // Hydrate from localStorage once on mount (client only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { items: CartItem[]; appliedCoupon?: AppliedCoupon | null } | CartItem[];
        // Support both old format (plain array) and new format (object with items + appliedCoupon)
        if (Array.isArray(parsed)) {
          dispatch({ type: "HYDRATE", items: parsed, appliedCoupon: null });
        } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
          dispatch({ type: "HYDRATE", items: parsed.items, appliedCoupon: parsed.appliedCoupon ?? null });
        }
      }
    } catch {
      // Ignore parse errors
    }
    // If the buyer was sent back here to retry a payment (e.g. from the MP
    // failure page), open the cart automatically so they see it's intact.
    try {
      if (new URLSearchParams(window.location.search).get("cart") === "open") {
        dispatch({ type: "SET_OPEN", open: true });
      }
    } catch {
      // Ignore (e.g. no window)
    }
  }, [storageKey]);

  // Persist cart to localStorage whenever items or coupon change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ items: state.items, appliedCoupon: state.appliedCoupon }));
    } catch {
      // Ignore write errors (private browsing, quota, etc.)
    }
  }, [storageKey, state.items, state.appliedCoupon]);

  const addItem = useCallback(
    (item: Omit<CartItem, "quantity">) => dispatch({ type: "ADD", item }),
    []
  );
  const removeItem = useCallback(
    (key: string) => dispatch({ type: "REMOVE", key }),
    []
  );
  const setQty = useCallback(
    (key: string, qty: number) =>
      dispatch({ type: "SET_QTY", key, qty }),
    []
  );
  const openCart = useCallback(
    () => dispatch({ type: "SET_OPEN", open: true }),
    []
  );
  const closeCart = useCallback(
    () => dispatch({ type: "SET_OPEN", open: false }),
    []
  );
  const applyCoupon = useCallback(
    (coupon: AppliedCoupon) => dispatch({ type: "APPLY_COUPON", coupon }),
    []
  );
  const removeCoupon = useCallback(
    () => dispatch({ type: "REMOVE_COUPON" }),
    []
  );

  const totalItems = state.items.reduce((s, i) => s + i.quantity, 0);

  // Tramos por cantidad: la cantidad que activa el tramo se agrega por GRUPO de
  // escalera (productos con los mismos tramos combinan entre sí), igual que el
  // cálculo server-side en createPendingOrder.
  const linePrices = useMemo(() => computeCartLinePrices(state.items), [state.items]);
  const tierProgress = useMemo(() => computeTierProgress(state.items), [state.items]);
  const multibuyHints = useMemo(() => computeMultibuyHints(state.items), [state.items]);

  const totalPrice = state.items.reduce((s, i) => {
    const line = linePrices.get(cartItemKey(i.productId, i.variantId));
    return s + (line?.unitPrice ?? i.variantPrice ?? i.price) * i.quantity - (line?.discount ?? 0);
  }, 0);

  // Derive discount and finalTotal from appliedCoupon + totalPrice
  let discountAmount = 0;
  if (state.appliedCoupon && totalPrice > 0) {
    if (state.appliedCoupon.discountType === 'percent') {
      discountAmount = Math.round(totalPrice * state.appliedCoupon.discountValue / 100 * 100) / 100;
    } else {
      discountAmount = Math.min(state.appliedCoupon.discountValue, totalPrice);
    }
  }
  const finalTotal = Math.max(0, totalPrice - discountAmount);

  return (
    <CartContext.Provider
      value={{
        items: state.items,
        open: state.open,
        totalItems,
        totalPrice,
        linePrices,
        tierProgress,
        multibuyHints,
        appliedCoupon: state.appliedCoupon,
        discountAmount,
        finalTotal,
        addItem,
        removeItem,
        setQty,
        openCart,
        closeCart,
        applyCoupon,
        removeCoupon,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
