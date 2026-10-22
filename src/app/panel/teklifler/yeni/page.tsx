import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Terminal } from "@/components/terminal/terminal";
import { requireMe } from "@/server/auth";
import { getCatalog } from "@/server/catalog";
import { customerForQuote } from "@/server/customers";

export const metadata: Metadata = { title: "Yeni teklif" };

async function Loaded({ searchParams }: { searchParams: Promise<{ musteri?: string | string[] }> }) {
  await connection();
  const me = await requireMe();
  const raw = (await searchParams).musteri;
  const id = Number(typeof raw === "string" ? raw : "");
  const [catalog, customer] = await Promise.all([getCatalog(), id > 0 ? customerForQuote(me, id) : null]);
  return <Terminal catalog={catalog} initialCustomer={customer} />;
}

export default function NewQuotePage({ searchParams }: PageProps<"/panel/teklifler/yeni">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-[600px] max-w-[1400px] animate-pulse rounded-2xl bg-muted" />}>
      <Loaded searchParams={searchParams} />
    </Suspense>
  );
}
