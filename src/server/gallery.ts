import "server-only";
import { mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { isAdmin, randomToken, type Me } from "./auth";
import { db, schema } from "./db";
import { cleanPhone } from "./konfigurator";
import { notify, sellers } from "./push";
import { ensureRequestTable } from "./site-requests";

// Görsel galerisi: ekip panelden albüm açar ve fotoğraf yükler, müşteri skygorselmarket.com/galeri'de görür (WordPress
// eklentisi sky-galeri bu dosyadaki herkese açık JSON'u okur). Orijinaller saklanır; sitede filigranlı kopyalar gösterilir,
// istendikçe üretilip diskte tutulur. Filigran değişince sürüm artar, görsel adresleri değişir.

const { galeriAlbumleri: albums, galeriGorselleri: images, galeriAyarlari: settingsT } = schema;

/** Galeri talepleri ve WhatsApp numarası bu markanın */
const GALERI_MARKA = "sky";

const root = () => path.join(/* turbopackIgnore: true */ path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "yuklemeler")), "galeri");
const publicBase = () => (process.env.PUBLIC_URL ?? "").replace(/\/+$/, "");

/** Sitede gösterilen boyutlar: k küçük (ızgara, kapak), b büyük (tam ekran) */
export const SIZES = { k: 640, b: 1600 } as const;
export type SizeKey = keyof typeof SIZES;

let ready: Promise<unknown> | null = null;
const ensureSchema = () =>
  (ready ??= (async () => {
    await db().execute(
      sql.raw(`CREATE TABLE IF NOT EXISTS galeri_albumleri (
        id int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
        ust_id int unsigned NULL,
        ad varchar(120) NOT NULL,
        slug varchar(80) NOT NULL,
        aciklama text NULL,
        gizli tinyint(1) NOT NULL DEFAULT 0,
        kapak_id int unsigned NULL,
        cta_url varchar(255) NULL,
        cta_ad varchar(60) NULL,
        sira int NOT NULL DEFAULT 0,
        goruntulenme int unsigned NOT NULL DEFAULT 0,
        wa_tik int unsigned NOT NULL DEFAULT 0,
        olusturan_id int unsigned NULL,
        olusturma timestamp NOT NULL DEFAULT current_timestamp(),
        guncelleme timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
        KEY ga_ust (ust_id),
        CONSTRAINT galeri_albumleri_ust_id_galeri_albumleri_id_fk FOREIGN KEY (ust_id) REFERENCES galeri_albumleri (id),
        CONSTRAINT galeri_albumleri_olusturan_id_kullanicilar_id_fk FOREIGN KEY (olusturan_id) REFERENCES kullanicilar (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci`),
    );
    await db().execute(
      sql.raw(`CREATE TABLE IF NOT EXISTS galeri_gorselleri (
        id int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
        album_id int unsigned NOT NULL,
        dosya varchar(40) NOT NULL,
        en smallint unsigned NOT NULL,
        boy smallint unsigned NOT NULL,
        baslik varchar(160) NULL,
        sira int NOT NULL DEFAULT 0,
        yukleyen_id int unsigned NULL,
        olusturma timestamp NOT NULL DEFAULT current_timestamp(),
        KEY gg_album (album_id, sira),
        CONSTRAINT galeri_gorselleri_album_id_galeri_albumleri_id_fk FOREIGN KEY (album_id) REFERENCES galeri_albumleri (id) ON DELETE CASCADE,
        CONSTRAINT galeri_gorselleri_yukleyen_id_kullanicilar_id_fk FOREIGN KEY (yukleyen_id) REFERENCES kullanicilar (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci`),
    );
    await db().execute(
      sql.raw(`CREATE TABLE IF NOT EXISTS galeri_ayarlari (
        id int unsigned NOT NULL PRIMARY KEY,
        filigran varchar(40) NULL,
        opaklik smallint unsigned NOT NULL DEFAULT 35,
        boyut smallint unsigned NOT NULL DEFAULT 35,
        surum int unsigned NOT NULL DEFAULT 1,
        site_url varchar(160) NOT NULL DEFAULT 'https://skygorselmarket.com/galeri'
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci`),
    );
    await db().execute(sql.raw(`INSERT IGNORE INTO galeri_ayarlari (id) VALUES (1)`));
  })().catch((e) => {
    ready = null;
    throw e;
  }));

