import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { PriceCoverage } from "@/components/marketplace/price-coverage";
import { requireAdmin } from "@/server/auth";
import { salesChannels } from "@/server/marketplaces/listing";
import { priceCoverage } from "@/server/marketplaces/panel-prices";

export const metadata: Metadata = { title: "Fiyat kapsamı" };

async function Report() {
  await connection();
  await requireAdmin();
  const sites = (await salesChannels()).filter((c) => c.tur === "woocommerce" && c.aktif);
  const raporlar = await Promise.all(
    sites.map(async (s) => ({
      id: s.id,
      ad: s.ad,
      satirlar: await priceCoverage(s.id).catch((e) => {
        console.error("fiyat kapsamı", e);
        return null;
      }),
    })),
  );
  return <PriceCoverage raporlar={raporlar} />;
}

export default function PriceCoveragePage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1100px] animate-pulse rounded-2xl bg-muted" />}>
      <Report />
    </Suspense>
  );
}
