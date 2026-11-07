import { areaOf, floorPriceOf, framePrice, gzTotal, hesap, roofPrice, splitKey, unpricedWalls, type Catalog, type Gazebo, type QuoteState } from "./calc";
import { withPriceTable, type PriceTable } from "./price-table";

/** Ürün kodu → birim maliyet (KDV hariç). Seçenekli eşin ("kod+s") maliyeti ürün + seçenek maliyetidir. Yalnızca yöneticiye gönderilir. */
export type Costs = Record<string, number>;

/** Gazebonun birim maliyeti: iskelet, tavan, duvarlar ve (varsa) zeminin hepsinin maliyeti girilmişse toplamı, yoksa undefined */
function gazeboCost(g: Gazebo, table: PriceTable) {
  return withPriceTable(table, () => {
    if (g.frame && framePrice(g, 0) === null) return undefined;
    if (g.roofFab !== null && roofPrice(g, 0) === null) return undefined;
    if (unpricedWalls(g, 0) > 0) return undefined;
    if (g.zemin && floorPriceOf(g.size, 0) === null) return undefined;
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
    const k = splitKey(r.key);
    // m² ürününün maliyeti m² başınadır: parça maliyeti alan × m² maliyeti
    // Satış kartından gelen ek kalemin maliyeti kartınkidir ("kart:<stok kodu>")
    const kart = gz ? undefined : q.extra?.find((x) => x.id === r.key)?.kod;
    const c = gz
      ? gazebo ? gazeboCost(gz, gazebo) : undefined
      : kart ? costs[`kart:${kart}`]
      : costs[k.id] === undefined ? undefined : costs[k.id] * (k.olcu ? areaOf(k.olcu) : 1);
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
