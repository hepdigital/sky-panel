import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Terminal } from "@/components/terminal/terminal";
import { requireSeller } from "@/server/auth";
import { getCatalog } from "@/server/catalog";
import { brandCard, brandsFor } from "@/server/brands";
import { activeChannels } from "@/server/channels";
import { customerForQuote } from "@/server/customers";

export const metadata: Metadata = { title: "Yeni teklif" };

async function Loaded({ searchParams }: { searchParams: Promise<{ musteri?: string | string[] }> }) {
  await connection();
  const me = await requireSeller();
  const raw = (await searchParams).musteri;
  const id = Number(typeof raw === "string" ? raw : "");
  const [catalog, customer, channels, brands] = await Promise.all([getCatalog(), id > 0 ? customerForQuote(me, id) : null, activeChannels(), brandsFor(me)]);
  if (!brands.length) return <p className="mx-auto mt-10 max-w-md text-center text-sm text-muted-foreground">Size tanımlı aktif marka yok. Yöneticinizden marka atamasını isteyin.</p>;
  return <Terminal catalog={catalog} initialCustomer={customer} channels={channels} brands={brands.map(brandCard)} />;
}

export default function NewQuotePage({ searchParams }: PageProps<"/panel/teklifler/yeni">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-[600px] max-w-[1400px] animate-pulse rounded-2xl bg-muted" />}>
      <Loaded searchParams={searchParams} />
    </Suspense>
  );
}
