import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Inbox } from "@/components/whatsapp/inbox";
import { requireSeller } from "@/server/auth";
import { waEnabled } from "@/server/whatsapp/config";
import { getChat, listChats, type ChatDurum } from "@/server/whatsapp/store";

export const metadata: Metadata = { title: "WhatsApp" };

const DURUMLAR: ChatDurum[] = ["asistan", "ekip", "kapali"];

async function WhatsappInbox({ searchParams }: { searchParams: Promise<{ s?: string | string[]; durum?: string | string[] }> }) {
  await connection();
  // Bağlantı ayarlı değilse ekran yok
  if (!waEnabled()) notFound();
  const me = await requireSeller();
  const sp = await searchParams;
  const durum = DURUMLAR.find((d) => d === sp.durum) ?? null;
  const id = Number(sp.s) || null;
  const [chats, chat] = await Promise.all([listChats(durum), id ? getChat(me, id) : null]);
  return (
    <Inbox
      durum={durum}
      chats={chats.map((c) => ({ ...c, sonMesaj: c.sonMesaj.toISOString(), sonMusteriMesaji: c.sonMusteriMesaji?.toISOString() ?? null }))}
      chat={
        chat && {
          id: chat.id, telefon: chat.telefon, ad: chat.ad, durum: chat.durum, kaynak: chat.kaynak, reklamId: chat.reklamId, ctwaClid: chat.ctwaClid,
          ilgilenen: chat.ilgilenen, pencereAcik: chat.pencereAcik, sonMusteriMesaji: chat.sonMusteriMesaji?.toISOString() ?? null, olusturma: chat.olusturma.toISOString(),
          musteri: chat.musteri && { ...chat.musteri, siparisler: chat.musteri.siparisler.map((o) => ({ ...o, dahil: Number(o.dahil), tarih: new Date(o.tarih).toISOString() })) },
          mesajlar: chat.mesajlar.map((m) => ({ ...m, tarih: m.tarih.toISOString() })),
        }
      }
    />
  );
}

export default function WhatsappPage({ searchParams }: PageProps<"/panel/whatsapp">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-[70vh] max-w-[1400px] animate-pulse rounded-2xl bg-muted" />}>
      <WhatsappInbox searchParams={searchParams} />
    </Suspense>
  );
}
