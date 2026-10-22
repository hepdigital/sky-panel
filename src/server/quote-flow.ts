import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { PdfData } from "@/lib/terminal/calc";
import { isAdmin, type Me } from "./auth";
import { db, schema } from "./db";

// Teklif akışı: taslak → gonderildi → onaylandi / reddedildi → siparis.
// Müşteri teklifi /t/<kod> linkinden görür (giriş gerekmez): ilk/son görülme ve sayısı tutulur, kabul eder ya da revizyon ister.

const { teklifler, kullanicilar } = schema;
const own = (me: Me) => (isAdmin(me) ? undefined : eq(teklifler.kullaniciId, me.id));

export const quoteLink = (token: string) => `${(process.env.PUBLIC_URL ?? "").replace(/\/$/, "")}/t/${token}`;

/** WhatsApp/e-posta/link ile iletildi: taslaksa "gönderildi" olur (daha ileri aşamadaysa aşama değişmez) */
export async function markSent(me: Me, id: number) {
  await db()
    .update(teklifler)
    .set({ asama: sql`IF(${teklifler.asama} = 'taslak', 'gonderildi', ${teklifler.asama})`, gonderim: sql`COALESCE(${teklifler.gonderim}, NOW())` })
    .where(and(eq(teklifler.id, id), own(me)));
}

/** Satışçının elle verdiği karar (ör. müşteri telefonda onayladı) */
export async function setStage(me: Me, id: number, asama: "gonderildi" | "onaylandi" | "reddedildi") {
  const [t] = await db().select({ asama: teklifler.asama }).from(teklifler).where(and(eq(teklifler.id, id), own(me)));
  if (!t || t.asama === "siparis") return false;
  await db().update(teklifler).set({ asama }).where(eq(teklifler.id, id));
  return true;
}

export type PublicQuote = {
  no: string;
  veri: PdfData;
  asama: (typeof schema.TEKLIF_ASAMALARI)[number];
  gecerlilik: Date | null;
  sureDoldu: boolean;
  yanitTarihi: Date | null;
  yanitAd: string | null;
  yanitNot: string | null;
  satisci: { adSoyad: string; telefon: string | null; eposta: string | null } | null;
};

/** Linkteki teklif (müşteri görünümü); bulunamazsa null */
export async function getPublicQuote(token: string): Promise<PublicQuote | null> {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  const [t] = await db()
    .select({
      no: teklifler.no, veri: teklifler.veri, asama: teklifler.asama, gecerlilik: teklifler.gecerlilik,
      yanitTarihi: teklifler.yanitTarihi, yanitAd: teklifler.yanitAd, yanitNot: teklifler.yanitNot,
      adSoyad: kullanicilar.adSoyad, telefon: kullanicilar.telefon, eposta: kullanicilar.eposta,
    })
    .from(teklifler)
    .leftJoin(kullanicilar, eq(kullanicilar.id, teklifler.kullaniciId))
    .where(eq(teklifler.token, token));
  if (!t) return null;
  return {
    no: t.no,
    veri: JSON.parse(t.veri) as PdfData,
    asama: t.asama,
    gecerlilik: t.gecerlilik,
    sureDoldu: !!t.gecerlilik && t.gecerlilik.getTime() < Date.now(),
    yanitTarihi: t.yanitTarihi,
    yanitAd: t.yanitAd,
    yanitNot: t.yanitNot,
    satisci: t.adSoyad ? { adSoyad: t.adSoyad, telefon: t.telefon, eposta: t.eposta } : null,
  };
}

/** Müşteri linki açtı: görülme kaydı (taslak teklif link açılınca "gönderildi" sayılır) */
export async function recordView(token: string) {
  await db()
    .update(teklifler)
    .set({
      ilkGorulme: sql`COALESCE(${teklifler.ilkGorulme}, NOW())`,
      sonGorulme: sql`NOW()`,
      gorulmeSayisi: sql`${teklifler.gorulmeSayisi} + 1`,
      asama: sql`IF(${teklifler.asama} = 'taslak', 'gonderildi', ${teklifler.asama})`,
      gonderim: sql`COALESCE(${teklifler.gonderim}, NOW())`,
    })
    .where(eq(teklifler.token, token));
}

/**
 * Müşterinin yanıtı: kabul (aşama "onaylandi") ya da revizyon isteği (aşama "gonderildi" kalır, not satışçıya düşer).
 * Süresi dolmuş, siparişe dönmüş ya da zaten kabul edilmiş teklif yanıt almaz.
 */
export async function respond(token: string, kabul: boolean, ad: string, not: string) {
  const q = await getPublicQuote(token);
  if (!q) return { ok: false as const, hata: "Teklif bulunamadı." };
  if (q.sureDoldu) return { ok: false as const, hata: "Teklifin geçerlilik süresi dolmuş. Satış temsilcinizle görüşün." };
  if (q.asama === "siparis" || q.asama === "onaylandi") return { ok: false as const, hata: "Bu teklif zaten onaylanmış." };
  await db()
    .update(teklifler)
    .set({
      asama: kabul ? "onaylandi" : q.asama === "taslak" ? "gonderildi" : q.asama,
      yanitTarihi: new Date(),
      yanitAd: ad.trim().slice(0, 120) || null,
      yanitNot: (kabul ? not : `Revizyon isteği: ${not}`).trim().slice(0, 2000) || null,
    })
    .where(eq(teklifler.token, token));
  return { ok: true as const };
}
