import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { CustomerList } from "@/components/customers/customer-views";
import { isAdmin, requireSeller } from "@/server/auth";
import { listCustomers, listGroups, staffList } from "@/server/customers";

export const metadata: Metadata = { title: "Müşteriler" };

async function Customers({ searchParams }: { searchParams: Promise<{ q?: string | string[]; yeni?: string | string[] }> }) {
  await connection();
  const me = await requireSeller();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const admin = isAdmin(me);
  const [rows, groups, staff] = await Promise.all([listCustomers(me, q), listGroups(), admin ? staffList() : []]);
  return <CustomerList rows={rows} q={q} admin={admin} groups={groups} staff={staff} openNew={sp.yeni === "1"} />;
}

export default function CustomersPage({ searchParams }: PageProps<"/panel/musteriler">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1400px] animate-pulse rounded-2xl bg-muted" />}>
      <Customers searchParams={searchParams} />
    </Suspense>
  );
}
