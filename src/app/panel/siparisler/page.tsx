import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { OrderTable } from "@/components/orders/order-views";
import { requireSeller } from "@/server/auth";
import { listOrders } from "@/server/orders";

export const metadata: Metadata = { title: "Siparişler" };

async function Orders({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await connection();
  const raw = (await searchParams).q;
  const q = typeof raw === "string" ? raw : "";
  const rows = await listOrders(await requireSeller(), q);
  return <OrderTable rows={rows.map((r) => ({ ...r, olusturma: r.olusturma.toISOString() }))} q={q} />;
}

export default function OrdersPage({ searchParams }: PageProps<"/panel/siparisler">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1400px] animate-pulse rounded-2xl bg-muted" />}>
      <Orders searchParams={searchParams} />
    </Suspense>
  );
}
