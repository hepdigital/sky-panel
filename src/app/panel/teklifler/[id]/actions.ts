"use server";

import { revalidatePath } from "next/cache";
import { getSeller } from "@/server/auth";
import { mailReady, sendMail } from "@/server/mail";
import { getQuote } from "@/server/quotes";
import { markSent, quoteLink, setStage } from "@/server/quote-flow";

type Result = { ok: true } | { ok: false; hata: string };

/** WhatsApp ya da kopyalanan link ile iletildi */
export async function gonderildi(id: number): Promise<Result> {
  const me = await getSeller();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  await markSent(me, id);
  revalidatePath(`/panel/teklifler/${id}`);
  return { ok: true };
}

export async function asamaDegistir(id: number, asama: "gonderildi" | "onaylandi" | "reddedildi"): Promise<Result> {
  const me = await getSeller();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  if (!(await setStage(me, id, asama))) return { ok: false, hata: "Bu teklifin aşaması değiştirilemez." };
  revalidatePath(`/panel/teklifler/${id}`);
  return { ok: true };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Teklifi e-postayla gönderir: link + (tarayıcıda üretilen) PDF eki; satışçıya yanıt adresi olarak yazılır */
export async function epostaGonder(id: number, to: string, pdfBase64: string | null): Promise<Result> {
  const me = await getSeller();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  if (!mailReady()) return { ok: false, hata: "E-posta ayarları (SMTP) henüz yapılmadı. Şimdilik WhatsApp ya da linki kullanın." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, hata: "E-posta adresi geçersiz." };
  const t = await getQuote(me, id);
  if (!t || !t.token) return { ok: false, hata: "Teklif bulunamadı." };
  const link = quoteLink(t.token);
  const ad = t.veri.yetkili || t.veri.musteri || "";
  try {
    await sendMail({
      to,
      replyTo: me.eposta ?? undefined,
      subject: `Fiyat teklifi ${t.no} · SKY Görsel Çözümler`,
      html: `<p>Merhaba${ad ? ` ${esc(ad)}` : ""},</p>
<p>${esc(t.no)} numaralı fiyat teklifimizi aşağıdaki bağlantıdan inceleyebilir, PDF olarak indirebilir ve onaylayabilirsiniz:</p>
<p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#1d3a76;color:#fff;border-radius:999px;text-decoration:none;font-weight:600">Teklifi görüntüle</a></p>
<p style="color:#5e6b82;font-size:13px">${link}</p>
<p>Saygılarımızla,<br>${esc(me.adSoyad)}${me.telefon ? `<br>${esc(me.telefon)}` : ""}<br>SKY Görsel Çözümler</p>`,
      attachments: pdfBase64 ? [{ filename: t.veri.dosyaAdi || `Teklif-${t.no}.pdf`, content: Buffer.from(pdfBase64, "base64") }] : undefined,
    });
  } catch (e) {
    console.error("epostaGonder", e);
    return { ok: false, hata: "E-posta gönderilemedi. Adresi ve SMTP ayarlarını kontrol edin." };
  }
  await markSent(me, id);
  revalidatePath(`/panel/teklifler/${id}`);
  return { ok: true };
}
