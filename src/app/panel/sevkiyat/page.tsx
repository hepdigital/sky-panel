import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { ShippingAdmin } from "@/components/shipping/shipping-admin";
import { requireAdmin } from "@/server/auth";
import { getTariff } from "@/server/shipping";

export const metadata: Metadata = { title: "Sevkiyat" };

async function Shipping() {
  await connection();
  await requireAdmin();
  return <ShippingAdmin tarife={await getTariff()} />;
}

export default function ShippingPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1000px] animate-pulse rounded-2xl bg-muted" />}>
      <Shipping />
    </Suspense>
  );
}
