import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { QuoteDetail } from "@/components/terminal/quote-detail";
import { requireMe } from "@/server/auth";
import { db, schema } from "@/server/db";
import { mailReady } from "@/server/mail";
import { quoteLink } from "@/server/quote-flow";
import { getQuote } from "@/server/quotes";

export const metadata: Metadata = { title: "Teklif" };

// Yönetim kabuğu (admin-shell) adres bilgisini Suspense dışında okuyor; dinamik adresli bu sayfa sunucuda beklemeli işlenir
export const instant = false;

const iso = (d: Date | null) => d?.toISOString() ?? null;

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const t = await getQuote(await requireMe(), Number((await params).id));
  if (!t) notFound();
  const [o] = await db().select({ id: schema.siparisler.id }).from(schema.siparisler).where(eq(schema.siparisler.teklifId, t.id));
  const [m] = t.musteriId
    ? await db().select({ telefon: schema.musteriler.telefon, eposta: schema.musteriler.eposta }).from(schema.musteriler).where(eq(schema.musteriler.id, t.musteriId))
    : [];
  return (
    <QuoteDetail
      quote={{ id: t.id, no: t.no, olusturma: t.olusturma.toISOString(), kullanici: t.kullanici, fiyatTipi: t.fiyatTipi, musteriId: t.musteriId, veri: t.veri, durum: t.durum }}
      flow={{
        asama: t.asama,
        link: t.token ? quoteLink(t.token) : null,
        gonderim: iso(t.gonderim),
        ilkGorulme: iso(t.ilkGorulme),
        sonGorulme: iso(t.sonGorulme),
        gorulmeSayisi: t.gorulmeSayisi,
        gecerlilik: iso(t.gecerlilik),
        yanitTarihi: iso(t.yanitTarihi),
        yanitAd: t.yanitAd,
        yanitNot: t.yanitNot,
        telefon: m?.telefon ?? null,
        eposta: m?.eposta ?? null,
        mailReady: mailReady(),
        siparisId: o?.id ?? null,
      }}
    />
  );
}

export default function QuotePage({ params }: PageProps<"/panel/teklifler/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1100px] animate-pulse rounded-2xl bg-muted" />}>
      <Detail params={params} />
    </Suspense>
  );
}
