import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { GalleryAdmin } from "@/components/gallery/gallery-admin";
import { isAdmin, requireMe } from "@/server/auth";
import { adminView, albumOptions } from "@/server/gallery";

export const metadata: Metadata = { title: "Galeri" };

// Yönetim kabuğu adres bilgisini Suspense dışında okuyor; dinamik adresli bu sayfa sunucuda beklemeli işlenir
export const instant = false;

async function Album({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const me = await requireMe();
  const [view, options] = await Promise.all([adminView(Number((await params).id) || -1), albumOptions()]);
  if (!view) notFound();
  return <GalleryAdmin view={view} me={{ id: me.id, admin: isAdmin(me) }} options={options} />;
}

export default function AlbumPage({ params }: PageProps<"/panel/galeri/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1200px] animate-pulse rounded-2xl bg-muted" />}>
      <Album params={params} />
    </Suspense>
  );
}
