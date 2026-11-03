import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ExampleList } from "@/components/whatsapp/example-list";
import { requireAdmin } from "@/server/auth";
import { listCards } from "@/server/whatsapp/cards";
import { waEnabled } from "@/server/whatsapp/config";
import { listExamples } from "@/server/whatsapp/learning";

export const metadata: Metadata = { title: "Öğrenilen cevaplar" };

async function Examples() {
  await connection();
  if (!waEnabled()) notFound();
  await requireAdmin();
  const [rows, cards] = await Promise.all([listExamples(), listCards()]);
  return (
    <ExampleList
      rows={rows.map((r) => ({
        id: r.o.id, sohbetId: r.o.sohbetId, urunKodu: r.o.urunKodu, musteriMesaji: r.o.musteriMesaji, dogruCevap: r.o.dogruCevap, durum: r.o.durum,
        fiyat: r.o.fiyat, aktif: r.o.aktif, tarih: r.o.tarih.toISOString(), onaylayan: r.onaylayan,
      }))}
      kartlar={cards.map((c) => ({ kod: c.kod, ad: c.ad }))}
    />
  );
}

export default function ExamplesPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1100px] animate-pulse rounded-2xl bg-muted" />}>
      <Examples />
    </Suspense>
  );
}
