import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { OrderDetail } from "@/components/orders/order-views";
import { MarketplaceProfitCard } from "@/components/orders/marketplace-profit";
import { SiteOrderDetail } from "@/components/orders/site-order";
import { isAdmin, requireSeller } from "@/server/auth";
import { orderProfit } from "@/server/marketplaces/finance";
import { getOrder, orderCargo } from "@/server/orders";
import { refreshNotes } from "@/server/sites";

export const metadata: Metadata = { title: "Sipariş" };

// Yönetim kabuğu adres bilgisini Suspense dışında okuyor; dinamik adresli bu sayfa sunucuda beklemeli işlenir
export const instant = false;

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const me = await requireSeller();
  const id = Number((await params).id);
  let o = await getOrder(me, id);
  if (!o) notFound();
  if (o.kaynak === "site") {
    // WooCommerce sipariş notları (geçmiş) sayfa açılınca siteden okunur; site yavaşsa en çok 4 sn beklenir
    const ok = await Promise.race([refreshNotes(o.id).then(() => true), new Promise<false>((r) => setTimeout(() => r(false), 4000))]).catch(() => false);
    if (ok) o = (await getOrder(me, id)) ?? o;
  }
  if (o.kaynak === "site" && o.site && o.siteVeri) {
    // Pazaryeri siparişinde komisyon, kargo ve kâr (maliyet içerdiği için yalnızca yönetici görür)
    const kar = o.site.tur === "trendyol" && isAdmin(me) ? await orderProfit(o.site.id, o.siteVeri).catch(() => null) : null;
    return (
      <SiteOrderDetail
        id={o.id} no={o.no} marka={o.marka} site={o.site} disDurum={o.disDurum} odemeYontemi={o.odemeYontemi} odemeDurumu={o.odemeDurumu}
        veri={o.veri} o={o.siteVeri} ek={kar ? <MarketplaceProfitCard p={kar} site={o.site.ad} /> : null}
      />
    );
  }
  const kargo = await orderCargo(o.id);
  return (
    <OrderDetail
      order={{
        id: o.id, no: o.no, olusturma: o.olusturma.toISOString(), durum: o.durum, notlar: o.notlar, satisci: o.satisci,
        teklifId: o.teklifId, teklifNo: o.teklifNo, musteriId: o.musteriId, veri: o.veri, marka: o.marka,
        telefon: o.musteriTelefon, kargo,
      }}
    />
  );
}

export default function OrderPage({ params }: PageProps<"/panel/siparisler/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1100px] animate-pulse rounded-2xl bg-muted" />}>
      <Detail params={params} />
    </Suspense>
  );
}
