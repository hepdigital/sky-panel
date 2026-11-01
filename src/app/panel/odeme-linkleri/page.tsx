import { Suspense } from "react";
import type { Metadata } from "next";
import { after, connection } from "next/server";
import { PaymentLinks } from "@/components/payment-links/payment-links";
import { requireSeller } from "@/server/auth";
import { KOMISYON_ORANI, listPaymentLinks, paymentSites } from "@/server/payment-links";
import { syncStale } from "@/server/sites";

export const metadata: Metadata = { title: "Ödeme linkleri" };

async function Links() {
  await connection();
  const me = await requireSeller();
  // Ödeme durumu site siparişlerinin eşitlemesinden gelir; siteler arka planda yoklanır
  after(() => syncStale(90).catch((e) => console.error("syncStale", e)));
  const [sites, rows] = await Promise.all([paymentSites(me), listPaymentLinks(me)]);
  return <PaymentLinks sites={sites.map((s) => ({ id: s.id, ad: s.ad, marka: s.marka }))} rows={rows} komisyonOrani={KOMISYON_ORANI} />;
}

export default function PaymentLinksPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1100px] animate-pulse rounded-2xl bg-muted" />}>
      <Links />
    </Suspense>
  );
}
