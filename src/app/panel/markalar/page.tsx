import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { BrandAdmin } from "@/components/brand/brand-admin";
import { requireAdmin } from "@/server/auth";
import { listBrands, missingInfo } from "@/server/brands";

export const metadata: Metadata = { title: "Markalar" };

async function Brands() {
  await connection();
  await requireAdmin();
  const brands = await listBrands();
  return <BrandAdmin brands={brands.map((b) => ({ ...b, olusturma: b.olusturma.toISOString(), eksik: missingInfo(b) }))} />;
}

export default function BrandsPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1100px] animate-pulse rounded-2xl bg-muted" />}>
      <Brands />
    </Suspense>
  );
}
