import { cargoOf, type Paket, type Tariff } from "@/lib/cargo-tariff";
import { OPT_SUFFIX, slots, splitKey, type QuoteState } from "./calc";

/** Teklif ekranının kargo verisi: tarife, modüler gazebo parçalarının ve teklif ürünlerinin (ürün koduna göre) kolileri */
export type QuoteCargoData = { tarife: Tariff; gazebo: Record<string, Paket>; urun: Record<string, Paket> };

/**
 * Teklifin tahmini kargosu: her gazebo parçası (iskelet, tavan, kullanılan duvarlar, zemin) ve her ürün ayrı koli.
 * Ölçüsü girilmemiş parça ve ürünler "eksik" sayılır, toplama girmez. Ek kalemlerin kargosu yoktur.
 */
export function quoteCargo(q: QuoteState, d: QuoteCargoData) {
  const list: (Paket | null)[] = [];
  for (const g of q.cart) {
    const parts: (Paket | null)[] = [];
    if (g.frame) parts.push(d.gazebo[`f|${g.frame}|${g.size}`] ?? null);
    if (g.roofFab !== null) parts.push(d.gazebo[`r|${g.size}`] ?? null);
    for (const s of slots(g)) if (s.wall.kind !== "yok") parts.push(d.gazebo[`w|${s.grup}`] ?? null);
    if (g.zemin) parts.push(d.gazebo[`z|${g.size}`] ?? null);
    for (let i = 0; i < g.qty; i++) list.push(...parts);
  }
  for (const [key, adet] of Object.entries(q.prod)) {
    const p = d.urun[splitKey(key).id.replace(OPT_SUFFIX, "")] ?? null;
    for (let i = 0; i < (adet || 0); i++) list.push(p);
  }
  return { ...cargoOf(d.tarife, list), parca: list.length };
}
