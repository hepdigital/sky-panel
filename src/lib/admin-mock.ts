// Yönetim paneli örnek verileri. Gerçek sistemde API'den gelecek.

import type { PaymentStatus, ProductionStatus } from "./mock";

export type Role = "admin" | "sales" | "design" | "production" | "warehouse" | "finance";

export const roles: { key: Role; label: string; user: string; initials: string }[] = [
  { key: "admin", label: "Yönetici", user: "Kadir Can", initials: "KC" },
  { key: "sales", label: "Satış", user: "Elif Kaya", initials: "EK" },
  { key: "design", label: "Tasarım", user: "Burak Aydın", initials: "BA" },
  { key: "production", label: "Üretim", user: "Hakan Öz", initials: "HÖ" },
  { key: "warehouse", label: "Depo & Sevkiyat", user: "Murat Şen", initials: "MŞ" },
  { key: "finance", label: "Finans", user: "Selin Acar", initials: "SA" },
];

export type AdminCustomer = {
  id: string;
  name: string;
  city: string;
  group: string;
  rep: string;
  balance: number;
  overdue: number;
  limit: number;
  status: "active" | "blocked" | "prospect";
};

export const adminCustomers: AdminCustomer[] = [
  { id: "C-0457", name: "Akdeniz Reklam Ltd. Şti.", city: "Antalya", group: "Bayi B", rep: "Elif Kaya", balance: 48_750.4, overdue: 12_400, limit: 150_000, status: "active" },
  { id: "C-0312", name: "Ege Promosyon A.Ş.", city: "İzmir", group: "Bayi A", rep: "Ozan Tekin", balance: 132_400, overdue: 0, limit: 250_000, status: "active" },
  { id: "C-0388", name: "Marmara Fuarcılık", city: "İstanbul", group: "Kurumsal", rep: "Elif Kaya", balance: 214_900, overdue: 86_300, limit: 200_000, status: "blocked" },
  { id: "C-0501", name: "Kapadokya Etkinlik", city: "Nevşehir", group: "Bayi C", rep: "Ozan Tekin", balance: 18_200, overdue: 0, limit: 60_000, status: "active" },
  { id: "C-0419", name: "Karadeniz Matbaa", city: "Trabzon", group: "Bayi B", rep: "Deniz Yurt", balance: 67_850, overdue: 23_100, limit: 100_000, status: "active" },
  { id: "C-0477", name: "Başkent Organizasyon", city: "Ankara", group: "Bayi A", rep: "Deniz Yurt", balance: 9_400, overdue: 0, limit: 180_000, status: "active" },
];

export type AdminOrder = {
  id: string;
  customer: string;
  rep: string;
  date: string;
  total: number;
  payment: PaymentStatus;
  production: ProductionStatus;
  dueDate: string; // planlanan sevk tarihi
  late?: boolean;
  owner?: string; // aşamadaki sorumlu
  needsApproval?: "limit" | "overdue";
  items?: string;
};

