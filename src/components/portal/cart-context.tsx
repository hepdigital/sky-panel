"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { customerPricing } from "@/lib/mock";
import { cartTotals, type Totals } from "@/lib/pricing";
import { getProduct, type Product } from "@/lib/products";

type CartLine = { product: Product; qty: number };

type CartValue = {
  /** Sepet tarayıcı hafızasından yüklendi mi */
  ready: boolean;
  lines: CartLine[];
  count: number;
  totals: Totals;
  qtyOf: (id: string) => number;
  setQty: (id: string, qty: number) => void;
  add: (id: string, qty?: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartValue | null>(null);
const STORAGE_KEY = "sky-b2b-cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);

  // Prototipte sepet tarayıcıda tutulur; gerçek sistemde sunucuda saklanacak.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- yalnızca ilk yüklemede okunur
      if (raw) setItems(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items, loaded]);

  const value = useMemo<CartValue>(() => {
    const lines = Object.entries(items)
      .map(([id, qty]) => ({ product: getProduct(id), qty }))
      .filter((l): l is CartLine => !!l.product && l.qty > 0);
    const setQty = (id: string, qty: number) =>
      setItems((prev) => {
        const next = { ...prev };
        if (qty <= 0) delete next[id];
        else next[id] = Math.min(qty, 999);
        return next;
      });
    return {
      ready: loaded,
      lines,
      count: lines.reduce((s, l) => s + l.qty, 0),
      totals: cartTotals(lines, customerPricing),
      qtyOf: (id) => items[id] ?? 0,
      setQty,
      add: (id, qty = 1) => setQty(id, (items[id] ?? 0) + qty),
      clear: () => setItems({}),
    };
  }, [items, loaded]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
