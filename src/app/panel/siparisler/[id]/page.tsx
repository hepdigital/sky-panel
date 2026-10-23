import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { OrderDetail } from "@/components/orders/order-views";
import { requireSeller } from "@/server/auth";
import { getOrder } from "@/server/orders";

export const metadata: Metadata = { title: "Sipariş" };

// Yönetim kabuğu adres bilgisini Suspense dışında okuyor; dinamik adresli bu sayfa sunucuda beklemeli işlenir
export const instant = false;

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const o = await getOrder(await requireSeller(), Number((await params).id));
  if (!o) notFound();
  return (
    <OrderDetail
      order={{
        id: o.id, no: o.no, olusturma: o.olusturma.toISOString(), durum: o.durum, notlar: o.notlar, satisci: o.satisci,
        teklifId: o.teklifId, teklifNo: o.teklifNo, musteriId: o.musteriId, veri: o.veri,
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