export const adminOrders: AdminOrder[] = [
  { id: "SP-2026-0990", items: "3x6 Gazebo baskılı · 2 adet", customer: "Marmara Fuarcılık", rep: "Elif Kaya", date: "2026-10-16", total: 58_920, payment: "pending", production: "awaiting_approval", dueDate: "2026-10-24", needsApproval: "limit" },
  { id: "SP-2026-0988", items: "Beach flag 100x400 · 12 adet", customer: "Karadeniz Matbaa", rep: "Deniz Yurt", date: "2026-10-15", total: 21_340, payment: "on_account", production: "awaiting_approval", dueDate: "2026-10-23", needsApproval: "overdue" },
  { id: "SP-2026-0985", items: "Örümcek stand 300x225 · 6 adet", customer: "Ege Promosyon A.Ş.", rep: "Ozan Tekin", date: "2026-10-15", total: 96_480, payment: "paid", production: "design", dueDate: "2026-10-22", owner: "Burak Aydın" },
  { id: "SP-2026-0981", items: "3x3 Gazebo + damla bayrak", customer: "Akdeniz Reklam Ltd. Şti.", rep: "Elif Kaya", date: "2026-10-14", total: 43_776, payment: "on_account", production: "design_review", dueDate: "2026-10-21", owner: "Müşteri onayı" },
  { id: "SP-2026-0976", items: "Roll-up · 20 adet", customer: "Başkent Organizasyon", rep: "Deniz Yurt", date: "2026-10-13", total: 34_150, payment: "paid", production: "design_review", dueDate: "2026-10-20", owner: "Müşteri onayı", late: true },
  { id: "SP-2026-0969", items: "2x3 Gazebo · 1 adet", customer: "Kapadokya Etkinlik", rep: "Ozan Tekin", date: "2026-10-11", total: 18_200, payment: "on_account", production: "production", dueDate: "2026-10-17", owner: "Hakan Öz" },
  { id: "SP-2026-0962", items: "3x6 Gazebo 4 duvar · 2 adet", customer: "Ege Promosyon A.Ş.", rep: "Ozan Tekin", date: "2026-10-09", total: 71_900, payment: "paid", production: "production", dueDate: "2026-10-15", owner: "Hakan Öz", late: true },
  { id: "SP-2026-0954", items: "Beach flag · 12 adet", customer: "Akdeniz Reklam Ltd. Şti.", rep: "Elif Kaya", date: "2026-10-09", total: 22_176, payment: "paid", production: "production", dueDate: "2026-10-18", owner: "Hakan Öz" },
  { id: "SP-2026-0948", items: "A pano 60x100 · 4 adet", customer: "Başkent Organizasyon", rep: "Deniz Yurt", date: "2026-10-08", total: 12_870, payment: "paid", production: "ready", dueDate: "2026-10-16", owner: "Murat Şen" },
  { id: "SP-2026-0941", items: "Katlanır sandalye · 30 adet", customer: "Karadeniz Matbaa", rep: "Deniz Yurt", date: "2026-10-06", total: 27_400, payment: "partial", production: "ready", dueDate: "2026-10-14", owner: "Murat Şen", late: true },
  { id: "SP-2026-0936", items: "Damla bayrak · 20 adet", customer: "Ege Promosyon A.Ş.", rep: "Ozan Tekin", date: "2026-10-05", total: 36_960, payment: "paid", production: "shipped", dueDate: "2026-10-13", owner: "Aras Kargo" },
  { id: "SP-2026-0930", items: "Masa örtüsü · 8 adet", customer: "Kapadokya Etkinlik", rep: "Ozan Tekin", date: "2026-10-03", total: 15_840, payment: "on_account", production: "shipped", dueDate: "2026-10-12", owner: "Yurtiçi Kargo" },
  { id: "SP-2026-0983", items: "X banner · 15 adet", customer: "Başkent Organizasyon", rep: "Deniz Yurt", date: "2026-10-15", total: 17_424, payment: "paid", production: "design", dueDate: "2026-10-21", owner: "Burak Aydın" },
  { id: "SP-2026-0979", items: "Gönder bayrağı · 50 adet", customer: "Karadeniz Matbaa", rep: "Deniz Yurt", date: "2026-10-14", total: 29_040, payment: "on_account", production: "production", dueDate: "2026-10-19", owner: "Hakan Öz" },
];

export const stageMeta: { key: ProductionStatus; label: string }[] = [
  { key: "awaiting_approval", label: "Onay" },
  { key: "design", label: "Tasarım" },
  { key: "design_review", label: "Müşteri onayı" },
  { key: "production", label: "Üretim" },
  { key: "ready", label: "Sevke hazır" },
  { key: "shipped", label: "Kargoda" },
];

/** Aşama başına toplam iş sayısı (yalnızca listedeki değil, tüm açık siparişler). */
export const pipeline: Record<string, { count: number; late: number }> = {
  awaiting_approval: { count: 3, late: 0 },
  design: { count: 7, late: 1 },
  design_review: { count: 4, late: 1 },
  production: { count: 12, late: 2 },
  ready: { count: 5, late: 1 },
  shipped: { count: 9, late: 0 },
};

