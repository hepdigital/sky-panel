import "server-only";
import { and, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import type { PdfData } from "@/lib/terminal/calc";
import { isAdmin, type Me } from "./auth";
import { brandsFor } from "./brands";
import type { SiteOrder, Vocabulary } from "./sites";
import { db, schema } from "./db";

const { siparisler, teklifler, kullanicilar } = schema;
/**
 * Görünürlük: yönetici hepsini; satışçı kendi (tekliften dönen) siparişlerini ve çalıştığı markaların site siparişlerini görür.
 */
export async function orderScope(me: Me): Promise<SQL | undefined> {
  return own(me);
}
async function own(me: Me): Promise<SQL | undefined> {
  if (isAdmin(me)) return undefined;
  const ids = (await brandsFor(me)).map((b) => b.id);
  const mine = eq(siparisler.kullaniciId, me.id);
  return ids.length ? or(mine, and(eq(siparisler.kaynak, "site"), inArray(siparisler.markaId, ids))) : mine;
}
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
        teklifId: t.id, musteriId: t.musteriId, kullaniciId: t.kullaniciId ?? me.id, markaId: t.markaId, musteriAdi: t.musteriAdi,
        tutarKdvHaric: t.tutarKdvHaric, tutarKdvDahil: t.tutarKdvDahil, maliyet: t.maliyet, maliyetEksik: t.maliyetEksik, veri: t.veri,
      })
      .$returningId();
    await tx.update(teklifler).set({ asama: "siparis" }).where(eq(teklifler.id, t.id));
    return { ok: true as const, id: r.id };
  });
}

/** markaId: yalnızca o markanın siparişleri (null = hepsi) */
/** kaynak: yalnızca teklif ya da site siparişleri (null = hepsi) */
export async function listOrders(me: Me, q: string, markaId: number | null = null, kaynak: "teklif" | "site" | null = null) {
  const search: SQL | undefined = q.trim() ? or(like(siparisler.no, likeOf(q)), like(siparisler.musteriAdi, likeOf(q))) : undefined;
  return db()
    .select({
      id: siparisler.id, no: siparisler.no, olusturma: siparisler.olusturma, musteriId: siparisler.musteriId, musteri: siparisler.musteriAdi,
      durum: siparisler.durum, dahil: siparisler.tutarKdvDahil, haric: siparisler.tutarKdvHaric,
      satisci: kullanicilar.adSoyad, teklifNo: teklifler.no, teklifId: siparisler.teklifId,
      marka: schema.markalar.ad, markaRenk: schema.markalar.renk,
      kaynak: siparisler.kaynak, disDurum: siparisler.disDurum, odemeYontemi: siparisler.odemeYontemi, odemeDurumu: siparisler.odemeDurumu,
      siteId: siparisler.siteId, site: schema.siteBaglantilari.ad, disTarih: siparisler.disTarih,
    })
    .from(siparisler)
    .leftJoin(schema.siteBaglantilari, eq(schema.siteBaglantilari.id, siparisler.siteId))
    .leftJoin(kullanicilar, eq(kullanicilar.id, siparisler.kullaniciId))
    .leftJoin(teklifler, eq(teklifler.id, siparisler.teklifId))
    .leftJoin(schema.markalar, eq(schema.markalar.id, siparisler.markaId))
    .where(and(await own(me), search, markaId ? eq(siparisler.markaId, markaId) : undefined, kaynak ? eq(siparisler.kaynak, kaynak) : undefined))
    .orderBy(desc(sql`COALESCE(${siparisler.disTarih}, ${siparisler.olusturma})`), desc(siparisler.id))
    .limit(200);
}

