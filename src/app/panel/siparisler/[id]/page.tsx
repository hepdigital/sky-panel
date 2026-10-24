import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { OrderDetail } from "@/components/orders/order-views";
import { SiteOrderDetail } from "@/components/orders/site-order";
import { requireSeller } from "@/server/auth";
import { getOrder } from "@/server/orders";
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
  if (o.kaynak === "site" && o.site && o.siteVeri)
    return (
      <SiteOrderDetail
        id={o.id} no={o.no} marka={o.marka} site={o.site} disDurum={o.disDurum} odemeYontemi={o.odemeYontemi} odemeDurumu={o.odemeDurumu}
        veri={o.veri} o={o.siteVeri}
      />
    );
  return (
    <OrderDetail
      order={{
        id: o.id, no: o.no, olusturma: o.olusturma.toISOString(), durum: o.durum, notlar: o.notlar, satisci: o.satisci,
        teklifId: o.teklifId, teklifNo: o.teklifNo, musteriId: o.musteriId, veri: o.veri, marka: o.marka,
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
