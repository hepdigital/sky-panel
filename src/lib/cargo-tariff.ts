// Kargo ücreti: anlaşmalı tarifeden (Yurtiçi Kargo, mesafeden bağımsız). Ücret koli başınadır: koli desisi
// (en × boy × yükseklik / 3000) ile kilosunun büyüğü en yakın tam sayıya yuvarlanır, kademeden okunur; son kademeyi aşan
// her desi için ek ücret eklenir. Faturada her gönderiye sabit oranlı bir ek kalem gelir (ekYuzde). Tutarlar KDV hariç.
// Ürün kartı, teklif ürünü, modüler gazebo parçaları ve teklif özeti aynı hesabı kullanır.

export type Tariff = {
  /** Kademeler: üst desi (dahil) → ücret; artan sırada */
  kademeler: { ust: number; ucret: number }[];
  /** Son kademeyi aşan her desi için ücret */
  ustuDesi: number;
  /** Faturada her gönderiye eklenen oran (%) */
  ekYuzde: number;
  /** KDV (%) */
  kdv: number;
};

/** Yurtiçi Kargo anlaşma tablosu (BRY Group, 2026); faturalarda tablonun %2,35 fazlası kesiliyor */
export const YURTICI_DEFAULT: Tariff = {
  kademeler: [
    { ust: 0, ucret: 105.78 }, { ust: 1, ucret: 108.33 }, { ust: 2, ucret: 115.78 }, { ust: 3, ucret: 123.78 }, { ust: 4, ucret: 131.22 },
    { ust: 5, ucret: 141.94 }, { ust: 10, ucret: 163.22 }, { ust: 15, ucret: 204.12 }, { ust: 20, ucret: 272.16 }, { ust: 25, ucret: 340.2 },
    { ust: 30, ucret: 408.24 },
  ],
  ustuDesi: 13.1,
  ekYuzde: 2.35,
  kdv: 20,
};

/** Koli: ölçüler (cm), ağırlık (kg) ve aynı ölçüdeki koli sayısı; desi: ölçü yokken elle girilmiş desi */
export type Paket = { en: number | null; boy: number | null; yukseklik: number | null; kg: number | null; adet: number; desi?: number | null };

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Desi: en × boy × yükseklik / 3000 (iki ondalık) */
export const desiOf = (p: Pick<Paket, "en" | "boy" | "yukseklik" | "desi">) => (p.en && p.boy && p.yukseklik ? r2((p.en * p.boy * p.yukseklik) / 3000) : (p.desi ?? null));

/** Ücretlendirilen desi: desi ile kilonun büyüğü, en yakın tam sayıya yuvarlı; ikisi de yoksa null */
export function chargeable(p: Paket) {
  const d = desiOf(p);
  if (d === null && !p.kg) return null;
  return Math.round(Math.max(d ?? 0, p.kg ?? 0));
}

/** Tek koli (KDV hariç, ek oran dahil) */
export function parcelPrice(t: Tariff, desi: number) {
  const k = [...t.kademeler].sort((a, b) => a.ust - b.ust);
  if (!k.length) return null;
  const hit = k.find((x) => desi <= x.ust);
  const last = k[k.length - 1];
  const base = hit ? hit.ucret : last.ucret + (desi - last.ust) * t.ustuDesi;
  return r2(base * (1 + t.ekYuzde / 100));
}

export type CargoQuote = { koli: number; haric: number; dahil: number; desi: number; eksik: number };

/** Kolilerin toplamı; ölçüsü/kilosu girilmemiş koliler "eksik" sayılır, toplama girmez */
export function cargoOf(t: Tariff, paketler: (Paket | null | undefined)[], eksikSay = 0): CargoQuote {
  let koli = 0;
  let haric = 0;
  let desi = 0;
  let eksik = eksikSay;
  for (const p of paketler) {
    const d = p ? chargeable(p) : null;
    const f = d === null ? null : parcelPrice(t, d);
    if (!p || d === null || f === null) {
      eksik++;
      continue;
    }
    const n = Math.max(1, Math.round(p.adet || 1));
    koli += n;
    desi += d * n;
    haric += f * n;
  }
  return { koli, haric: r2(haric), dahil: r2(haric * (1 + t.kdv / 100)), desi, eksik };
}

/**
 * Giden gönderide kesilen ücretin tarifeye uygunluğu. Firma yalnızca toplam desiyi ve koli sayısını verir; koliler eşit desili
 * sayılır. Koliler farklı boyda olunca gerçek ücret bu tahminin biraz altında kalır (kademeler), o yüzden yalnızca fazla
 * kesilen ücret işaretlenir: tek kolide %1, çok kolide %3 üstü. fark = kesilen − tarife (KDV hariç).
 */
export function tariffCheck(t: Tariff, koli: number, desi: number, ucret: number) {
  const n = Math.max(1, koli);
  const birim = parcelPrice(t, Math.round(desi / n));
  if (birim === null) return null;
  const beklenen = r2(birim * n);
  const fark = r2(ucret - beklenen);
  return { beklenen, fark, uygun: fark <= Math.max(1, beklenen * (n > 1 ? 0.03 : 0.01)) };
}

/* ───────────── modüler gazebo parçalarının paket anahtarları ───────────── */

/** Paket anahtarları: "f|SQ3|3x3" iskelet, "r|3x3" tavan, "w|200x300" duvar (ölçü grubu), "z|3x3" pilsa zemin, "u|<id>" teklif ürünü */
export const packageKeyValid = (k: string) => /^(f\|[A-Z0-9]+\|[\d.x]+|r\|[\d.x]+|w\|\d+x\d+|z\|[\d.x]+|u\|\d+)$/.test(k);
