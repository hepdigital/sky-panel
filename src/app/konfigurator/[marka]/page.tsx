import { Suspense } from "react";
import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { GazeboKonfigurator } from "@/components/konfigurator/gazebo-konfigurator";
import { listColors } from "@/server/colors";
import { db, schema } from "@/server/db";
import { gazeboTables } from "@/server/gazebo-prices";

// Sitelere gömülen gazebo konfigüratörü (ilk site: skygorselmarket.com → SKY markası). Giriş gerekmez; fiyatlar markanın
// modüler gazebo tablosundan, renkler paneldeki kumaş renklerinden (stokta olmayan renk gösterilmez) gelir.
// Arama motorlarına kapalı: sayfa sitenin ürün sayfasında gösterilir.
export const metadata: Metadata = { title: "Gazebo tasarla", robots: { index: false, follow: false } };

const poppins = Poppins({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"], variable: "--font-poppins" });

async function Konfigurator({ params, searchParams }: { params: Promise<{ marka: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const { marka } = await params;
  const gomulu = (await searchParams).gomulu === "1";
  const [brand] = await db().select({ id: schema.markalar.id }).from(schema.markalar).where(eq(schema.markalar.kod, marka));
  if (!brand) notFound();
  const [tables, colors] = await Promise.all([gazeboTables([brand.id]), listColors()]);
  return <GazeboKonfigurator marka={marka} gomulu={gomulu} table={tables[brand.id]} colors={colors.filter((c) => c.aktif).map((c) => ({ hex: c.hex, ad: c.ad }))} />;
}

export default function KonfiguratorPage({
  params,
  searchParams,
}: {
  params: Promise<{ marka: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className={poppins.variable}>
      <Suspense fallback={<div className="min-h-dvh bg-[#f5f6f8]" />}>
        <Konfigurator params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