// ── Ayarlar ──

export type GallerySettings = { filigran: string | null; opaklik: number; boyut: number; surum: number; siteUrl: string };

export async function getSettings(): Promise<GallerySettings> {
  await ensureSchema();
  const [s] = await db().select().from(settingsT).where(eq(settingsT.id, 1));
  return { filigran: s?.filigran ?? null, opaklik: s?.opaklik ?? 35, boyut: s?.boyut ?? 35, surum: s?.surum ?? 1, siteUrl: (s?.siteUrl ?? "https://skygorselmarket.com/galeri").replace(/\/+$/, "") };
}

/** Ayar değişti: sürüm artar, eski sürümün filigranlı kopyaları silinir */
async function bumpVersion(patch: Partial<Omit<GallerySettings, "surum">>) {
  const old = await getSettings();
  await db().update(settingsT).set({ ...patch, surum: old.surum + 1 }).where(eq(settingsT.id, 1));
  wmCache = null;
  void rm(path.join(/* turbopackIgnore: true */ root(), "v", String(old.surum)), { recursive: true, force: true }).catch(() => {});
}

export async function updateSettings(me: Me, input: { opaklik: number; boyut: number; siteUrl: string; filigranKaldir?: boolean }) {
  if (!isAdmin(me)) throw new Error("Yalnızca yönetici değiştirebilir.");
  const opaklik = Math.max(5, Math.min(100, Math.round(input.opaklik)));
  const boyut = Math.max(10, Math.min(90, Math.round(input.boyut)));
  const siteUrl = input.siteUrl.trim().replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+(\/[a-z0-9._~/-]*)?$/i.test(siteUrl) || siteUrl.length > 160) throw new Error("Galeri adresi https:// ile başlamalı.");
  const old = await getSettings();
  if (input.filigranKaldir && old.filigran) await unlink(path.join(/* turbopackIgnore: true */ root(), "filigran", old.filigran)).catch(() => {});
  await bumpVersion({ opaklik, boyut, siteUrl, ...(input.filigranKaldir ? { filigran: null } : {}) });
}

/** Filigran görseli (saydam PNG önerilir): en çok 1600 px PNG olarak saklanır */
export async function saveWatermark(me: Me, data: Buffer) {
  if (!isAdmin(me)) throw new Error("Yalnızca yönetici değiştirebilir.");
  const sharp = (await import("sharp")).default;
  const png = await sharp(data)
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer()
    .catch(() => {
      throw new Error("Görsel okunamadı (PNG, JPG ya da WEBP olmalı).");
    });
  const dir = path.join(/* turbopackIgnore: true */ root(), "filigran");
  await mkdir(dir, { recursive: true });
  const name = `${newName()}.png`;
  await writeFile(path.join(/* turbopackIgnore: true */ dir, name), png);
  const old = await getSettings();
  if (old.filigran) await unlink(path.join(/* turbopackIgnore: true */ dir, old.filigran)).catch(() => {});
  await bumpVersion({ filigran: name });
}

// ── Görsel dosyaları ──

const newName = () => `${randomToken(12).toLowerCase().replace(/[^a-z0-9]/g, "")}${Date.now().toString(36)}`;
const NAME = /^[a-z0-9]{8,40}$/;

export const imageUrl = (surum: number, size: SizeKey, dosya: string) => `${publicBase()}/galeri-gorsel/${surum}/${size}/${dosya}.webp`;

let wmCache: { surum: number; png: Buffer; opaklik: number; boyut: number } | null = null;

/** Filigran PNG'si (opaklık uygulanmış); filigran yoksa null */
async function watermark(s: GallerySettings) {
  if (!s.filigran) return null;
  if (wmCache?.surum === s.surum) return wmCache;
  const sharp = (await import("sharp")).default;
  const raw = await readFile(path.join(/* turbopackIgnore: true */ root(), "filigran", s.filigran)).catch(() => null);
  if (!raw) return null;
  const png = await sharp(raw).ensureAlpha().linear([1, 1, 1, s.opaklik / 100], [0, 0, 0, 0]).png().toBuffer();
  wmCache = { surum: s.surum, png, opaklik: s.opaklik, boyut: s.boyut };
  return wmCache;
}

