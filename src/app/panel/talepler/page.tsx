import { Suspense } from "react";
import type { Metadata } from "next";
import { after, connection } from "next/server";
import { RequestBoard } from "@/components/requests/request-board";
import { requireSeller } from "@/server/auth";
import { listRequests } from "@/server/site-requests";
import { syncStale } from "@/server/sites";
import { listWaRequests, requestText } from "@/server/whatsapp/requests";

export const metadata: Metadata = { title: "Talepler" };

async function Requests({ searchParams }: { searchParams: Promise<{ tumu?: string | string[] }> }) {
  await connection();
  const me = await requireSeller();
  const tumu = (await searchParams).tumu === "1";
  // Siteler arka planda yoklanır (siparişlerle aynı); yeni talepler bir sonraki açılışta görünür
  after(() => syncStale(90).catch((e) => console.error("syncStale", e)));
  const [rows, wa] = await Promise.all([listRequests(me, !tumu), listWaRequests(!tumu)]);
  return (
    <RequestBoard
      tumu={tumu}
      rows={[
        ...rows.map((r) => ({
          kaynak: "site" as const,
          sohbetId: null,
          id: r.t.id,
          tur: r.t.tur,
          turAd: r.t.turAd,
          ad: r.t.ad,
          firma: r.t.firma,
          eposta: r.t.eposta,
          telefon: r.t.telefon,
          il: r.t.il,
          mesaj: r.t.mesaj,
          tarih: r.t.disTarih.toISOString(),
          durum: r.t.durum,
          not: r.t.not,
          site: r.site,
          marka: r.marka,
          markaRenk: r.markaRenk,
          ilgilenen: r.ilgilenen,
        })),
        // WhatsApp asistanının topladığı talepler
        ...wa.map((r) => ({
          kaynak: "whatsapp" as const,
          sohbetId: r.t.sohbetId,
          id: r.t.id,
          tur: "whatsapp",
          turAd: "WhatsApp",
          ad: r.t.ad || r.sohbetAd || "WhatsApp müşterisi",
          firma: null,
          eposta: "",
          telefon: r.t.telefon,
          il: r.t.il,
          mesaj: requestText(r.t),
          tarih: r.t.tarih.toISOString(),
          durum: r.t.durum,
          not: r.t.panelNot,
          site: "WhatsApp",
          marka: null,
          markaRenk: null,
          ilgilenen: r.ilgilenen,
        })),
      ].sort((a, b) => b.tarih.localeCompare(a.tarih))}
    />
  );
}

export default function RequestsPage({ searchParams }: PageProps<"/panel/talepler">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1100px] animate-pulse rounded-2xl bg-muted" />}>
      <Requests searchParams={searchParams} />
    </Suspense>
  );
}
