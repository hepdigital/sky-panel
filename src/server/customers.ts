import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { isAdmin, type Me } from "./auth";
import { brandsFor, canUseBrand } from "./brands";
import { db, schema } from "./db";

const { musteriler, iskontoGruplari, teklifler, siparisler, kullanicilar } = schema;
const own = (me: Me) => (isAdmin(me) ? undefined : eq(musteriler.sahipId, me.id));
/** Görebildikleri: kendi müşterileri + çalıştığı markaların sitelerinden gelen müşteriler (düzenleme yalnızca kendi müşterisinde) */
async function visible(me: Me) {
  if (isAdmin(me)) return undefined;
  const ids = (await brandsFor(me)).map((b) => b.id);
  return ids.length ? or(eq(musteriler.sahipId, me.id), and(isNotNull(musteriler.siteId), inArray(musteriler.markaId, ids))) : eq(musteriler.sahipId, me.id);
}
const likeOf = (q: string) => `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
const clip = (v: string | null | undefined, max: number) => (v?.trim() ? v.trim().slice(0, max) : null);

/* ---------------- iskonto grupları ---------------- */

export type Group = { id: number; ad: string; fiyatListesi: "perakende" | "toptan"; oran: number; aciklama: string | null };

export async function listGroups(): Promise<(Group & { musteri: number })[]> {
  return db()
    .select({
      id: iskontoGruplari.id, ad: iskontoGruplari.ad, fiyatListesi: iskontoGruplari.fiyatListesi, oran: iskontoGruplari.oran, aciklama: iskontoGruplari.aciklama,
      // Dış tablo adı açıkça yazılır (tek tablolu sorguda Drizzle sütunu tablo adı olmadan yazar)
      musteri: sql<number>`(SELECT COUNT(*) FROM musteriler AS m2 WHERE m2.iskonto_grubu_id = iskonto_gruplari.id)`.mapWith(Number),
    })
    .from(iskontoGruplari)
    .orderBy(asc(iskontoGruplari.oran), asc(iskontoGruplari.ad));
}

export async function saveGroup(g: { id: number | null; ad: string; fiyatListesi: string; oran: number; aciklama: string }) {
  const ad = clip(g.ad, 80);
  if (!ad) return { ok: false as const, hata: "Grup adı gerekli." };
  const oran = Number(g.oran);
  if (!Number.isFinite(oran) || oran < -100 || oran > 100) return { ok: false as const, hata: "İskonto %-100 ile %100 arasında olmalı." };
  const values = { ad, fiyatListesi: g.fiyatListesi === "toptan" ? ("toptan" as const) : ("perakende" as const), oran: Math.round(oran * 100) / 100, aciklama: clip(g.aciklama, 255) };
  try {
    if (g.id) await db().update(iskontoGruplari).set(values).where(eq(iskontoGruplari.id, g.id));
    else await db().insert(iskontoGruplari).values(values);
  } catch {
    return { ok: false as const, hata: "Bu adla bir grup zaten var." };
  }
  return { ok: true as const };
}

/** Grup silinince müşterileri grupsuz kalır (yabancı anahtar SET NULL) */
export async function deleteGroup(id: number) {
  await db().delete(iskontoGruplari).where(eq(iskontoGruplari.id, id));
}

/* ---------------- müşteriler ---------------- */

const teklifSayisi = sql<number>`(SELECT COUNT(*) FROM ${teklifler} WHERE ${teklifler.musteriId} = ${musteriler.id})`.mapWith(Number);
const siparisSayisi = sql<number>`(SELECT COUNT(*) FROM ${siparisler} WHERE ${siparisler.musteriId} = ${musteriler.id} AND ${siparisler.durum} <> 'iptal')`.mapWith(Number);
const siparisTutari = sql<number>`(SELECT COALESCE(SUM(${siparisler.tutarKdvDahil}), 0) FROM ${siparisler} WHERE ${siparisler.musteriId} = ${musteriler.id} AND ${siparisler.durum} <> 'iptal')`.mapWith(Number);
const sonIslem = sql<string | null>`GREATEST(COALESCE((SELECT MAX(${teklifler.olusturma}) FROM ${teklifler} WHERE ${teklifler.musteriId} = ${musteriler.id}), ${musteriler.olusturma}), COALESCE((SELECT MAX(COALESCE(${siparisler.disTarih}, ${siparisler.olusturma})) FROM ${siparisler} WHERE ${siparisler.musteriId} = ${musteriler.id}), ${musteriler.olusturma}), ${musteriler.olusturma})`;

export async function listCustomers(me: Me, q: string, kaynak: "panel" | "site" | null = null) {
  const search = q.trim()
    ? or(like(musteriler.firma, likeOf(q.trim())), like(musteriler.yetkili, likeOf(q.trim())), like(musteriler.telefon, likeOf(q.trim())), like(musteriler.eposta, likeOf(q.trim())))
    : undefined;
  const rows = await db()
    .select({
      id: musteriler.id, firma: musteriler.firma, yetkili: musteriler.yetkili, telefon: musteriler.telefon, il: musteriler.il,
      grup: iskontoGruplari.ad, grupOran: iskontoGruplari.oran, temsilci: kullanicilar.adSoyad,
      marka: schema.markalar.ad, markaRenk: schema.markalar.renk, site: schema.siteBaglantilari.ad,
      teklif: teklifSayisi, siparis: siparisSayisi, ciro: siparisTutari, sonIslem,
    })
    .from(musteriler)
    .leftJoin(iskontoGruplari, eq(iskontoGruplari.id, musteriler.iskontoGrubuId))
    .leftJoin(kullanicilar, eq(kullanicilar.id, musteriler.sahipId))
    .leftJoin(schema.markalar, eq(schema.markalar.id, musteriler.markaId))
    .leftJoin(schema.siteBaglantilari, eq(schema.siteBaglantilari.id, musteriler.siteId))
    .where(and(await visible(me), search, kaynak === "site" ? isNotNull(musteriler.siteId) : kaynak === "panel" ? isNull(musteriler.siteId) : undefined))
    .orderBy(desc(sonIslem))
    .limit(300);
  // GREATEST sürücüden tarih ya da (UTC) metin olarak gelebilir
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? new Date(`${String(v).replace(" ", "T")}Z`).toISOString() : null);
  return rows.map((r) => ({ ...r, sonIslem: iso(r.sonIslem) }));
}

export async function getCustomer(me: Me, id: number) {
  const [m] = await db()
    .select({ m: musteriler, grup: iskontoGruplari, temsilci: kullanicilar.adSoyad, marka: schema.markalar.ad, markaRenk: schema.markalar.renk, site: schema.siteBaglantilari.ad })
    .from(musteriler)
    .leftJoin(iskontoGruplari, eq(iskontoGruplari.id, musteriler.iskontoGrubuId))
    .leftJoin(kullanicilar, eq(kullanicilar.id, musteriler.sahipId))
    .leftJoin(schema.markalar, eq(schema.markalar.id, musteriler.markaId))
    .leftJoin(schema.siteBaglantilari, eq(schema.siteBaglantilari.id, musteriler.siteId))
    .where(and(eq(musteriler.id, id), await visible(me)));
  if (!m) return null;
  const [quotes, orders] = await Promise.all([
    db()
      .select({
        id: teklifler.id, no: teklifler.no, olusturma: teklifler.olusturma, asama: teklifler.asama, dahil: teklifler.tutarKdvDahil,
        satisci: sql<string | null>`COALESCE(${kullanicilar.adSoyad}, ${teklifler.kullanici})`,
      })
      .from(teklifler)
      .leftJoin(kullanicilar, eq(kullanicilar.id, teklifler.kullaniciId))
      .where(eq(teklifler.musteriId, id))
      .orderBy(desc(teklifler.id))
      .limit(100),
    db()
      .select({ id: siparisler.id, no: siparisler.no, olusturma: siparisler.olusturma, durum: siparisler.durum, dahil: siparisler.tutarKdvDahil, satisci: kullanicilar.adSoyad })
      .from(siparisler)
      .leftJoin(kullanicilar, eq(kullanicilar.id, siparisler.kullaniciId))
      .where(eq(siparisler.musteriId, id))
      .orderBy(desc(siparisler.id))
      .limit(100),
  ]);
  return { ...m.m, grup: m.grup, temsilci: m.temsilci, marka: m.marka, markaRenk: m.markaRenk, site: m.site, quotes, orders };
}

export type CustomerInput = {
  id: number | null;
  firma: string;
  yetkili: string;
  telefon: string;
  eposta: string;
  vergiDairesi: string;
  vergiNo: string;
  il: string;
  adres: string;
  notlar: string;
  /** Yalnızca yönetici değiştirebilir */
  iskontoGrubuId: number | null;
  sahipId: number | null;
  /** Geldiği marka (kullanıcının markalarından) */
  markaId: number | null;
};

/** Yeni müşterinin sahibi kaydeden satışçıdır. Satışçı yalnızca kendi müşterisini düzenler; grup ve temsilciyi yönetici atar. */
export async function saveCustomer(me: Me, c: CustomerInput): Promise<{ ok: true; id: number } | { ok: false; hata: string }> {
  const firma = clip(c.firma, 200);
  if (!firma) return { ok: false, hata: "Firma / müşteri adı gerekli." };
  const values = {
    firma, yetkili: clip(c.yetkili, 120), telefon: clip(c.telefon, 40), eposta: clip(c.eposta, 160),
    vergiDairesi: clip(c.vergiDairesi, 120), vergiNo: clip(c.vergiNo, 20), il: clip(c.il, 60), adres: clip(c.adres, 2000), notlar: clip(c.notlar, 4000),
  };
  const admin = isAdmin(me) ? { iskontoGrubuId: c.iskontoGrubuId || null, ...(c.sahipId ? { sahipId: c.sahipId } : {}) } : {};
  const marka = c.markaId ? await canUseBrand(me, c.markaId) : null;
  Object.assign(values, marka ? { markaId: marka.id } : {});
  if (c.id) {
    const r = await db().update(musteriler).set({ ...values, ...admin }).where(and(eq(musteriler.id, c.id), own(me)));
    return r[0].affectedRows ? { ok: true, id: c.id } : { ok: false, hata: "Müşteri bulunamadı." };
  }
  const [r] = await db().insert(musteriler).values({ ...values, sahipId: me.id, olusturan: me.adSoyad, ...admin }).$returningId();
  return { ok: true, id: r.id };
}

/** Teklif ekranına müşteriyle gelince (Müşteri → Teklif oluştur) ön bilgi ve iskonto grubu */
export async function customerForQuote(me: Me, id: number) {
  const [m] = await db()
    .select({
      id: musteriler.id, firma: musteriler.firma, yetkili: musteriler.yetkili, telefon: musteriler.telefon, eposta: musteriler.eposta, grup: iskontoGruplari,
      kanalId: sql<number | null>`(SELECT ${teklifler.kanalId} FROM ${teklifler} WHERE ${teklifler.musteriId} = ${musteriler.id} AND ${teklifler.kanalId} IS NOT NULL ORDER BY ${teklifler.id} DESC LIMIT 1)`,
    })
    .from(musteriler)
    .leftJoin(iskontoGruplari, eq(iskontoGruplari.id, musteriler.iskontoGrubuId))
    .where(and(eq(musteriler.id, id), own(me)));
  if (!m) return null;
  return {
    id: m.id, firma: m.firma, yetkili: m.yetkili ?? "", telefon: m.telefon ?? "", eposta: m.eposta ?? "",
    grup: m.grup ? { ad: m.grup.ad, liste: m.grup.fiyatListesi, oran: m.grup.oran } : null,
    kanalId: m.kanalId === null ? null : Number(m.kanalId),
  };
}

/** Yöneticinin temsilci atayabileceği aktif kullanıcılar */
export async function staffList() {
  return db().select({ id: kullanicilar.id, adSoyad: kullanicilar.adSoyad }).from(kullanicilar).where(eq(kullanicilar.aktif, true)).orderBy(asc(kullanicilar.adSoyad));
}