/**
 * Sitede gösterilen görsel: orijinal istenen boyuta küçültülür, filigran ortaya basılır, diskte saklanır.
 * Eski sürüm istenirse "eski" döner (adres güncel sürüme yönlendirilir).
 */
export async function renderImage(surum: number, size: string, dosya: string): Promise<Buffer | "eski" | null> {
  if (!(size in SIZES) || !NAME.test(dosya)) return null;
  const s = await getSettings();
  if (surum !== s.surum) return "eski";
  const cached = path.join(/* turbopackIgnore: true */ root(), "v", String(s.surum), size, `${dosya}.webp`);
  const hit = await readFile(cached).catch(() => null);
  if (hit) return hit;
  const orig = await readFile(path.join(/* turbopackIgnore: true */ root(), "o", `${dosya}.webp`)).catch(() => null);
  if (!orig) return null;
  const sharp = (await import("sharp")).default;
  const max = SIZES[size as SizeKey];
  const base = await sharp(orig).resize({ width: max, height: max, fit: "inside", withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
  let img = sharp(base.data);
  const wm = await watermark(s);
  if (wm) {
    const w = Math.max(40, Math.round((Math.min(base.info.width, base.info.height * 1.5) * wm.boyut) / 100));
    const mark = await sharp(wm.png).resize({ width: w, height: Math.round(base.info.height * 0.8), fit: "inside" }).toBuffer();
    img = img.composite([{ input: mark, gravity: "center" }]);
  }
  const out = await img.webp({ quality: size === "k" ? 76 : 82 }).toBuffer();
  await mkdir(path.dirname(cached), { recursive: true });
  await writeFile(cached, out).catch(() => {});
  return out;
}

async function removeFiles(dosya: string) {
  const s = await getSettings();
  await unlink(path.join(/* turbopackIgnore: true */ root(), "o", `${dosya}.webp`)).catch(() => {});
  for (const k of Object.keys(SIZES)) await unlink(path.join(/* turbopackIgnore: true */ root(), "v", String(s.surum), k, `${dosya}.webp`)).catch(() => {});
}

// ── Albümler ──

const TR: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", "×": "x" };
export function slugify(text: string) {
  return (
    text
      .replace(/[çğıİöşü×]/gi, (c) => TR[c] ?? TR[c.toLowerCase()] ?? c)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "album"
  );
}

type AlbumRow = typeof albums.$inferSelect;

async function allAlbums() {
  await ensureSchema();
  return db().select().from(albums).orderBy(asc(albums.sira), asc(albums.ad));
}

/** Albüm kimliğinden kök albüme kadar zincir (kökten başlayarak) */
function chain(list: AlbumRow[], id: number | null) {
  const byId = new Map(list.map((a) => [a.id, a]));
  const out: AlbumRow[] = [];
  for (let a = id ? byId.get(id) : undefined, n = 0; a && n < 20; a = a.ustId ? byId.get(a.ustId) : undefined, n++) out.unshift(a);
  return out;
}
const pathOf = (list: AlbumRow[], id: number) => chain(list, id).map((a) => a.slug).join("/");

/** Albüm başına fotoğraf sayısı ve ilk fotoğraf (kapak yoksa) */
async function imageStats() {
  const rows = await db()
    .select({ albumId: images.albumId, n: sql<number>`COUNT(*)`.mapWith(Number), ilk: sql<number>`MIN(${images.id})`.mapWith(Number) })
    .from(images)
    .groupBy(images.albumId);
  return { count: new Map(rows.map((r) => [r.albumId, r.n])), first: new Map(rows.map((r) => [r.albumId, r.ilk])) };
}

/** Albümün kapak fotoğrafı: seçilen kapak, yoksa ilk fotoğrafı, yoksa alt albümlerinden birinin kapağı */
function coverOf(list: AlbumRow[], stats: Awaited<ReturnType<typeof imageStats>>, id: number, hidden = true, depth = 0): number | null {
  const a = list.find((x) => x.id === id);
  if (!a || depth > 10) return null;
  if (a.kapakId) return a.kapakId;
  const own = stats.first.get(id);
  if (own) return own;
  for (const c of list.filter((x) => x.ustId === id && (hidden || !x.gizli))) {
    const k = coverOf(list, stats, c.id, hidden, depth + 1);
    if (k) return k;
  }
  return null;
}

/** Alt albümlerle birlikte toplam fotoğraf sayısı */
function totalOf(list: AlbumRow[], stats: Awaited<ReturnType<typeof imageStats>>, id: number, hidden = true, depth = 0): number {
  if (depth > 10) return 0;
  return (stats.count.get(id) ?? 0) + list.filter((x) => x.ustId === id && (hidden || !x.gizli)).reduce((t, c) => t + totalOf(list, stats, c.id, hidden, depth + 1), 0);
}

async function imagesById(ids: number[]) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map<number, typeof images.$inferSelect>();
  const rows = await db().select().from(images).where(inArray(images.id, uniq));
  return new Map(rows.map((r) => [r.id, r]));
}

export type AdminAlbum = {
  id: number; ad: string; slug: string; aciklama: string | null; gizli: boolean; ctaUrl: string | null; ctaAd: string | null; ustId: number | null;
  goruntulenme: number; waTik: number; olusturanId: number | null; link: string;
};
export type AdminChild = { id: number; ad: string; gizli: boolean; adet: number; kapak: string | null };
export type AdminImage = { id: number; k: string; b: string; en: number; boy: number; baslik: string | null; yukleyenId: number | null; kapak: boolean };

/** Panel: albüm (null ise kök) ve altındakiler */
export async function adminView(id: number | null) {
  const list = await allAlbums();
  const s = await getSettings();
  const album = id ? list.find((a) => a.id === id) : null;
  if (id && !album) return null;
  const stats = await imageStats();
  const kids = list.filter((a) => (a.ustId ?? null) === (id ?? null));
  const covers = new Map(kids.map((c) => [c.id, coverOf(list, stats, c.id)]));
  const coverImgs = await imagesById([...covers.values()].filter((x): x is number => !!x));
  const own = id ? await db().select().from(images).where(eq(images.albumId, id)).orderBy(asc(images.sira), asc(images.id)) : [];
  const effectiveCover = album ? coverOf(list, stats, album.id) : null;
  return {
    album: album
      ? ({
          id: album.id, ad: album.ad, slug: album.slug, aciklama: album.aciklama, gizli: album.gizli, ctaUrl: album.ctaUrl, ctaAd: album.ctaAd, ustId: album.ustId,
          goruntulenme: album.goruntulenme, waTik: album.waTik, olusturanId: album.olusturanId, link: `${s.siteUrl}/${pathOf(list, album.id)}/`,
        } satisfies AdminAlbum)
      : null,
    yol: chain(list, id).map((a) => ({ id: a.id, ad: a.ad })),
    alt: kids.map((c) => {
      const k = coverImgs.get(covers.get(c.id) ?? 0);
      return { id: c.id, ad: c.ad, gizli: c.gizli, adet: totalOf(list, stats, c.id), kapak: k ? imageUrl(s.surum, "k", k.dosya) : null } satisfies AdminChild;
    }),
    gorseller: own.map((g) => ({ id: g.id, k: imageUrl(s.surum, "k", g.dosya), b: imageUrl(s.surum, "b", g.dosya), en: g.en, boy: g.boy, baslik: g.baslik, yukleyenId: g.yukleyenId, kapak: g.id === effectiveCover && !!album?.kapakId }) satisfies AdminImage),
    kokLink: s.siteUrl + "/",
  };
}

/** Albüm seçimi (taşıma) için tüm albümler, yol adıyla */
export async function albumOptions() {
  const list = await allAlbums();
  return list.map((a) => ({ id: a.id, ad: chain(list, a.id).map((x) => x.ad).join(" › ") })).sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
}

const canEditAlbum = (me: Me, a: Pick<AlbumRow, "olusturanId">) => isAdmin(me) || a.olusturanId === me.id;

function cleanAlbumInput(input: { ad: string; aciklama?: string | null; ctaUrl?: string | null; ctaAd?: string | null }) {
  const ad = input.ad.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!ad) throw new Error("Albüm adı gerekli.");
  const ctaUrl = (input.ctaUrl ?? "").trim() || null;
  if (ctaUrl && (!/^https:\/\/\S+$/i.test(ctaUrl) || ctaUrl.length > 255)) throw new Error("Bağlantı https:// ile başlamalı.");
  return { ad, aciklama: (input.aciklama ?? "").trim().slice(0, 2000) || null, ctaUrl, ctaAd: ctaUrl ? (input.ctaAd ?? "").trim().slice(0, 60) || null : null };
}

