import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CustomerDetail } from "@/components/customers/customer-views";
import { isAdmin, requireSeller } from "@/server/auth";
import { brandsFor } from "@/server/brands";
import { getCustomer, listGroups, staffList } from "@/server/customers";

export const metadata: Metadata = { title: "Müşteri" };

// Yönetim kabuğu adres bilgisini Suspense dışında okuyor; dinamik adresli bu sayfa sunucuda beklemeli işlenir
export const instant = false;

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const me = await requireSeller();
  const admin = isAdmin(me);
  const [c, groups, staff, brands] = await Promise.all([getCustomer(me, Number((await params).id)), listGroups(), admin ? staffList() : [], brandsFor(me)]);
  if (!c) notFound();
  return (
    <CustomerDetail
      admin={admin}
      groups={groups}
      staff={staff}
      brands={brands.map((b) => ({ id: b.id, ad: b.ad }))}
      c={{
        id: c.id, firma: c.firma, yetkili: c.yetkili ?? "", telefon: c.telefon ?? "", eposta: c.eposta ?? "",
        vergiDairesi: c.vergiDairesi ?? "", vergiNo: c.vergiNo ?? "", il: c.il ?? "", adres: c.adres ?? "", notlar: c.notlar ?? "",
        iskontoGrubuId: c.iskontoGrubuId, sahipId: c.sahipId, markaId: c.markaId, marka: c.marka, markaRenk: c.markaRenk, site: c.site,
        olusturma: c.olusturma.toISOString(), temsilci: c.temsilci,
        grup: c.grup ? { id: c.grup.id, ad: c.grup.ad, fiyatListesi: c.grup.fiyatListesi, oran: c.grup.oran } : null,
        quotes: c.quotes.map((q) => ({ ...q, olusturma: q.olusturma.toISOString() })),
        orders: c.orders.map((o) => ({ ...o, olusturma: o.olusturma.toISOString() })),
      }}
    />
  );
}

export default function CustomerPage({ params }: PageProps<"/panel/musteriler/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1200px] animate-pulse rounded-2xl bg-muted" />}>
      <Detail params={params} />
    </Suspense>
  );
}
