import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { QuoteTable } from "@/components/terminal/quote-table";
import { requireSeller } from "@/server/auth";
import { listQuotes } from "@/server/quotes";

export const metadata: Metadata = { title: "Teklifler" };

async function Quotes({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await connection();
  const raw = (await searchParams).q;
  const q = typeof raw === "string" ? raw : "";
  const rows = await listQuotes(await requireSeller(), q);
  return <QuoteTable rows={rows.map((r) => ({ ...r, olusturma: r.olusturma.toISOString(), ilkGorulme: r.ilkGorulme?.toISOString() ?? null }))} q={q} />;
}

export default function QuotesPage({ searchParams }: PageProps<"/panel/teklifler">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1400px] animate-pulse rounded-2xl bg-muted" />}>
      <Quotes searchParams={searchParams} />
    </Suspense>
  );
}
