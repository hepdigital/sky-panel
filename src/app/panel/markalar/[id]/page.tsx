import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { asc, eq } from "drizzle-orm";
import { BrandEditor } from "@/components/brand/brand-admin";
import { requireAdmin } from "@/server/auth";
import { brandQuoteCounts, getBrand, missingInfo, userBrandMap } from "@/server/brands";
import { db, schema } from "@/server/db";

export const metadata: Metadata = { title: "Marka" };

// Yönetim kabuğu adres bilgisini Suspense dışında okuyor; dinamik adresli bu sayfa sunucuda beklemeli işlenir
export const instant = false;

async function Editor({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  await requireAdmin();
  const raw = (await params).id;
  if (raw === "yeni") return <BrandEditor brand={null} sellers={[]} />;
  const b = await getBrand(Number(raw));
  if (!b) notFound();
  const k = schema.kullanicilar;
  const [counts, map, users] = await Promise.all([
    brandQuoteCounts(),
    userBrandMap(),
    db().select({ id: k.id, adSoyad: k.adSoyad, aktif: k.aktif }).from(k).where(eq(k.rol, "satis")).orderBy(asc(k.adSoyad)),
  ]);
  // Ataması olmayan satışçı tüm markalarla çalışır
  const sellers = users.map((u) => ({ ...u, secili: !map.get(u.id)?.length || map.get(u.id)!.includes(b.id) }));
  return <BrandEditor brand={{ ...b, eksik: missingInfo(b), teklif: counts.get(b.id) ?? 0 }} sellers={sellers} />;
}

export default function BrandPage({ params }: PageProps<"/panel/markalar/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[900px] animate-pulse rounded-2xl bg-muted" />}>
      <Editor params={params} />
    </Suspense>
  );
}
