import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { QuoteTable } from "@/components/terminal/quote-table";
import { isAdmin, requireSeller } from "@/server/auth";
import { brandFilter } from "@/server/brands";
import { listChannels } from "@/server/channels";
import { listQuotes } from "@/server/quotes";

export const metadata: Metadata = { title: "Teklifler" };

async function Quotes({ searchParams }: { searchParams: Promise<{ q?: string | string[]; marka?: string | string[] }> }) {
  await connection();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const me = await requireSeller();
  const brands = await brandFilter(me, sp.marka);
  const [rows, channels] = await Promise.all([listQuotes(me, q, brands.active?.id ?? null), isAdmin(me) ? listChannels() : null]);
  return (
    <QuoteTable
      rows={rows.map((r) => ({ ...r, olusturma: r.olusturma.toISOString(), ilkGorulme: r.ilkGorulme?.toISOString() ?? null }))}
      q={q}
      channels={channels}
      brands={brands.options}
      activeBrand={brands.active?.kod ?? null}
    />
  );
}

export default function QuotesPage({ searchParams }: PageProps<"/panel/teklifler">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1400px] animate-pulse rounded-2xl bg-muted" />}>
      <Quotes searchParams={searchParams} />
    </Suspense>
  );
}
