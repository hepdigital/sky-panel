import { framePrice, gzTotal, hesap, roofPrice, splitKey, unpricedWalls, type Catalog, type Gazebo, type QuoteState } from "./calc";
import { withPriceTable, type PriceTable } from "./price-table";

/** Ürün kodu → birim maliyet (KDV hariç). Seçenekli eşin ("kod+s") maliyeti ürün + seçenek maliyetidir. Yalnızca yöneticiye gönderilir. */
export type Costs = Record<string, number>;

/** Gazebonun birim maliyeti: iskelet, tavan ve duvarların hepsinin maliyeti girilmişse toplamı, yoksa undefined */
function gazeboCost(g: Gazebo, table: PriceTable) {
  return withPriceTable(table, () => {
    if (g.frame && framePrice(g, 0) === null) return undefined;
    if (g.roofFab !== null && roofPrice(g, 0) === null) return undefined;
    if (unpricedWalls(g, 0) > 0) return undefined;
    return gzTotal(g, 0);
  });
}

/**
 * Teklifin maliyeti ve kârı (fiyatlar etkin fiyat tablosundan). Maliyeti girilmemiş kalemler (eksik parçalı gazebolar,
 * ek kalemler, maliyetsiz ürünler) hesaba katılmaz, "eksik" ile işaretlenir; hiçbir kalemin maliyeti yoksa maliyet null'dır.
 * alti: genel iskonto dağıtıldıktan sonra birim fiyatı maliyetin altına düşen kalemler.
 */
export function costOf(q: QuoteState, catalog: Catalog, costs: Costs, gazebo: PriceTable | null = null) {
  const H = hesap(q, catalog);
  // Genel iskonto satırlara oranla dağıtılır
  const f = H.araNet > 0 ? H.net / H.araNet : 1;
  let maliyet = 0;
  let bilinen = 0;
  let eksik = false;
  const alti: string[] = [];
  for (const r of H.rows) {
    const gz = q.cart.find((c) => c.id === r.key);
    const c = gz ? (gazebo ? gazeboCost(gz, gazebo) : undefined) : costs[splitKey(r.key).id];
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