async function uniqueSlug(ustId: number | null, base: string, exceptId?: number) {
  const sibs = await db()
    .select({ id: albums.id, slug: albums.slug })
    .from(albums)
    .where(ustId ? eq(albums.ustId, ustId) : isNull(albums.ustId));
  const taken = new Set(sibs.filter((x) => x.id !== exceptId).map((x) => x.slug));
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base.slice(0, 70)}-${i}`;
  return slug;
}

export async function createAlbum(me: Me, input: { ustId: number | null; ad: string; aciklama?: string | null; gizli?: boolean; ctaUrl?: string | null; ctaAd?: string | null }) {
  await ensureSchema();
  const v = cleanAlbumInput(input);
  if (input.ustId) {
    const [p] = await db().select({ id: albums.id }).from(albums).where(eq(albums.id, input.ustId));
    if (!p) throw new Error("Üst albüm bulunamadı.");
  }
  const slug = await uniqueSlug(input.ustId, slugify(v.ad));
  const [r] = await db().insert(albums).values({ ...v, ustId: input.ustId, slug, gizli: !!input.gizli, olusturanId: me.id }).$returningId();
  return r.id;
}

export async function updateAlbum(me: Me, id: number, input: { ad: string; slug?: string; aciklama?: string | null; gizli?: boolean; ctaUrl?: string | null; ctaAd?: string | null }) {
  await ensureSchema();
  const [a] = await db().select().from(albums).where(eq(albums.id, id));
  if (!a) throw new Error("Albüm bulunamadı.");
  const v = cleanAlbumInput(input);
  // Adres (slug) yalnızca açıkça değiştirilirse değişir: gönderilmiş linkler bozulmasın
  const wanted = input.slug !== undefined ? slugify(input.slug) : a.slug;
  if (wanted !== a.slug && !canEditAlbum(me, a)) throw new Error("Adresi yalnızca albümü açan ya da yönetici değiştirebilir.");
  const slug = wanted === a.slug ? a.slug : await uniqueSlug(a.ustId, wanted, a.id);
  await db().update(albums).set({ ...v, slug, gizli: !!input.gizli }).where(eq(albums.id, id));
}

/** Albüm silinir: alt albümü olmamalı; fotoğrafları varsa yalnızca albümü açan ya da yönetici silebilir (fotoğraflar da silinir) */
export async function deleteAlbum(me: Me, id: number) {
  await ensureSchema();
  const [a] = await db().select().from(albums).where(eq(albums.id, id));
  if (!a) return null;
  const [kid] = await db().select({ id: albums.id }).from(albums).where(eq(albums.ustId, id)).limit(1);
  if (kid) throw new Error("Önce alt albümleri silin ya da taşıyın.");
  const own = await db().select({ dosya: images.dosya }).from(images).where(eq(images.albumId, id));
  if (own.length && !canEditAlbum(me, a)) throw new Error("Fotoğraflı albümü yalnızca açan kişi ya da yönetici silebilir.");
  await db().delete(albums).where(eq(albums.id, id));
  for (const g of own) await removeFiles(g.dosya);
  return a.ustId;
}

/** Albümü başka bir albümün altına (ya da en üste) taşır; kendi altına taşınamaz */
export async function moveAlbum(me: Me, id: number, ustId: number | null) {
  const list = await allAlbums();
  const a = list.find((x) => x.id === id);
  if (!a) throw new Error("Albüm bulunamadı.");
  if (!canEditAlbum(me, a)) throw new Error("Albümü yalnızca açan kişi ya da yönetici taşıyabilir.");
  if (ustId && chain(list, ustId).some((x) => x.id === id)) throw new Error("Albüm kendi altına taşınamaz.");
  const slug = await uniqueSlug(ustId, a.slug, a.id);
  await db().update(albums).set({ ustId, slug }).where(eq(albums.id, id));
}

// ── Fotoğraflar ──

export const GALLERY_FILE_MAX = 25_000_000;

/** Fotoğraf yükler: döndürme düzeltilir, en çok 2400 px webp'ye küçültülür; konum gibi üst veriler atılır */
export async function addImages(me: Me, albumId: number, files: { name: string; data: Buffer }[]) {
  await ensureSchema();
  const [a] = await db().select({ id: albums.id }).from(albums).where(eq(albums.id, albumId));
  if (!a) throw new Error("Albüm bulunamadı.");
  const sharp = (await import("sharp")).default;
  const dir = path.join(/* turbopackIgnore: true */ root(), "o");
  await mkdir(dir, { recursive: true });
  const [last] = await db().select({ m: sql<number>`COALESCE(MAX(${images.sira}), 0)`.mapWith(Number) }).from(images).where(eq(images.albumId, albumId));
  let sira = last?.m ?? 0;
  let n = 0;
  for (const f of files) {
    const out = await sharp(f.data, { failOn: "none" })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer({ resolveWithObject: true })
      .catch(() => {
        throw new Error(`“${f.name}” okunamadı (fotoğraf olmalı).`);
      });
    const dosya = newName();
    await writeFile(path.join(/* turbopackIgnore: true */ dir, `${dosya}.webp`), out.data);
    await db().insert(images).values({ albumId, dosya, en: out.info.width, boy: out.info.height, sira: ++sira, yukleyenId: me.id });
    n++;
  }
  await db().update(albums).set({ guncelleme: new Date() }).where(eq(albums.id, albumId));
  return n;
}

async function imageWithAlbum(id: number) {
  await ensureSchema();
  const [r] = await db().select({ g: images, a: albums }).from(images).innerJoin(albums, eq(albums.id, images.albumId)).where(eq(images.id, id));
  return r ?? null;
}

const canEditImage = (me: Me, r: { g: { yukleyenId: number | null }; a: Pick<AlbumRow, "olusturanId"> }) => isAdmin(me) || r.g.yukleyenId === me.id || r.a.olusturanId === me.id;

export async function deleteImage(me: Me, id: number) {
  const r = await imageWithAlbum(id);
  if (!r) return null;
  if (!canEditImage(me, r)) throw new Error("Fotoğrafı yalnızca yükleyen, albümü açan ya da yönetici silebilir.");
  await db().delete(images).where(eq(images.id, id));
  if (r.a.kapakId === id) await db().update(albums).set({ kapakId: null }).where(eq(albums.id, r.a.id));
  await removeFiles(r.g.dosya);
  return r.a.id;
}

export async function setCover(id: number) {
  const r = await imageWithAlbum(id);
  if (!r) return null;
  await db().update(albums).set({ kapakId: r.a.kapakId === id ? null : id }).where(eq(albums.id, r.a.id));
  return r.a.id;
}

/** Fotoğrafı albümün başına alır */
export async function moveToFront(id: number) {
  const r = await imageWithAlbum(id);
  if (!r) return null;
  const [min] = await db().select({ m: sql<number>`COALESCE(MIN(${images.sira}), 0)`.mapWith(Number) }).from(images).where(eq(images.albumId, r.a.id));
  await db().update(images).set({ sira: (min?.m ?? 0) - 1 }).where(eq(images.id, id));
  return r.a.id;
}

/** Fotoğraf açıklaması: sitede alt metin ve büyük görünümde alt yazı */
export async function setCaption(id: number, baslik: string) {
  const r = await imageWithAlbum(id);
  if (!r) return null;
  await db().update(images).set({ baslik: baslik.trim().slice(0, 160) || null }).where(eq(images.id, id));
  return r.a.id;
}

/** Fotoğrafı başka albüme taşır */
export async function moveImage(me: Me, id: number, albumId: number) {
  const r = await imageWithAlbum(id);
  if (!r) return null;
  if (!canEditImage(me, r)) throw new Error("Fotoğrafı yalnızca yükleyen, albümü açan ya da yönetici taşıyabilir.");
  const [t] = await db().select({ id: albums.id }).from(albums).where(eq(albums.id, albumId));
  if (!t) throw new Error("Albüm bulunamadı.");
  const [last] = await db().select({ m: sql<number>`COALESCE(MAX(${images.sira}), 0)`.mapWith(Number) }).from(images).where(eq(images.albumId, albumId));
  await db().update(images).set({ albumId, sira: (last?.m ?? 0) + 1 }).where(eq(images.id, id));
  if (r.a.kapakId === id) await db().update(albums).set({ kapakId: null }).where(eq(albums.id, r.a.id));
  return r.a.id;
}

// ── Site (herkese açık) ──

/** WhatsApp numarası: markanın telefonu, uluslararası biçimde (905xxxxxxxxx) */
async function brandContact() {
  const [b] = await db().select({ id: schema.markalar.id, ad: schema.markalar.ad, telefon: schema.markalar.telefon }).from(schema.markalar).where(eq(schema.markalar.kod, GALERI_MARKA));
  const d = (b?.telefon ?? "").replace(/\D/g, "").replace(/^0/, "");
  return { id: b?.id ?? null, ad: b?.ad ?? "", whatsapp: d.length === 10 ? `90${d}` : d.length === 12 && d.startsWith("90") ? d : null };
}

type PublicCard = { ad: string; yol: string; aciklama: string | null; adet: number; kapak: { k: string; en: number; boy: number } | null };

/**
 * Sitenin galeri sayfası için albüm (yol boşsa kök): üst yol, alt albümler (gizliler hariç), fotoğraflar.
 * Gizli albüm linkle açılır ama arama motorlarına kapalıdır (gizli: true); gizli albümün altı da gizlidir.
 */
export async function publicAlbum(yol: string) {
  const list = await allAlbums();
  const s = await getSettings();
  const slugs = yol.split("/").filter(Boolean);
  let cur: AlbumRow | null = null;
  for (const slug of slugs) {
    const next = list.find((a) => (a.ustId ?? null) === (cur?.id ?? null) && a.slug === slug);
    if (!next) return null;
    cur = next;
  }
  const trail = cur ? chain(list, cur.id) : [];
  const stats = await imageStats();
  const kids = list.filter((a) => (a.ustId ?? null) === (cur?.id ?? null) && !a.gizli);
  const covers = new Map(kids.map((c) => [c.id, coverOf(list, stats, c.id, false)]));
  const own = cur ? await db().select().from(images).where(eq(images.albumId, cur.id)).orderBy(asc(images.sira), asc(images.id)) : [];
  const coverImgs = await imagesById([...covers.values()].filter((x): x is number => !!x));
  const contact = await brandContact();
  const base = trail.map((a) => a.slug).join("/");
  const card = (c: AlbumRow): PublicCard => {
    const k = coverImgs.get(covers.get(c.id) ?? 0);
    return { ad: c.ad, yol: base ? `${base}/${c.slug}` : c.slug, aciklama: c.aciklama, adet: totalOf(list, stats, c.id, false), kapak: k ? { k: imageUrl(s.surum, "k", k.dosya), en: k.en, boy: k.boy } : null };
  };
  return {
    album: cur
      ? { ad: cur.ad, yol: base, aciklama: cur.aciklama, gizli: trail.some((a) => a.gizli), guncelleme: cur.guncelleme.toISOString(), cta: cur.ctaUrl ? { url: cur.ctaUrl, ad: cur.ctaAd || "Ürünü incele" } : null }
      : null,
    ust: trail.slice(0, -1).map((a, i) => ({ ad: a.ad, yol: trail.slice(0, i + 1).map((x) => x.slug).join("/") })),
    alt: kids.map(card),
    gorseller: own.map((g) => ({ k: imageUrl(s.surum, "k", g.dosya), b: imageUrl(s.surum, "b", g.dosya), en: g.en, boy: g.boy, alt: g.baslik })),
    marka: { ad: contact.ad, whatsapp: contact.whatsapp },
    siteUrl: s.siteUrl,
  };
}

/** Site haritası: gizli olmayan ve içinde fotoğraf olan albümler */
export async function publicMap() {
  const list = await allAlbums();
  const stats = await imageStats();
  const hidden = (id: number) => chain(list, id).some((a) => a.gizli);
  return list
    .filter((a) => !hidden(a.id) && totalOf(list, stats, a.id, false) > 0)
    .map((a) => ({ yol: pathOf(list, a.id), guncelleme: a.guncelleme.toISOString() }));
}

async function albumByPath(yol: string) {
  const list = await allAlbums();
  let cur: AlbumRow | null = null;
  for (const slug of yol.split("/").filter(Boolean)) {
    cur = list.find((a) => (a.ustId ?? null) === (cur?.id ?? null) && a.slug === slug) ?? null;
    if (!cur) return null;
  }
  return cur ? { album: cur, ad: chain(list, cur.id).map((a) => a.ad).join(" › ") } : null;
}

/** Sitedeki sayaçlar: albüm görüntülenmesi ve WhatsApp düğmesine tıklama */
export async function countEvent(yol: string, tur: string) {
  const r = await albumByPath(yol);
  if (!r) return;
  // Sayaç albümün güncellenme zamanını değiştirmez (site haritasındaki tarih fotoğraflara göredir)
  const keep = sql`${albums.guncelleme}`;
  if (tur === "whatsapp") await db().update(albums).set({ waTik: sql`${albums.waTik} + 1`, guncelleme: keep }).where(eq(albums.id, r.album.id));
  else if (tur === "goruntu") await db().update(albums).set({ goruntulenme: sql`${albums.goruntulenme} + 1`, guncelleme: keep }).where(eq(albums.id, r.album.id));
}

const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 600_000);
  list.push(now);
  if (hits.size > 5000) hits.clear();
  hits.set(ip, list);
  return list.length > 5;
}

/** Galeriden fiyat talebi: panelde Talepler'e düşer (tür "galeri"), satış ekibine bildirim gider */
export async function saveGalleryLead(input: { yol: unknown; ad: unknown; telefon: unknown; mesaj: unknown; ip: string }) {
  const telefon = cleanPhone(input.telefon);
  if (!telefon) throw new Error("Telefon numarasını kontrol edin (ör. 0532 123 45 67).");
  if (limited(input.ip)) throw new Error("Çok fazla deneme yapıldı, biraz sonra tekrar deneyin.");
  const r = await albumByPath(String(input.yol ?? ""));
  const s = await getSettings();
  const contact = await brandContact();
  if (!contact.id) throw new Error("Talep şu an alınamıyor.");
  const sites = schema.siteBaglantilari;
  const [site] = await db()
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.markaId, contact.id), eq(sites.tur, "woocommerce")))
    .orderBy(sql`${sites.aktif} DESC`, sites.id)
    .limit(1);
  if (!site) throw new Error("Talep şu an alınamıyor.");
  const ad = String(input.ad ?? "").trim().slice(0, 120) || "Galeri ziyaretçisi";
  const not = String(input.mesaj ?? "").trim().slice(0, 1000);
  const album = r?.ad ?? "Galeri";
  const mesaj = [`Galeri: ${album}`, `${s.siteUrl}/${r ? String(input.yol).split("/").filter(Boolean).join("/") + "/" : ""}`, ...(not ? ["", not] : [])].join("\n");
  const t = schema.siteTalepleri;
  await ensureRequestTable();
  for (let i = 0; ; i++) {
    const [last] = await db().select({ m: sql<number>`COALESCE(MAX(${t.disId}), 0)`.mapWith(Number) }).from(t).where(eq(t.siteId, site.id));
    try {
      await db().insert(t).values({ siteId: site.id, markaId: contact.id, disId: (last?.m ?? 0) + 1, tur: "galeri", turAd: `Galeri: ${album}`.slice(0, 60), ad, eposta: "", telefon, mesaj, disTarih: new Date() });
      void notify("talep", sellers(contact.id), { title: "Galeriden fiyat talebi", body: `${ad} · ${telefon} · ${album}`, url: "/panel/talepler" });
      return;
    } catch (e) {
      // Aynı anda gelen iki kayıt aynı kimliği almışsa yeniden dene
      if (i >= 2 || !/dup/i.test(String((e as { cause?: unknown }).cause ?? e))) throw e;
    }
  }
}
