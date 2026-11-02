import { Suspense } from "react";
import type { Metadata } from "next";
import { after, connection } from "next/server";
import { PaymentLinks } from "@/components/payment-links/payment-links";
import { requireSeller } from "@/server/auth";
import { KOMISYON_ORANI, listPaymentLinks, paymentSites } from "@/server/payment-links";
import { syncStale } from "@/server/sites";

export const metadata: Metadata = { title: "Ödeme linkleri" };

async function Links({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const me = await requireSeller();
  // Ödeme durumu site siparişlerinin eşitlemesinden gelir; siteler arka planda yoklanır
  after(() => syncStale(90).catch((e) => console.error("syncStale", e)));
  const [sites, rows, sp] = await Promise.all([paymentSites(me), listPaymentLinks(me), searchParams]);
  // Müşteri kartından gelince form müşterinin bilgileriyle dolu açılır
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 200) : "");
  return (
    <PaymentLinks
      sites={sites.map((s) => ({ id: s.id, ad: s.ad, marka: s.marka }))}
      rows={rows}
      komisyonOrani={KOMISYON_ORANI}
      initial={{ musteri: one(sp.musteri), telefon: one(sp.telefon), eposta: one(sp.eposta), adres: one(sp.adres), il: one(sp.il) }}
    />
  );
}

export default function PaymentLinksPage({ searchParams }: PageProps<"/panel/odeme-linkleri">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1100px] animate-pulse rounded-2xl bg-muted" />}>
      <Links searchParams={searchParams} />
    </Suspense>
  );
}
