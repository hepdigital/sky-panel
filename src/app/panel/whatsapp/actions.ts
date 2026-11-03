"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getMe, getSeller, isAdmin } from "@/server/auth";
import { saveWebp } from "@/server/files";
import { denemeGonder, denemeSifirla, type DenemeSecenek } from "@/server/whatsapp/asistan";
import { saveCard } from "@/server/whatsapp/cards";
import { learnFromChat, updateExample } from "@/server/whatsapp/learning";
import { sendChatPaymentLink } from "@/server/whatsapp/payment";
import { waEnabled } from "@/server/whatsapp/config";
import { MODELLER, saveSettings } from "@/server/whatsapp/settings";
import { closeChat, releaseToAssistant, sendFromPanel, takeOver } from "@/server/whatsapp/store";

type Result = { ok: true } | { ok: false; hata: string };

async function seller() {
  if (!waEnabled()) return null;
  return getSeller();
}

/** Asistan ayarları ve ürün kartları yalnızca yöneticiye açık */
async function admin() {
  if (!waEnabled()) return null;
  const me = await getMe();
  return me && isAdmin(me) ? me : null;
}

const refresh = () => {
  revalidatePath("/panel/whatsapp");
  revalidatePath("/panel", "layout");
};

export async function waGonder(id: number, metin: string): Promise<Result> {
  const me = await seller();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  const r = await sendFromPanel(me, Number(id), String(metin ?? ""));
  refresh();
  return r;
}

export async function waDevral(id: number): Promise<Result> {
  const me = await seller();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  await takeOver(me, Number(id));
  refresh();
  return { ok: true };
}

/** Asistana bırak: müşteri yeniden yazınca asistan cevaplar (ekibin yazdıkları bağlam olarak verilir) */
export async function waAsistanaBirak(id: number): Promise<Result> {
  const me = await seller();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  await releaseToAssistant(Number(id));
  // Ekibin bu sohbetteki cevabından öneri çıkarılır (cevaptan sonra, Haiku ile)
  after(() => learnFromChat(Number(id)));
  refresh();
  return { ok: true };
}

export async function waKapat(id: number): Promise<Result> {
  const me = await seller();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  await closeChat(Number(id));
  after(() => learnFromChat(Number(id)));
  refresh();
  return { ok: true };
}

/** "Ekip onaylı" modda asistanın hazırladığı özetten ödeme linkini oluşturup müşteriye gönderir */
export async function waOdemeLinkiGonder(id: number): Promise<Result> {
  const me = await seller();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  const r = await sendChatPaymentLink(me, Number(id));
  refresh();
  return r;
}

/** Öğrenilen örnek: düzenle, onayla, reddet ya da pasifleştir (yalnız yönetici) */
export async function waOrnekGuncelle(id: number, v: { musteriMesaji?: string; dogruCevap?: string; urunKodu?: string | null; durum?: string; aktif?: boolean }): Promise<Result> {
  const me = await admin();
  if (!me) return { ok: false, hata: "Bu işlem yalnızca yöneticiye açık." };
  const r = await updateExample(me.id, Number(id), v ?? {});
  revalidatePath("/panel/whatsapp/ornekler");
  return r;
}

export async function waAyarKaydet(veri: unknown): Promise<Result> {
  if (!(await admin())) return { ok: false, hata: "Bu işlem yalnızca yöneticiye açık." };
  await saveSettings(veri);
  revalidatePath("/panel/whatsapp/asistan");
  return { ok: true };
}

export async function waKartKaydet(veri: Record<string, unknown>, eskiKod: string | null): Promise<Result> {
  if (!(await admin())) return { ok: false, hata: "Bu işlem yalnızca yöneticiye açık." };
  const r = await saveCard(veri ?? {}, eskiKod ? String(eskiKod) : null);
  revalidatePath("/panel/whatsapp/urunler");
  return r;
}

/** Ürün kartına görsel: panelin ürün görselleriyle aynı yere (herkese açık /dosya/urun) */
export async function waKartGorselYukle(base64: string): Promise<{ ok: true; yol: string } | { ok: false; hata: string }> {
  if (!(await admin())) return { ok: false, hata: "Bu işlem yalnızca yöneticiye açık." };
  try {
    return { ok: true, yol: await saveWebp("urun", Buffer.from(String(base64), "base64")) };
  } catch (e) {
    return { ok: false, hata: (e as Error).message };
  }
}

/** Deneme alanı: müşteri gibi yaz, asistanın cevabını bekle (görsel webp base64). modelB: aynı mesajı yan sütunda ikinci modelle cevaplat. */
export async function waDeneme(metin: string, gorsel: string | null, secenek: DenemeSecenek, modelA: string, modelB: string | null): Promise<Result> {
  const me = await admin();
  if (!me) return { ok: false, hata: "Bu işlem yalnızca yöneticiye açık." };
  let img: { mime: string; data: Buffer } | null = null;
  if (gorsel) {
    const data = Buffer.from(String(gorsel), "base64");
    if (data.length > 2_000_000 || data.toString("ascii", 0, 4) !== "RIFF" || data.toString("ascii", 8, 12) !== "WEBP") return { ok: false, hata: "Görsel okunamadı." };
    img = { mime: "image/webp", data };
  }
  const kaynak = (["reklam", "site", "dogrudan"] as const).find((k) => k === secenek?.kaynak) ?? "dogrudan";
  const a = MODELLER.find((m) => m.key === modelA)?.key;
  const b = modelB ? MODELLER.find((m) => m.key === modelB)?.key : null;
  if (!a || b === undefined) return { ok: false, hata: "Model geçersiz." };
  const r = await denemeGonder(me.id, String(metin ?? ""), img, { kaynak, telefon: String(secenek?.telefon ?? "") }, a, b);
  revalidatePath("/panel/whatsapp/asistan");
  return r;
}

export async function waDenemeSifirla(): Promise<Result> {
  const me = await admin();
  if (!me) return { ok: false, hata: "Bu işlem yalnızca yöneticiye açık." };
  await denemeSifirla(me.id);
  revalidatePath("/panel/whatsapp/asistan");
  return { ok: true };
}
