import "server-only";
import { and, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import type { PdfData } from "@/lib/terminal/calc";
import { isAdmin, type Me } from "./auth";
import { db, schema } from "./db";

const { siparisler, teklifler, kullanicilar } = schema;
const own = (me: Me) => (isAdmin(me) ? undefined : eq(siparisler.kullaniciId, me.id));
const likeOf = (q: string) => `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;

/** Sipariş numaraları teklif numaraları gibi yıl içinde sıralı: SP-2026-1001 */
const SIRA_BASLANGIC = 1000;

/**
 * Onaylanan teklifi siparişe dönüştürür: kalemler ve tutarlar aynen kopyalanır, teklif "siparis" aşamasına geçer.
 * Satışçı yalnızca kendi teklifini dönüştürebilir; teklif başına tek sipariş olur.
 */
export async function convertQuote(me: Me, quoteId: number) {
  return db().transaction(async (tx) => {
    const [t] = await tx
      .select()
      .from(teklifler)
      .where(and(eq(teklifler.id, quoteId), isAdmin(me) ? undefined : eq(teklifler.kullaniciId, me.id)))
      .for("update");
    if (!t) return { ok: false as const, hata: "Teklif bulunamadı." };
    const [var_] = await tx.select({ id: siparisler.id }).from(siparisler).where(eq(siparisler.teklifId, quoteId));
    if (var_) return { ok: true as const, id: var_.id };
    if (t.asama !== "onaylandi") return { ok: false as const, hata: "Yalnızca onaylanmış teklif siparişe dönüştürülebilir." };
    const yil = new Date().getFullYear();
    const [{ max }] = await tx
      .select({ max: sql<number>`COALESCE(MAX(${siparisler.sira}), ${SIRA_BASLANGIC})` })
      .from(siparisler)
      .where(eq(siparisler.yil, yil))
      .for("update");
    const sira = Number(max) + 1;
    const [r] = await tx
      .insert(siparisler)
      .values({
        no: `SP-${yil}-${String(sira).padStart(4, "0")}`,
        yil, sira,
        teklifId: t.id, musteriId: t.musteriId, kullaniciId: t.kullaniciId ?? me.id, musteriAdi: t.musteriAdi,
        tutarKdvHaric: t.tutarKdvHaric, tutarKdvDahil: t.tutarKdvDahil, veri: t.veri,
      })
      .$returningId();
    await tx.update(teklifler).set({ asama: "siparis" }).where(eq(teklifler.id, t.id));
    return { ok: true as const, id: r.id };
  });
}

export async function listOrders(me: Me, q: string) {
  const search: SQL | undefined = q.trim() ? or(like(siparisler.no, likeOf(q)), like(siparisler.musteriAdi, likeOf(q))) : undefined;
  return db()
    .select({
      id: siparisler.id, no: siparisler.no, olusturma: siparisler.olusturma, musteriId: siparisler.musteriId, musteri: siparisler.musteriAdi,
      durum: siparisler.durum, dahil: siparisler.tutarKdvDahil, haric: siparisler.tutarKdvHaric,
      satisci: kullanicilar.adSoyad, teklifNo: teklifler.no, teklifId: siparisler.teklifId,
    })
    .from(siparisler)
    .leftJoin(kullanicilar, eq(kullanicilar.id, siparisler.kullaniciId))
    .leftJoin(teklifler, eq(teklifler.id, siparisler.teklifId))
    .where(and(own(me), search))
    .orderBy(desc(siparisler.id))
    .limit(200);
}

export async function getOrder(me: Me, id: number) {
  const [o] = await db()
    .select({ s: siparisler, satisci: kullanicilar.adSoyad, teklifNo: teklifler.no })
    .from(siparisler)
    .leftJoin(kullanicilar, eq(kullanicilar.id, siparisler.kullaniciId))
    .leftJoin(teklifler, eq(teklifler.id, siparisler.teklifId))
    .where(and(eq(siparisler.id, id), own(me)));
  if (!o) return null;
  return { ...o.s, satisci: o.satisci, teklifNo: o.teklifNo, veri: JSON.parse(o.s.veri) as PdfData };
}

export async function setOrderStatus(me: Me, id: number, durum: (typeof schema.SIPARIS_DURUMLARI)[number], notlar?: string) {
  const r = await db()
    .update(siparisler)
    .set({ durum, ...(notlar !== undefined ? { notlar: notlar.trim().slice(0, 4000) || null } : {}) })
    .where(and(eq(siparisler.id, id), own(me)));
  return r[0].affectedRows > 0;
}
