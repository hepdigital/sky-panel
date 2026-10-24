import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { SiteAdmin } from "@/components/brand/site-admin";
import { requireAdmin } from "@/server/auth";
import { listBrands } from "@/server/brands";
import { listSites } from "@/server/sites";

export const metadata: Metadata = { title: "Site bağlantıları" };

async function Sites() {
  await connection();
  await requireAdmin();
  const [sites, brands] = await Promise.all([listSites(), listBrands()]);
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return (
    <SiteAdmin
      brands={brands.map((b) => ({ id: b.id, ad: b.ad }))}
      sites={sites.map((s) => ({
        id: s.id, markaId: s.markaId, marka: s.marka, markaRenk: s.markaRenk, tur: s.tur, ad: s.ad, adres: s.adres, aktif: s.aktif,
        anahtarVar: s.anahtarVar, sonDeneme: iso(s.sonDeneme), sonBasari: iso(s.sonBasari), sonHata: s.sonHata, siparis: s.siparis,
      }))}
    />
  );
}

export default function SitesPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1100px] animate-pulse rounded-2xl bg-muted" />}>
      <Sites />
    </Suspense>
  );
}
