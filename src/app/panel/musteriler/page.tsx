import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { CustomerList } from "@/components/customers/customer-views";
import { isAdmin, requireSeller } from "@/server/auth";
import { brandsFor } from "@/server/brands";
import { listCustomers, listGroups, staffList } from "@/server/customers";

export const metadata: Metadata = { title: "Müşteriler" };

async function Customers({ searchParams }: { searchParams: Promise<{ q?: string | string[]; yeni?: string | string[]; kaynak?: string | string[] }> }) {
  await connection();
  const me = await requireSeller();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const kaynak = sp.kaynak === "site" || sp.kaynak === "panel" ? sp.kaynak : null;
  const admin = isAdmin(me);
  const [rows, groups, staff, brands] = await Promise.all([listCustomers(me, q, kaynak), listGroups(), admin ? staffList() : [], brandsFor(me)]);
  return <CustomerList rows={rows} q={q} kaynak={kaynak} admin={admin} groups={groups} staff={staff} brands={brands.map((b) => ({ id: b.id, ad: b.ad }))} openNew={sp.yeni === "1"} />;
}

export default function CustomersPage({ searchParams }: PageProps<"/panel/musteriler">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1400px] animate-pulse rounded-2xl bg-muted" />}>
      <Customers searchParams={searchParams} />
    </Suspense>
  );
}
