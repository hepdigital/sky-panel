import "server-only";
import { eq } from "drizzle-orm";
import type { Me } from "../auth";
import { db, schema } from "../db";
import { cancelPaymentLink, createProductPaymentLink } from "../payment-links";
import { getCard } from "./cards";
import { parseDraft, sendFromPanel, type PaymentDraft } from "./store";

// WhatsApp sohbetinden ödeme linki (Faz 2.1): sipariş ürün satırıyla açılır, sohbet başına tek açık link.
// Asistan (ayar "otomatik") ya da ekip ("ekip onaylı" modda hazırlanan özetten) kullanır.

const { waSohbetler: sohbetler } = schema;

export type { PaymentDraft };

/** Önceki linki iptal ederken yönetici yetkisi (asistan bir kullanıcı değildir) */
const SYSTEM: Me = { id: 0, kullaniciAdi: "whatsapp-asistani", adSoyad: "WhatsApp asistanı", eposta: null, telefon: null, rol: "yonetici" };

/**
 * Sohbet için ürün satırlı ödeme linki açar. Sohbette önceki ödenmemiş link varsa sitede iptal edilir (ödenmişse dokunulmaz).
 * kullaniciId: linki açan panel kullanıcısı (asistan: null).
 */
export async function createChatPaymentLink(sohbetId: number, telefon: string, d: PaymentDraft, kullaniciId: number | null, satisci: string) {
  const card = await getCard(d.urunKodu);
  if (!card?.aktif || !card.siteId || !card.disUrunId) return { ok: false as const, hata: "Ürün kartında site ürünü tanımlı değil." };
  const [s] = await db().select({ link: sohbetler.odemeLinkiId }).from(sohbetler).where(eq(sohbetler.id, sohbetId));
  if (s?.link) {
    const c = await cancelPaymentLink(SYSTEM, s.link).catch(() => null);
    if (c && !c.ok) console.log("[wa-asistan] önceki link iptal edilmedi", sohbetId, c.hata);
  }
  const r = await createProductPaymentLink({
    siteId: card.siteId, urunId: card.disUrunId, urunAd: card.ad, renk: d.renk, adet: d.adet, musteri: d.adSoyad, telefon, eposta: d.eposta, adres: d.adres, il: d.il,
    kullaniciId, satisci,
  });
  if (!r.ok) return r;
  // Müşterinin onayladığı tutardan farklıysa (fiyat değişmiş) link gönderilmez
  if (Math.abs(r.toplam - d.tutar) > 1) {
    await cancelPaymentLink(SYSTEM, r.id).catch(() => null);
    return { ok: false as const, hata: `Sitedeki tutar (${r.toplam} TL) müşterinin onayladığından (${d.tutar} TL) farklı; link oluşturulmadı.` };
  }
  await db().update(sohbetler).set({ odemeLinkiId: r.id, odemeTaslak: null }).where(eq(sohbetler.id, sohbetId));
  return r;
}

/** Ekip onaylı mod: hazırlanan özetten linki oluşturur ve panelden (ekip mesajı olarak) müşteriye gönderir */
export async function sendChatPaymentLink(me: Me, sohbetId: number): Promise<{ ok: true } | { ok: false; hata: string }> {
  const [s] = await db().select({ telefon: sohbetler.telefon, taslak: sohbetler.odemeTaslak }).from(sohbetler).where(eq(sohbetler.id, sohbetId));
  const d = parseDraft(s?.taslak ?? null);
  if (!s || !d) return { ok: false, hata: "Bu sohbette bekleyen ödeme linki özeti yok." };
  const r = await createChatPaymentLink(sohbetId, s.telefon, d, me.id, me.adSoyad);
  if (!r.ok) return r;
  const g = await sendFromPanel(me, sohbetId, paymentMessage(r.no, r.toplam, r.link));
  return g.ok ? { ok: true } : { ok: false, hata: `Link oluşturuldu (sipariş ${r.no}) ama gönderilemedi: ${g.hata} Link: ${r.link}` };
}

/** Müşteriye giden ödeme linki mesajı (asistan ve panel aynı metni kullanır) */
export const paymentMessage = (no: string, toplam: number, link: string) =>
  `Ödeme linkiniz hazır (sipariş no ${no}, toplam ${toplam.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL):
${link}

Kart ile 12 taksite kadar ödeyebilirsiniz.`;
