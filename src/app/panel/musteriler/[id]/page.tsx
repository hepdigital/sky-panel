import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerDetail } from "@/components/admin/customer-detail";
import { adminCustomers } from "@/lib/admin-mock";

export function generateStaticParams() {
  return adminCustomers.map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: PageProps<"/panel/musteriler/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: adminCustomers.find((c) => c.id === id)?.name ?? "Müşteri" };
}

export default async function CustomerPage({ params }: PageProps<"/panel/musteriler/[id]">) {
  const { id } = await params;
  const customer = adminCustomers.find((c) => c.id === id);
  if (!customer) notFound();
  return <CustomerDetail customer={customer} />;
}
