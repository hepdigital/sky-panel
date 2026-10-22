// Prototip için örnek veriler. Gerçek sistemde API'den gelecek.

import { cartTotals } from "./pricing";
import { getProduct } from "./products";

export const currentCustomer = {
  firmName: "Akdeniz Reklam Ltd. Şti.",
  cariCode: "120.01.0457",
  contactName: "Mehmet Yılmaz",
  initials: "MY",
  discountGroup: "Bayi B",
  discountRate: 20,
  salesRep: { name: "Elif Kaya", phone: "+90 532 000 00 00" },
};

/** Yönetici tarafından bu müşteriye tanımlanmış özel fiyatlar (ürün id → net birim fiyat). */
export const customerPricing = {
  discountRate: currentCustomer.discountRate,
  specialPrices: { "15888": 1_250 } as Record<string, number>,
};

export type Address = {
  id: string;
  label: string;
  type: "own" | "customer";
  contact: string;
  phone: string;
  line: string;
  city: string;
};

export const addresses: Address[] = [
  {
    id: "adr-1",
    label: "Merkez ofis",
    type: "own",
    contact: "Mehmet Yılmaz",
    phone: "0532 111 22 33",
    line: "Liman Mah. 27. Sok. No:14",
    city: "Konyaaltı / Antalya",
  },
  {
    id: "adr-2",
    label: "Depo",
    type: "own",
    contact: "Serkan Demir",
    phone: "0533 444 55 66",
    line: "Organize Sanayi Böl. 4. Cad. No:8",
    city: "Döşemealtı / Antalya",
  },
  {
    id: "adr-3",
    label: "Mavi Kafe (müşteri)",
    type: "customer",
    contact: "Ayşe Korkmaz",
    phone: "0535 777 88 99",
    line: "Lara Cad. No:112",
    city: "Muratpaşa / Antalya",
  },
];

export const factoryPickup = {
  label: "Fabrikadan teslim al",
  line: "Sky Görsel Çözümler Üretim Tesisi",
  city: "İstanbul",
};

export const account = {
  balance: 48_750.4, // borç (+)
  overdue: 12_400,
  prepaid: 5_000,
  creditLimit: 150_000,
  creditUsed: 48_750.4,
  nextDue: { date: "2026-10-24", amount: 18_200 },
  totalDebit: 271_580.4,
  totalCredit: 222_830,
  lastPayment: { date: "2026-10-03", amount: 26_000 },
};

export type PaymentStatus = "paid" | "partial" | "pending" | "on_account";
export type ProductionStatus =
  | "awaiting_approval"
  | "design"
  | "design_review"
  | "production"
  | "ready"
  | "shipped"
  | "delivered";

export type OrderLine = { productId: string; qty: number };

export type Order = {
  id: string;
  date: string;
  items: string;
  itemCount: number;
  lines: OrderLine[];
  /** KDV dahil toplam */
  total: number;
  payment: PaymentStatus;
  production: ProductionStatus;
};

function order(o: Omit<Order, "items" | "itemCount" | "total">): Order {
  const lines = o.lines.map((l) => ({ product: getProduct(l.productId)!, qty: l.qty }));
  const t = cartTotals(lines, customerPricing);
  return {
    ...o,
    items: lines[0].product.name + (lines.length > 1 ? ` +${lines.length - 1} ürün` : ""),
    itemCount: lines.reduce((s, l) => s + l.qty, 0),
    total: t.total,
  };
}

export const recentOrders: Order[] = [
  order({ id: "SP-2026-0981", date: "2026-10-14", lines: [{ productId: "18914", qty: 2 }, { productId: "15758", qty: 4 }], payment: "on_account", production: "design_review" }),
  order({ id: "SP-2026-0954", date: "2026-10-09", lines: [{ productId: "16781", qty: 12 }], payment: "paid", production: "production" }),
  order({ id: "SP-2026-0921", date: "2026-10-02", lines: [{ productId: "16251", qty: 6 }], payment: "paid", production: "shipped" }),
  order({ id: "SP-2026-0877", date: "2026-09-25", lines: [{ productId: "15888", qty: 10 }], payment: "partial", production: "delivered" }),
  order({ id: "SP-2026-0842", date: "2026-09-18", lines: [{ productId: "16286", qty: 1 }, { productId: "15658", qty: 4 }], payment: "paid", production: "delivered" }),
  order({ id: "SP-2026-0810", date: "2026-09-11", lines: [{ productId: "15758", qty: 20 }], payment: "paid", production: "delivered" }),
];

export function getOrder(id: string) {
  return recentOrders.find((o) => o.id === id);
}

export const paymentStatusMeta: Record<PaymentStatus, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  paid: { label: "Ödendi", tone: "success" },
  partial: { label: "Kısmi ödendi", tone: "warning" },
  pending: { label: "Ödeme bekliyor", tone: "danger" },
  on_account: { label: "Cariye işlendi", tone: "info" },
};

export const productionSteps: { key: ProductionStatus; label: string; short: string }[] = [
  { key: "awaiting_approval", label: "Sipariş onayı", short: "Onay" },
  { key: "design", label: "Tasarım hazırlanıyor", short: "Tasarım" },
  { key: "design_review", label: "Tasarım onayınızda", short: "Onayınız" },
  { key: "production", label: "Üretimde", short: "Üretim" },
  { key: "ready", label: "Sevkiyata hazır", short: "Hazır" },
  { key: "shipped", label: "Kargoda", short: "Kargo" },
  { key: "delivered", label: "Teslim edildi", short: "Teslim" },
];

export const productionStatusMeta: Record<ProductionStatus, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  awaiting_approval: { label: "Onay bekliyor", tone: "neutral" },
  design: { label: "Tasarımda", tone: "info" },
  design_review: { label: "Tasarım onayınızda", tone: "warning" },
  production: { label: "Üretimde", tone: "info" },
  ready: { label: "Sevkiyata hazır", tone: "success" },
  shipped: { label: "Kargoda", tone: "info" },
  delivered: { label: "Teslim edildi", tone: "success" },
};

export const monthlyActivity = [
  { month: "May", alim: 32_400, odeme: 28_000 },
  { month: "Haz", alim: 45_800, odeme: 40_000 },
  { month: "Tem", alim: 38_200, odeme: 42_500 },
  { month: "Ağu", alim: 52_600, odeme: 35_000 },
  { month: "Eyl", alim: 61_300, odeme: 55_000 },
  { month: "Eki", alim: 41_280, odeme: 26_000 },
];

export const upcomingDues = [
  { id: "FT-2026-1180", date: "2026-10-08", amount: 12_400, overdue: true },
  { id: "FT-2026-1214", date: "2026-10-24", amount: 18_200, overdue: false },
  { id: "FT-2026-1263", date: "2026-11-07", amount: 18_150.4, overdue: false },
];

export const pendingQuote = {
  id: "TK-2026-0312",
  title: "Fuar standı paketi · 4 kalem",
  total: 64_500,
  validUntil: "2026-10-21",
};
