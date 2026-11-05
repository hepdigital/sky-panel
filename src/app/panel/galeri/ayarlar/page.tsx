import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { GallerySettingsForm } from "@/components/gallery/gallery-settings";
import { requireAdmin } from "@/server/auth";
import { db, schema } from "@/server/db";
import { getSettings, imageUrl } from "@/server/gallery";

export const metadata: Metadata = { title: "Galeri ayarları" };

async function Settings() {
  await connection();
  await requireAdmin();
  const s = await getSettings();
  // Önizleme için galerideki son fotoğraflardan biri
  const [g] = await db().select({ dosya: schema.galeriGorselleri.dosya }).from(schema.galeriGorselleri).orderBy(schema.galeriGorselleri.id).limit(1);
  return (
    <GallerySettingsForm
      settings={{ opaklik: s.opaklik, boyut: s.boyut, siteUrl: s.siteUrl, filigran: !!s.filigran }}
      preview={g ? imageUrl(s.surum, "b", g.dosya) : null}
    />
  );
}

export default function GallerySettingsPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[760px] animate-pulse rounded-2xl bg-muted" />}>
      <Settings />
    </Suspense>
  );
}
