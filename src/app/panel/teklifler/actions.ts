"use server";

import { revalidatePath } from "next/cache";
import { getSeller, isAdmin } from "@/server/auth";
import { saveChannel } from "@/server/channels";
import { QuoteError, saveQuote, searchCustomers, type SaveInput } from "@/server/quotes";

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
    if (e instanceof QuoteError) return { ok: false, hata: e.message };
    return { ok: false, hata: e instanceof Error && ["Teklifte kalem yok.", "Kanal seçin.", "Marka seçin."].includes(e.message) ? e.message : "Teklif kaydedilemedi. Tekrar deneyin." };
  }
}

/** Kanal ekle / düzenle / kapat: yalnızca yönetici */
export async function kanalKaydet(c: { id: number | null; ad: string; aktif: boolean }): Promise<{ ok: true } | { ok: false; hata: string }> {
  const me = await getSeller();
  if (!me || !isAdmin(me)) return { ok: false, hata: "Kanalları yalnızca yönetici düzenler." };
  const r = await saveChannel(c);
  if (r.ok) {
    revalidatePath("/panel/teklifler");
    revalidatePath("/panel/teklifler/yeni");
  }
  return r;
}
