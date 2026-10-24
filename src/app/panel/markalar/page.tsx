import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { BrandList } from "@/components/brand/brand-admin";
import { requireAdmin } from "@/server/auth";
import { brandQuoteCounts, listBrands, missingInfo } from "@/server/brands";

export const metadata: Metadata = { title: "Marka Yönetimi" };

async function Brands() {
  await connection();
  await requireAdmin();
  const [brands, counts] = await Promise.all([listBrands(), brandQuoteCounts()]);
  return <BrandList brands={brands.map((b) => ({ ...b, eksik: missingInfo(b), teklif: counts.get(b.id) ?? 0 }))} />;
}

export default function BrandsPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1100px] animate-pulse rounded-2xl bg-muted" />}>
      <Brands />
    </Suspense>
  );
}
