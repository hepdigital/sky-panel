import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { GazeboPriceAdmin } from "@/components/products/gazebo-prices";
import { requireAdmin } from "@/server/auth";
import { brandsFor } from "@/server/brands";
import { gazeboEdits } from "@/server/gazebo-prices";

export const metadata: Metadata = { title: "Modüler gazebo fiyatları" };

async function Prices() {
  await connection();
  const me = await requireAdmin();
  const [e, brands] = await Promise.all([gazeboEdits(), brandsFor(me)]);
  return <GazeboPriceAdmin brands={brands.map((b) => ({ id: b.id, ad: b.ad, renk: b.renk }))} ortak={e.ortak} markalar={e.markalar} maliyet={e.maliyet} />;
}

export default function GazeboPricesPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1000px] animate-pulse rounded-2xl bg-muted" />}>
      <Prices />
    </Suspense>
  );
}
