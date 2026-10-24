import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { OrderTable } from "@/components/orders/order-views";
import { requireSeller } from "@/server/auth";
import { brandFilter } from "@/server/brands";
import { listOrders } from "@/server/orders";

export const metadata: Metadata = { title: "Siparişler" };

async function Orders({ searchParams }: { searchParams: Promise<{ q?: string | string[]; marka?: string | string[] }> }) {
  await connection();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const me = await requireSeller();
  const brands = await brandFilter(me, sp.marka);
  const rows = await listOrders(me, q, brands.active?.id ?? null);
  return <OrderTable rows={rows.map((r) => ({ ...r, olusturma: r.olusturma.toISOString() }))} q={q} brands={brands.options} activeBrand={brands.active?.kod ?? null} />;
}

export default function OrdersPage({ searchParams }: PageProps<"/panel/siparisler">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1400px] animate-pulse rounded-2xl bg-muted" />}>
      <Orders searchParams={searchParams} />
    </Suspense>
  );
}
