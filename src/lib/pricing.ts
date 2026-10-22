// Fiyat hesaplama kuralları.
// Prototipte istemcide çalışır; gerçek sistemde aynı fonksiyon sunucuda çalışacak ve
// sipariş satırına o anki liste fiyatı, iskonto oranı ve net fiyat kopyalanacaktır.

import type { Product } from "./products";

export const VAT_RATE = 0.2;

export type PricingContext = {
  discountRate: number; // müşterinin iskonto grubu oranı (%)
  specialPrices: Record<string, number>; // ürün id → yöneticinin tanımladığı özel net fiyat
};

export type UnitPrice = {
  list: number;
  net: number;
  discountRate: number;
  source: "group" | "special";
};

/** Öncelik: müşteriye özel fiyat → iskonto grubu oranı. */
export function unitPrice(product: Product, ctx: PricingContext): UnitPrice {
  const special = ctx.specialPrices[product.id];
  if (special !== undefined) {
    return {
      list: product.listPrice,
      net: special,
      discountRate: Math.round((1 - special / product.listPrice) * 100),
      source: "special",
    };
  }
  return {
    list: product.listPrice,
    net: round2(product.listPrice * (1 - ctx.discountRate / 100)),
    discountRate: ctx.discountRate,
    source: "group",
  };
}

export type Totals = { list: number; discount: number; subtotal: number; vat: number; total: number };

export function cartTotals(lines: { product: Product; qty: number }[], ctx: PricingContext): Totals {
  let list = 0;
  let subtotal = 0;
  for (const { product, qty } of lines) {
    const p = unitPrice(product, ctx);
    list += p.list * qty;
    subtotal += p.net * qty;
  }
  const vat = round2(subtotal * VAT_RATE);
  return { list, discount: round2(list - subtotal), subtotal: round2(subtotal), vat, total: round2(subtotal + vat) };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
