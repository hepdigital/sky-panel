// Cari hesap örnek verileri. Ana sayfadaki bakiye (48.750,40 ₺) ve ön ödeme (5.000 ₺)
// ile tutarlıdır. Gerçek sistemde cari hareketler yalnızca eklenir; düzeltmeler ters kayıtla yapılır.

import { account } from "./mock";

/** Prototipteki "bugün" — vade hesapları buna göre yapılır. */
export const TODAY = "2026-10-16";

export type LedgerType = "opening" | "invoice" | "payment" | "adjustment";

export type LedgerEntry = {
  id: string;
  date: string;
  type: LedgerType;
  doc: string;
  description: string;
  debit: number; // borç (+)
  credit: number; // alacak (−)
  balance: number; // işlem sonrası bakiye
};

type RawEntry = Omit<LedgerEntry, "balance" | "id">;

const raw: RawEntry[] = [
  { date: "2026-08-12", type: "invoice", doc: "FT-2026-1088", description: "Satış faturası · SP-2026-0702", debit: 26_400, credit: 0 },
  { date: "2026-08-20", type: "payment", doc: "TH-2026-0311", description: "Havale / EFT · Ziraat Bankası", debit: 0, credit: 22_500 },
  { date: "2026-08-27", type: "payment", doc: "TH-2026-0318", description: "Ödeme linki · Mavi Kafe", debit: 0, credit: 7_500 },
  { date: "2026-09-08", type: "invoice", doc: "FT-2026-1180", description: "Satış faturası · SP-2026-0810", debit: 12_400, credit: 0 },
  { date: "2026-09-15", type: "payment", doc: "TH-2026-0352", description: "Kredi kartı · Portal", debit: 0, credit: 26_400 },
  { date: "2026-09-24", type: "invoice", doc: "FT-2026-1214", description: "Satış faturası · SP-2026-0842", debit: 18_200, credit: 0 },
  { date: "2026-09-30", type: "adjustment", doc: "DZ-2026-0042", description: "Fiyat farkı düzeltmesi · FT-2026-1088", debit: 0, credit: 450 },
  { date: "2026-10-03", type: "payment", doc: "TH-2026-0398", description: "Kredi kartı · Portal", debit: 0, credit: 26_000 },
  { date: "2026-10-08", type: "invoice", doc: "FT-2026-1263", description: "Satış faturası · SP-2026-0877", debit: 18_150.4, credit: 0 },
];

function buildLedger(): LedgerEntry[] {
  const net = raw.reduce((s, e) => s + e.debit - e.credit, 0);
  const opening = Math.round((account.balance - net) * 100) / 100;
  let balance = opening;
  const rows: LedgerEntry[] = [
    { id: "L0", date: "2026-08-01", type: "opening", doc: "—", description: "Devir bakiyesi", debit: opening, credit: 0, balance },
  ];
  raw.forEach((e, i) => {
    balance = Math.round((balance + e.debit - e.credit) * 100) / 100;
    rows.push({ ...e, id: `L${i + 1}`, balance });
  });
  return rows;
}

export const ledger = buildLedger();

export type OpenInvoice = { id: string; date: string; due: string; amount: number; order: string };

/** Açık (ödenmemiş) faturalar — toplamı güncel bakiyeye eşittir. */
export const openInvoices: OpenInvoice[] = [
  { id: "FT-2026-1180", date: "2026-09-08", due: "2026-10-08", amount: 12_400, order: "SP-2026-0810" },
  { id: "FT-2026-1214", date: "2026-09-24", due: "2026-10-24", amount: 18_200, order: "SP-2026-0842" },
  { id: "FT-2026-1263", date: "2026-10-08", due: "2026-11-07", amount: 18_150.4, order: "SP-2026-0877" },
];

export function daysUntil(iso: string) {
  return Math.round((new Date(iso).getTime() - new Date(TODAY).getTime()) / 86_400_000);
}

export type PaymentRecord = {
  id: string;
  date: string;
  kind: "debt" | "topup" | "link";
  method: string;
  amount: number;
  status: "success" | "failed";
  note?: string;
};

export const payments: PaymentRecord[] = [
  { id: "TH-2026-0398", date: "2026-10-03", kind: "debt", method: "Kredi kartı •••• 4242", amount: 26_000, status: "success" },
  { id: "—", date: "2026-10-03", kind: "debt", method: "Kredi kartı •••• 1881", amount: 26_000, status: "failed", note: "Banka reddetti · cariye işlenmedi" },
  { id: "TH-2026-0352", date: "2026-09-15", kind: "debt", method: "Kredi kartı •••• 4242", amount: 26_400, status: "success" },
  { id: "BY-2026-0021", date: "2026-09-02", kind: "topup", method: "Kredi kartı •••• 4242", amount: 10_000, status: "success" },
  { id: "TH-2026-0318", date: "2026-08-27", kind: "link", method: "Ödeme linki · Mavi Kafe", amount: 7_500, status: "success" },
  { id: "TH-2026-0311", date: "2026-08-20", kind: "debt", method: "Havale / EFT", amount: 22_500, status: "success" },
];

export type PrepaidEntry = { id: string; date: string; description: string; amount: number; balance: number };

export const prepaidLedger: PrepaidEntry[] = [
  { id: "P1", date: "2026-09-02", description: "Bakiye yükleme · BY-2026-0021", amount: 10_000, balance: 10_000 },
  { id: "P2", date: "2026-09-25", description: "Siparişte kullanıldı · SP-2026-0877", amount: -5_000, balance: 5_000 },
];

export type PaymentLink = {
  id: string;
  customer: string;
  phone: string;
  amount: number;
  description: string;
  target: "prepaid" | "debt";
  created: string;
  expires: string;
  status: "pending" | "paid" | "expired";
};

export const paymentLinks: PaymentLink[] = [
  {
    id: "PL-7Q2K9",
    customer: "Lara Otel",
    phone: "0532 210 44 18",
    amount: 14_500,
    description: "Plaj bayrakları + şezlong baskısı",
    target: "debt",
    created: "2026-10-15",
    expires: "2026-10-18",
    status: "pending",
  },
  {
    id: "PL-3M8TZ",
    customer: "Mavi Kafe",
    phone: "0535 777 88 99",
    amount: 7_500,
    description: "Gazebo çadır kaparo",
    target: "debt",
    created: "2026-08-25",
    expires: "2026-08-28",
    status: "paid",
  },
  {
    id: "PL-9X1RD",
    customer: "Kaş Organizasyon",
    phone: "0544 318 20 07",
    amount: 6_200,
    description: "Örümcek stand baskısı",
    target: "prepaid",
    created: "2026-09-10",
    expires: "2026-09-13",
    status: "expired",
  },
];
