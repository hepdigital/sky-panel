import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { MarketplaceAdmin } from "@/components/marketplace/marketplace-admin";
import { requireAdmin } from "@/server/auth";
import { listProducts } from "@/server/catalog";
import { categoryCount, channelPrice, listItems, marketplaceChannels, recentLogs } from "@/server/marketplaces/listing";

export const metadata: Metadata = { title: "Pazaryeri ürünleri" };

/** Terminal görsel anahtarı ("p:rollup") → adres */
const imageOf = (g: string | null) => (!g ? null : g.startsWith("p:") ? `/terminal/img/p-${g.slice(2)}.webp` : g);

async function Marketplace() {
  await connection();
  await requireAdmin();
  const [channels, items, { urunler }, logs] = await Promise.all([marketplaceChannels(), listItems(), listProducts(), recentLogs()]);
  const counts = Object.fromEntries(await Promise.all([...new Set(channels.map((c) => c.tur))].map(async (t) => [t, await categoryCount(t)] as const)));
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return (
    <MarketplaceAdmin
      channels={channels.map((c) => ({ ...c, kategoriSayisi: counts[c.tur] ?? 0 }))}
      catalog={urunler.filter((u) => u.aktif).map((u) => ({ id: u.id, kod: u.kod, ad: u.ad, aciklama: u.aciklama, perakende: u.perakende, gorsel: imageOf(u.gorsel) }))}
      items={items.map((i) => ({
        id: i.id, stokKodu: i.stokKodu, barkod: i.barkod, ad: i.ad, aciklama: i.aciklama ?? "", grupKodu: i.grupKodu, markaAdi: i.markaAdi ?? "", urunId: i.urunId,
        renk: i.renk ?? "", olcu: i.olcu ?? "", gorseller: i.gorseller, desi: i.desi, kdv: i.kdv, fiyat: i.fiyat, stok: i.stok, hazirlikGun: i.hazirlikGun, aktif: i.aktif,
        katalogAd: i.katalogAd, katalogFiyat: i.katalogFiyat,
        listelemeler: i.listelemeler.map((l) => {
          const ch = channels.find((c) => c.id === l.siteId);
          return {
            siteId: l.siteId, aktif: l.aktif, kategoriId: l.kategoriId, kategoriYol: l.kategoriYol, markaId: l.markaId, markaAd: l.markaAd, ozellikler: l.ozellikler, fiyat: l.fiyat,
            durum: l.durum, olustu: l.olustu, hata: l.hata, sonGonderim: iso(l.sonGonderim),
            satisFiyati: ch ? channelPrice(i, i.katalogFiyat, l, ch.ayarlar) : null,
          };
        }),
      }))}
      logs={logs.map((r) => ({ id: r.l.id, site: r.site, tur: r.l.tur, durum: r.l.durum, ozet: r.l.ozet, kullanici: r.l.kullanici, tarih: r.l.olusturma.toISOString() }))}
    />
  );
}

export default function MarketplacePage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1200px] animate-pulse rounded-2xl bg-muted" />}>
      <Marketplace />
    </Suspense>
  );
}