export async function getOrder(me: Me, id: number) {
  const [o] = await db()
    .select({ s: siparisler, satisci: kullanicilar.adSoyad, teklifNo: teklifler.no, marka: schema.markalar.ad, site: schema.siteBaglantilari, musteriTelefon: schema.musteriler.telefon })
    .from(siparisler)
    .leftJoin(schema.musteriler, eq(schema.musteriler.id, siparisler.musteriId))
    .leftJoin(schema.siteBaglantilari, eq(schema.siteBaglantilari.id, siparisler.siteId))
    .leftJoin(kullanicilar, eq(kullanicilar.id, siparisler.kullaniciId))
    .leftJoin(teklifler, eq(teklifler.id, siparisler.teklifId))
    .leftJoin(schema.markalar, eq(schema.markalar.id, siparisler.markaId))
    .where(and(eq(siparisler.id, id), await own(me)));
  if (!o) return null;
  return {
    ...o.s, satisci: o.satisci, teklifNo: o.teklifNo, marka: o.marka, musteriTelefon: o.musteriTelefon, veri: JSON.parse(o.s.veri) as PdfData,
    siteVeri: o.s.siteVeri ? (JSON.parse(o.s.siteVeri) as SiteOrder) : null,
    site: o.site ? { id: o.site.id, ad: o.site.ad, tur: o.site.tur, adres: o.site.adres, sozluk: o.site.sozluk ? (JSON.parse(o.site.sozluk) as Vocabulary) : null } : null,
  };
}

export async function setOrderStatus(me: Me, id: number, durum: (typeof schema.SIPARIS_DURUMLARI)[number], notlar?: string) {
  const r = await db()
    .update(siparisler)
    .set({ durum, ...(notlar !== undefined ? { notlar: notlar.trim().slice(0, 4000) || null } : {}) })
    // Site siparişinin durumu sitenin kendi durumlarıyla değişir (sites.pushAction); buradan değişmez
    .where(and(eq(siparisler.id, id), eq(siparisler.kaynak, "teklif"), await own(me)));
  return r[0].affectedRows > 0;
}

/* ───────────── kargo (tekliften dönen siparişler) ───────────── */

// Site siparişlerinde kargo siteye yazılır (sites.ts); tekliften dönen siparişte firma ve takip no panelde tutulur.
// Kolonlar ilk kullanımda eklenir (canlıda drizzle push kullanılmaz); şemaya eklenmedi ki eski tabloda sorgular bozulmasın.
let cargoReady: Promise<unknown> | null = null;
const ensureCargo = () =>
  (cargoReady ??= (async () => {
    const [rows] = (await db().execute(
      sql`SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'siparisler' AND COLUMN_NAME IN ('kargo_firma', 'kargo_takip_no', 'kargo_tarih')`,
    )) as unknown as [{ c: string }[]];
    const have = new Set(rows.map((r) => r.c));
    if (!have.has("kargo_firma")) await db().execute(sql.raw("ALTER TABLE siparisler ADD COLUMN kargo_firma varchar(40) NULL AFTER notlar"));
    if (!have.has("kargo_takip_no")) await db().execute(sql.raw("ALTER TABLE siparisler ADD COLUMN kargo_takip_no varchar(80) NULL AFTER kargo_firma"));
    if (!have.has("kargo_tarih")) await db().execute(sql.raw("ALTER TABLE siparisler ADD COLUMN kargo_tarih timestamp NULL AFTER kargo_takip_no"));
  })().catch((e) => {
    cargoReady = null;
    throw e;
  }));

export async function orderCargo(id: number) {
  await ensureCargo();
  const [[r]] = (await db().execute(sql`SELECT kargo_firma, kargo_takip_no, kargo_tarih FROM siparisler WHERE id = ${id}`)) as unknown as [
    { kargo_firma: string | null; kargo_takip_no: string | null; kargo_tarih: Date | null }[],
  ];
  return { firma: r?.kargo_firma ?? null, takipNo: r?.kargo_takip_no ?? null, tarih: r?.kargo_tarih ? new Date(r.kargo_tarih).toISOString() : null };
}

/** Kargo bilgisini kaydeder; kargodaYap ise sipariş "kargoda"ya geçer */
export async function setOrderCargo(me: Me, id: number, firma: string, takipNo: string, kargodaYap: boolean) {
  await ensureCargo();
  const [o] = await db().select({ id: siparisler.id }).from(siparisler).where(and(eq(siparisler.id, id), eq(siparisler.kaynak, "teklif"), await own(me)));
  if (!o) return false;
  await db().execute(
    sql`UPDATE siparisler SET kargo_firma = ${firma.slice(0, 40) || null}, kargo_takip_no = ${takipNo.trim().slice(0, 80) || null}, kargo_tarih = COALESCE(kargo_tarih, NOW())${kargodaYap ? sql`, durum = 'kargoda'` : sql``} WHERE id = ${id}`,
  );
  return true;
}
