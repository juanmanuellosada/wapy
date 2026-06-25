"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
} from "react";

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
  // Fix: use variantPrice when set, falling back to price (aligns with handleWhatsApp)
  const totalPrice = state.items.reduce(
    (s, i) => s + (i.variantPrice ?? i.price) * i.quantity,
    0
  );

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
