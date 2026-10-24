import { Suspense } from "react";
import type { Metadata } from "next";
import { after, connection } from "next/server";
import { OrderTable } from "@/components/orders/order-views";
import { isAdmin, requireSeller } from "@/server/auth";
import { listSites, syncStale, type Vocabulary } from "@/server/sites";
import { brandFilter } from "@/server/brands";
import { listOrders } from "@/server/orders";

export const metadata: Metadata = { title: "Siparişler" };

async function Orders({ searchParams }: { searchParams: Promise<{ q?: string | string[]; marka?: string | string[]; kaynak?: string | string[] }> }) {
  await connection();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const kaynak = sp.kaynak === "site" || sp.kaynak === "teklif" ? sp.kaynak : null;
  const me = await requireSeller();
  // Siteler arka planda yoklanır (son deneme 90 sn'den eskiyse); sayfa beklemez, yeni siparişler bir sonraki açılışta görünür
  after(() => syncStale(90).catch((e) => console.error("syncStale", e)));
  const brands = await brandFilter(me, sp.marka);
  const [rows, sites] = await Promise.all([listOrders(me, q, brands.active?.id ?? null, kaynak), listSites()]);
  const myBrands = new Set(brands.options.map((b) => b.kod));
  const visibleSites = sites.filter((s) => s.aktif && (isAdmin(me) || brands.options.some((b) => b.ad === s.marka)));
  const vocab = new Map(sites.map((s) => [s.id, s.sozluk ? (JSON.parse(s.sozluk) as Vocabulary) : null]));
  return (
    <OrderTable
      rows={rows.map((r) => ({
        ...r,
        olusturma: (r.disTarih ?? r.olusturma).toISOString(),
        disDurumAd: r.siteId && r.disDurum ? (vocab.get(r.siteId)?.durumlar.find((d) => d.key === r.disDurum)?.label ?? r.disDurum) : null,
      }))}
      q={q}
      brands={brands.options}
      activeBrand={brands.active?.kod ?? null}
      kaynak={kaynak}
      sites={visibleSites.map((s) => ({ id: s.id, ad: s.ad, sonBasari: s.sonBasari?.toISOString() ?? null, sonHata: s.sonHata }))}
      showSiteFilter={myBrands.size > 0 && visibleSites.length > 0}
    />
  );
}

export default function OrdersPage({ searchParams }: PageProps<"/panel/siparisler">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1400px] animate-pulse rounded-2xl bg-muted" />}>
      <Orders searchParams={searchParams} />
    </Suspense>
  );
}
