import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AssistantSettings } from "@/components/whatsapp/assistant-settings";
import { requireAdmin } from "@/server/auth";
import { claudeReady, denemeMesajlari } from "@/server/whatsapp/asistan";
import { waEnabled } from "@/server/whatsapp/config";
import { assistantOn, getSettings } from "@/server/whatsapp/settings";

export const metadata: Metadata = { title: "WhatsApp asistanı" };

async function Assistant() {
  await connection();
  if (!waEnabled()) notFound();
  const me = await requireAdmin();
  const [ayar, deneme] = await Promise.all([getSettings(), denemeMesajlari(me.id)]);
  return (
    <AssistantSettings
      ayar={ayar}
      calisiyor={assistantOn(ayar)}
      anahtar={claudeReady()}
      deneme={{ ...deneme, mesajlar: deneme.mesajlar.map((m) => ({ ...m, tarih: m.tarih.toISOString() })) }}
    />
  );
}

export default function AssistantPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1400px] animate-pulse rounded-2xl bg-muted" />}>
      <Assistant />
    </Suspense>
  );
}
