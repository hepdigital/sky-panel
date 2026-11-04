import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CardEditor } from "@/components/whatsapp/card-editor";
import { requireAdmin } from "@/server/auth";
import { listSites } from "@/server/sites";
import { listCards, listPanelCategories } from "@/server/whatsapp/cards";
import { waEnabled } from "@/server/whatsapp/config";

export const metadata: Metadata = { title: "Asistan ürün kartları" };

async function Cards() {
  await connection();
  if (!waEnabled()) notFound();
  await requireAdmin();
  const [cards, sites, kategoriler] = await Promise.all([listCards(), listSites(), listPanelCategories()]);
  return (
    <CardEditor
      cards={cards}
      sites={sites.filter((s) => s.tur === "woocommerce").map((s) => ({ id: s.id, ad: s.ad }))}
      kategoriler={kategoriler}
    />
  );
}

export default function CardsPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1100px] animate-pulse rounded-2xl bg-muted" />}>
      <Cards />
    </Suspense>
  );
}
