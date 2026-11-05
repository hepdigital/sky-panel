import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { GalleryAdmin } from "@/components/gallery/gallery-admin";
import { isAdmin, requireMe } from "@/server/auth";
import { adminView, albumOptions } from "@/server/gallery";

export const metadata: Metadata = { title: "Galeri" };

async function Root() {
  await connection();
  const me = await requireMe();
  const [view, options] = await Promise.all([adminView(null), albumOptions()]);
  return <GalleryAdmin view={view!} me={{ id: me.id, admin: isAdmin(me) }} options={options} />;
}

export default function GalleryPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1200px] animate-pulse rounded-2xl bg-muted" />}>
      <Root />
    </Suspense>
  );
}
