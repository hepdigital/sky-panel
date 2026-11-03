// Pazaryeri kârlılığı: satış fiyatından pazaryerinin kestikleri (komisyon, kargo, hizmet bedeli) ve maliyet düşülür.
// Satış fiyatı ürünün KDV'siyle, kesintiler %20 KDV'yle faturalanır; kâr KDV hariç hesaplanır (KDV devlete gider, kesintilerin
// KDV'si indirilir). Ürün kartında ve sipariş detayında aynı hesap kullanılır.

const KESINTI_KDV = 0.2;

export type ProfitInput = {
  /** Satış fiyatı (KDV dahil) */
  fiyat: number;
  /** Ürünün KDV oranı (%) */
  kdv: number;
  /** Komisyon oranı (%; KDV dahil satış fiyatı üzerinden) */
  komisyonOran: number;
  /** Kargo ücreti (KDV dahil, TL) */
  kargo: number;
  /** Platform hizmet bedeli (KDV dahil, TL) */
  hizmet: number;
  /** Maliyet (KDV hariç, TL); bilinmiyorsa null */
  maliyet: number | null;
};

export type Profit = {
  komisyon: number;
  /** Pazaryerinin ödeyeceği tutar (KDV dahil): satış − komisyon − kargo − hizmet bedeli */
  hakedis: number;
  /** KDV hariç kâr; maliyet bilinmiyorsa null */
  kar: number | null;
  /** Kâr / maliyet (%) */
  marj: number | null;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

export function profitOf(p: ProfitInput): Profit {
  const komisyon = r2((p.fiyat * p.komisyonOran) / 100);
  const kesinti = komisyon + p.kargo + p.hizmet;
  const kar = p.maliyet === null ? null : r2(p.fiyat / (1 + p.kdv / 100) - kesinti / (1 + KESINTI_KDV) - p.maliyet);
  return { komisyon, hakedis: r2(p.fiyat - kesinti), kar, marj: kar !== null && p.maliyet ? Math.round((kar / p.maliyet) * 1000) / 10 : null };
}

/**
 * Maliyet üzerine hedef kâr (%) için gereken satış fiyatı (KDV dahil, tam TL, yukarı yuvarlı). Komisyon fiyatla birlikte
 * arttığı için doğrudan çözülür: F/(1+kdv) − (F·k + kargo + hizmet)/1,2 − M = M·h
 */
export function priceFor(p: Omit<ProfitInput, "fiyat" | "maliyet"> & { maliyet: number; hedef: number }) {
  const pay = 1 / (1 + p.kdv / 100) - p.komisyonOran / 100 / (1 + KESINTI_KDV);
  if (pay <= 0) return null;
  return Math.ceil((p.maliyet * (1 + p.hedef / 100) + (p.kargo + p.hizmet) / (1 + KESINTI_KDV)) / pay);
}
