import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { isAdmin, type Me } from "./auth";
import { brandsFor } from "./brands";
import { db, schema } from "./db";

// Sitelerden gelen form talepleri (GazeboTente toptan alım, bayilik, iletişim). Sipariş eşitlemesiyle birlikte çekilir;
// takip (durum, not, ilgilenen) yalnızca panelde tutulur, siteye yazılmaz.

const { siteTalepleri: talepler, siteBaglantilari: sites } = schema;
type Site = typeof sites.$inferSelect;
export type TalepDurum = (typeof schema.TALEP_DURUMLARI)[number];

export const TALEP_DURUM_AD: Record<TalepDurum, string> = { yeni: "Yeni", arandi: "Arandı", teklif: "Teklif verildi", kazanildi: "Satışa döndü", kaybedildi: "Olumsuz" };

let ready: Promise<unknown> | null = null;
const ensureTable = () =>
  (ready ??= db()
    .execute(
      sql.raw(`CREATE TABLE IF NOT EXISTS site_talepleri (
        id int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
        site_id int unsigned NOT NULL,
        marka_id int unsigned NOT NULL,
        dis_id int unsigned NOT NULL,
        tur varchar(24) NOT NULL,
        tur_ad varchar(60) NOT NULL,
        ad varchar(120) NOT NULL,
        firma varchar(191) NULL,
        eposta varchar(191) NOT NULL,
        telefon varchar(32) NOT NULL,
        il varchar(64) NULL,
        mesaj text NOT NULL,
        dis_tarih timestamp NOT NULL DEFAULT current_timestamp(),
        durum enum('yeni','arandi','teklif','kazanildi','kaybedildi') NOT NULL DEFAULT 'yeni',
        \`not\` text NULL,
        ilgilenen_id int unsigned NULL,
        olusturma timestamp NOT NULL DEFAULT current_timestamp(),
        guncelleme timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
        UNIQUE KEY talep_site_dis (site_id, dis_id),
        KEY talep_durum (durum),
        CONSTRAINT site_talepleri_site_id_site_baglantilari_id_fk FOREIGN KEY (site_id) REFERENCES site_baglantilari (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`),
    )
    .catch((e) => {
      ready = null;
      throw e;
    }));

type SiteTalep = { id: number; tur: string; turAd: string; ad: string; firma: string | null; eposta: string; telefon: string; il: string | null; mesaj: string; tarih: string };

/** GazeboTente sitesinden yeni talepleri çeker (imleç: kayıtlı en büyük site kimliği) */
export async function syncRequests(site: Site, request: (path: string) => Promise<Record<string, unknown>>) {
  if (site.tur !== "gazebotente") return 0;
  await ensureTable();
  const [last] = await db().select({ m: sql<number>`COALESCE(MAX(${talepler.disId}), 0)`.mapWith(Number) }).from(talepler).where(eq(talepler.siteId, site.id));
  let after = last?.m ?? 0;
  let count = 0;
  for (let page = 0; page < 20; page++) {
    const { talepler: rows } = (await request(`/api/panel/talepler/?limit=50&after=${after}`)) as { talepler: SiteTalep[] };
    if (rows.length) {
      await db()
        .insert(talepler)
        .values(
          rows.map((r) => ({
            siteId: site.id, markaId: site.markaId, disId: r.id, tur: r.tur.slice(0, 24), turAd: r.turAd.slice(0, 60), ad: r.ad.slice(0, 120), firma: r.firma?.slice(0, 191) || null,
            eposta: r.eposta.slice(0, 191), telefon: r.telefon.slice(0, 32), il: r.il?.slice(0, 64) || null, mesaj: r.mesaj, disTarih: new Date(r.tarih),
          })),
        )
        .onDuplicateKeyUpdate({ set: { disId: sql`dis_id` } });
      after = rows.at(-1)!.id;
      count += rows.length;
    }
    if (rows.length < 50) break;
  }
  return count;
}

/** Kullanıcının görebildiği markalar (yönetici: hepsi = null) */
async function visibleBrands(me: Me) {
  return isAdmin(me) ? null : (await brandsFor(me)).map((b) => b.id);
}

/** acik: yalnızca sonuçlanmamış talepler (yeni, arandı, teklif verildi) */
export async function listRequests(me: Me, acik: boolean) {
  await ensureTable();
  const brands = await visibleBrands(me);
  if (brands && !brands.length) return [];
  const conds = [brands ? inArray(talepler.markaId, brands) : undefined, acik ? inArray(talepler.durum, ["yeni", "arandi", "teklif"]) : undefined].filter(Boolean);
  return db()
    .select({ t: talepler, site: sites.ad, marka: schema.markalar.ad, markaRenk: schema.markalar.renk, ilgilenen: schema.kullanicilar.adSoyad })
    .from(talepler)
    .innerJoin(sites, eq(sites.id, talepler.siteId))
    .leftJoin(schema.markalar, eq(schema.markalar.id, talepler.markaId))
    .leftJoin(schema.kullanicilar, eq(schema.kullanicilar.id, talepler.ilgilenenId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(talepler.disTarih))
    .limit(300);
}

/** Menü sayacı: görülebilen yeni talepler (tablo henüz yoksa 0) */
export async function newRequestCount(me: Me) {
  try {
    await ensureTable();
    const brands = await visibleBrands(me);
    if (brands && !brands.length) return 0;
    const [r] = await db()
      .select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(talepler)
      .where(and(eq(talepler.durum, "yeni"), brands ? inArray(talepler.markaId, brands) : undefined));
    return r?.n ?? 0;
  } catch {
    return 0;
  }
}

/** Durum / not güncelleme; durumu değiştiren kişi ilgilenen olarak işaretlenir */
export async function updateRequest(me: Me, id: number, change: { durum?: string; not?: string }) {
  await ensureTable();
  const [t] = await db().select({ markaId: talepler.markaId }).from(talepler).where(eq(talepler.id, id));
  if (!t) return { ok: false as const, hata: "Talep bulunamadı." };
  const brands = await visibleBrands(me);
  if (brands && !brands.includes(t.markaId)) return { ok: false as const, hata: "Bu talebe erişiminiz yok." };
  const set: Partial<typeof talepler.$inferInsert> = {};
  const durum = schema.TALEP_DURUMLARI.find((d) => d === change.durum);
  if (durum) {
    set.durum = durum;
    set.ilgilenenId = me.id;
  }
  if (change.not !== undefined) set.not = change.not.trim().slice(0, 4000) || null;
  if (Object.keys(set).length) await db().update(talepler).set(set).where(eq(talepler.id, id));
  return { ok: true as const };
}