export const salesTrend = [
  { month: "Kas", buYil: 612_000, gecenYil: 498_000 },
  { month: "Ara", buYil: 540_000, gecenYil: 455_000 },
  { month: "Oca", buYil: 488_000, gecenYil: 420_000 },
  { month: "Şub", buYil: 530_000, gecenYil: 446_000 },
  { month: "Mar", buYil: 702_000, gecenYil: 588_000 },
  { month: "Nis", buYil: 865_000, gecenYil: 701_000 },
  { month: "May", buYil: 1_040_000, gecenYil: 862_000 },
  { month: "Haz", buYil: 1_182_000, gecenYil: 951_000 },
  { month: "Tem", buYil: 1_096_000, gecenYil: 990_000 },
  { month: "Ağu", buYil: 938_000, gecenYil: 870_000 },
  { month: "Eyl", buYil: 846_000, gecenYil: 735_000 },
  { month: "Eki", buYil: 524_000, gecenYil: 690_000 },
];

export const kpis = {
  monthSales: 524_000,
  monthSalesPrev: 461_000, // geçen ayın aynı dönemi
  orders: 68,
  ordersPrev: 61,
  avgOrder: 7_706,
  avgOrderPrev: 7_557,
  collections: 418_500,
  overdueTotal: 184_250,
  overdueCustomers: 7,
};

export const repPerformance = [
  { name: "Elif Kaya", initials: "EK", quotes: 42, won: 29, sales: 214_600, target: 250_000 },
  { name: "Ozan Tekin", initials: "OT", quotes: 35, won: 21, sales: 186_900, target: 220_000 },
  { name: "Deniz Yurt", initials: "DY", quotes: 28, won: 13, sales: 122_500, target: 180_000 },
];

export type Task = { id: string; title: string; customer?: string; due: string; kind: "call" | "quote" | "collection" | "design" | "ship" };

export const tasksByRole: Record<Role, Task[]> = {
  admin: [
    { id: "t1", title: "Marmara Fuarcılık limit aşımı onayı", customer: "₺58.920 sipariş", due: "Bugün", kind: "collection" },
    { id: "t2", title: "Karadeniz Matbaa vadesi geçmiş borç onayı", customer: "₺21.340 sipariş", due: "Bugün", kind: "collection" },
    { id: "t3", title: "Ekim fiyat listesi güncellemesi", due: "18 Eki", kind: "quote" },
  ],
  sales: [
    { id: "s1", title: "Teklif takibi: Fuar standı paketi", customer: "Akdeniz Reklam", due: "Bugün", kind: "quote" },
    { id: "s2", title: "Geri arama: yeni bayi başvurusu", customer: "Muğla Tanıtım", due: "Bugün 15:00", kind: "call" },
    { id: "s3", title: "Vadesi geçen borç hatırlatması", customer: "Marmara Fuarcılık", due: "Yarın", kind: "collection" },
  ],
  design: [
    { id: "d1", title: "Revizyon: alınlıkta logo büyütülecek", customer: "Ege Promosyon · SP-0985", due: "Bugün", kind: "design" },
    { id: "d2", title: "Yeni tasarım: 3x6 gazebo 4 duvar", customer: "Kapadokya Etkinlik", due: "17 Eki", kind: "design" },
  ],
  production: [
    { id: "p1", title: "Geciken iş: SP-0962 baskı hattı", customer: "Ege Promosyon", due: "Gecikti", kind: "design" },
    { id: "p2", title: "Kumaş stoku kontrolü (beyaz polyester)", due: "Bugün", kind: "ship" },
  ],
  warehouse: [
    { id: "w1", title: "Kargo teslimi: 5 paket hazır", customer: "Aras Kargo 16:00", due: "Bugün", kind: "ship" },
    { id: "w2", title: "Geciken sevk: SP-0941", customer: "Karadeniz Matbaa · kısmi ödeme", due: "Gecikti", kind: "ship" },
  ],
  finance: [
    { id: "f1", title: "Limit aşımı onayı", customer: "Marmara Fuarcılık · ₺58.920", due: "Bugün", kind: "collection" },
    { id: "f2", title: "Havale eşleştirme: 3 tanımsız tahsilat", due: "Bugün", kind: "collection" },
    { id: "f3", title: "Vade hatırlatma SMS'leri", customer: "7 müşteri", due: "Yarın", kind: "call" },
  ],
};

