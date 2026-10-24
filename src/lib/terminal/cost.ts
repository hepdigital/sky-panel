import { hesap, splitKey, type Catalog, type QuoteState } from "./calc";

/** Ürün kodu → birim maliyet (KDV hariç). Seçenekli eşin ("kod+s") maliyeti ürün + seçenek maliyetidir. Yalnızca yöneticiye gönderilir. */
export type Costs = Record<string, number>;

/**
 * Teklifin maliyeti ve kârı. Maliyeti girilmemiş kalemler (gazebolar, ek kalemler, maliyetsiz ürünler) hesaba katılmaz,
 * "eksik" ile işaretlenir; hiçbir kalemin maliyeti yoksa maliyet null'dır ve kontrol yapılmaz.
 * alti: genel iskonto dağıtıldıktan sonra birim fiyatı maliyetin altına düşen ürünler.
 */
export function costOf(q: QuoteState, catalog: Catalog, costs: Costs) {
  const H = hesap(q, catalog);
  // Genel iskonto satırlara oranla dağıtılır
  const f = H.araNet > 0 ? H.net / H.araNet : 1;
  let maliyet = 0;
  let bilinen = 0;
  let eksik = false;
  const alti: string[] = [];
  for (const r of H.rows) {
    const c = costs[splitKey(r.key).id];
    if (c === undefined) {
      eksik = true;
      continue;
    }
    bilinen++;
    maliyet += c * r.adet;
    if (r.net * f < c) alti.push(r.t.replace(/ × \d+$/, ""));
  }
  const m = bilinen ? Math.round(maliyet * 100) / 100 : null;
  return { maliyet: m, eksik, alti, net: H.net, kar: m === null ? null : H.net - m };
}
