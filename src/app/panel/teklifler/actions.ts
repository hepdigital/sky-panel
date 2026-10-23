"use server";

import { getSeller } from "@/server/auth";
import { saveQuote, searchCustomers, type SaveInput } from "@/server/quotes";

export async function musteriAra(q: string) {
  const me = await getSeller();
  if (!me) return [];
  return searchCustomers(me, String(q ?? "").slice(0, 80));
}

/** Teklifi oturumdaki satışçı adına kaydeder */
export async function teklifKaydet(input: SaveInput): Promise<{ ok: true; id: number; no: string; dosyaAdi: string; musteriId: number | null } | { ok: false; hata: string }> {
  const me = await getSeller();
  if (!me) return { ok: false, hata: "Oturum kapanmış. Sayfayı yenileyip tekrar giriş yapın." };
  try {
    if (JSON.stringify(input).length > 4_000_000) return { ok: false, hata: "Teklif çok büyük." };
    return { ok: true, ...(await saveQuote(me, input)) };
  } catch (e) {
    console.error("teklifKaydet", e);
    return { ok: false, hata: e instanceof Error && e.message === "Teklifte kalem yok." ? e.message : "Teklif kaydedilemedi. Tekrar deneyin." };
  }
}