export const activity = [
  { who: "Selin Acar", what: "SP-2026-0976 için tahsilatı onayladı", when: "10 dk önce" },
  { who: "Akdeniz Reklam", what: "SP-2026-0981 tasarımında revizyon istedi", when: "32 dk önce" },
  { who: "Kadir Can", what: "Bayi B iskonto oranını %18 → %20 yaptı", when: "1 saat önce" },
  { who: "Hakan Öz", what: "SP-2026-0954 üretime alındı", when: "2 saat önce" },
  { who: "Elif Kaya", what: "Ege Promosyon için TK-2026-0318 teklifini gönderdi", when: "3 saat önce" },
];

export const discountGroups = [
  { key: "Bayi A", rate: 25 },
  { key: "Bayi B", rate: 20 },
  { key: "Bayi C", rate: 15 },
  { key: "Kurumsal", rate: 10 },
];

export function groupRate(group: string) {
  return discountGroups.find((g) => g.key === group)?.rate ?? 0;
}

/** Rolün tekliflerde uygulayabileceği ek iskonto sınırı (%). Üzeri onaya düşer. */
export const extraDiscountLimit: Record<Role, number> = {
  admin: 15,
  sales: 5,
  design: 0,
  production: 0,
  warehouse: 0,
  finance: 0,
};

export type CustomerDetail = {
  type: string;
  taxNo: string;
  phone: string;
  email: string;
  address: string;
  paymentTerm: string;
  ytdSales: number;
  since: string;
  contacts: { name: string; title: string; phone: string; portal: boolean }[];
  notes: { by: string; when: string; text: string; kind: "call" | "visit" | "note" }[];
  specialPrices: { productId: string; price: number; by: string; when: string }[];
};

const details: Record<string, Partial<CustomerDetail>> = {
  "C-0457": {
    type: "Bayi",
    contacts: [
      { name: "Mehmet Yılmaz", title: "Firma sahibi", phone: "0532 111 22 33", portal: true },
      { name: "Serkan Demir", title: "Depo sorumlusu", phone: "0533 444 55 66", portal: true },
      { name: "Gizem Ak", title: "Muhasebe", phone: "0242 333 21 10", portal: false },
    ],
    notes: [
      { by: "Elif Kaya", when: "15 Eki 14:20", kind: "call", text: "Fuar sezonu için 3x6 gazebo talebi olabilir, teklif bekliyor. Vadesi geçen 12.400 ₺ için hafta içi ödeme sözü verdi." },
      { by: "Elif Kaya", when: "2 Eki 11:05", kind: "visit", text: "Antalya ofis ziyareti. Roll-up özel fiyatı için yönetici onayı alındı (1.250 ₺)." },
      { by: "Selin Acar", when: "28 Eyl 16:40", kind: "note", text: "Kredi limiti 120.000 → 150.000 ₺ olarak güncellendi." },
    ],
    specialPrices: [{ productId: "15888", price: 1_250, by: "Kadir Can", when: "2 Eki 2026" }],
  },
};

export function getCustomerDetail(c: AdminCustomer): CustomerDetail {
  const d = details[c.id] ?? {};
  return {
    type: c.group === "Kurumsal" ? "Kurumsal müşteri" : "Bayi",
    taxNo: "1234567890",
    phone: "0850 000 00 00",
    email: "info@" + c.name.toLocaleLowerCase("tr").split(" ")[0].replace(/[^a-z]/g, "") + ".com",
    address: `${c.city} merkez`,
    paymentTerm: "30 gün vadeli",
    ytdSales: Math.round(c.limit * 2.4),
    since: "2022",
    contacts: [{ name: "Yetkili kişi", title: "Satın alma", phone: "0532 000 00 00", portal: true }],
    notes: [{ by: c.rep, when: "10 Eki 10:00", kind: "call", text: "Rutin görüşme yapıldı." }],
    specialPrices: [],
    ...d,
  };
}
