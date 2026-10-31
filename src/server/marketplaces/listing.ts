import "server-only";
import { and, asc, desc, eq, inArray, like, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { ensureMarketplaceSchema } from "../db/ensure";
import {
  tyBatch, tyBrands, tyCategories, tyCategoryAttributes, tyPriceStock, tyProductState, tySendProducts,
  type CategoryAttribute, type TyItem,
} from "./trendyol";
import { wcCurrent, wcProduct, wcSearch, wcSetPrices, wcVariations } from "./woocommerce";

// Satış ürünleri çekirdeği. Ürün kartı (pazaryeri_urunleri) tüm kanallarda ortaktır: stok kodu, barkod, görseller,
// paket ölçüleri/desi, KDV, fiyat, maliyet, stok; isterse bir teklif ürününe bağlanır ve fiyatını oradan alır.
// Her kanal (bağlantı) için ayrı listeleme tutulur:
//  - Pazaryeri (Trendyol…): kategori, özellikler, marka, kanala özel fiyat ve gönderim durumu. Akış: taslak → gönderildi
//    (toplu işlem) → onay (kart oluştu, pazaryeri inceliyor) → yayında; ya da hata. Fiyat/stok oluşmuş kartlar için ve
//    değiştiğinde gönderilir.
//  - WooCommerce: sitedeki ürün/varyanta bağlantı. Sitedeki ad ve fiyat okunur; fiyat yalnızca kanal ayarında "fiyatı
//    siteye yaz" açıksa ve değiştiğinde yazılır. Ürün sitede oluşturulmaz, başlık/görsel/açıklama değişmez.

const { pazaryeriUrunleri: items, pazaryeriListelemeleri: listings, pazaryeriKategorileri: categories, pazaryeriIslemleri: logs, pazaryeriAyarlari: settingsT, siteBaglantilari: sites, urunler } = schema;
type Site = typeof sites.$inferSelect;
type Item = typeof items.$inferSelect;
type Listing = typeof listings.$inferSelect;

export const MARKETPLACE_TURLERI = ["trendyol"] as const;
/** Ürün kanalları: e-ticaret sitesi (WooCommerce) ve pazaryerleri */
export const KANAL_TURLERI = ["woocommerce", ...MARKETPLACE_TURLERI] as const;
const isMarketplace = (s: Pick<Site, "tur">) => (MARKETPLACE_TURLERI as readonly string[]).includes(s.tur);

/* ───────────── kanal ayarları ───────────── */

export type ChannelSettings = {
  /** Kanal fiyat farkı (%): komisyon ve kargo payı; KDV dahil perakendeye eklenir */
  fiyatFarki: number;
  /** WooCommerce: değişen fiyat siteye yazılır (kapalıyken yalnızca okunur) */
  fiyatYaz: boolean;
  /** Trendyol kargo firması kimliği (anlaşmalı kargo); boşsa gönderilmez */
  kargoFirmaId: number | null;
  /** Varsayılan marka (yeni listelemelerde önerilir) */
  markaId: number | null;
  markaAd: string | null;
};
const DEFAULT_SETTINGS: ChannelSettings = { fiyatFarki: 0, fiyatYaz: false, kargoFirmaId: null, markaId: null, markaAd: null };

/** Ürün kanalları: önce WooCommerce siteleri, sonra pazaryerleri */
export async function salesChannels() {
  await ensureMarketplaceSchema();
  const rows = await db()
    .select({ id: sites.id, ad: sites.ad, tur: sites.tur, aktif: sites.aktif, markaId: sites.markaId, ayar: settingsT.veri })
    .from(sites)
    .leftJoin(settingsT, eq(settingsT.siteId, sites.id))
    .where(inArray(sites.tur, [...KANAL_TURLERI]))
    .orderBy(sql`${sites.tur} = 'woocommerce' DESC`, asc(sites.id));
  return rows.map((r) => ({
    id: r.id, ad: r.ad, tur: r.tur, aktif: r.aktif, pazaryeri: isMarketplace(r),
    ayarlar: { ...DEFAULT_SETTINGS, ...(r.ayar ? (JSON.parse(r.ayar) as Partial<ChannelSettings>) : {}) },
  }));
}
export type SalesChannel = Awaited<ReturnType<typeof salesChannels>>[number];

async function settingsOf(siteId: number): Promise<ChannelSettings> {
  const [r] = await db().select({ veri: settingsT.veri }).from(settingsT).where(eq(settingsT.siteId, siteId));
  return { ...DEFAULT_SETTINGS, ...(r ? (JSON.parse(r.veri) as Partial<ChannelSettings>) : {}) };
}

export async function saveSettings(siteId: number, s: ChannelSettings) {
  await ensureMarketplaceSchema();
  const v: ChannelSettings = {
    fiyatFarki: Math.max(-50, Math.min(200, Number(s.fiyatFarki) || 0)),
    fiyatYaz: !!s.fiyatYaz,
    kargoFirmaId: s.kargoFirmaId && Number(s.kargoFirmaId) > 0 ? Math.round(Number(s.kargoFirmaId)) : null,
    markaId: s.markaId ? Number(s.markaId) : null,
    markaAd: s.markaAd?.trim().slice(0, 120) || null,
  };
  const veri = JSON.stringify(v);
  await db().insert(settingsT).values({ siteId, veri }).onDuplicateKeyUpdate({ set: { veri } });
  // Fiyat farkı değişince yayındaki fiyatlar bir sonraki eşitlemede yeniden gönderilir (imza değişir)
}

async function siteOf(siteId: number) {
  const [s] = await db().select().from(sites).where(eq(sites.id, siteId));
  if (!s || !isMarketplace(s)) throw new Error("Pazaryeri bağlantısı bulunamadı.");
  return s;
}

async function wooSiteOf(siteId: number) {
  const [s] = await db().select().from(sites).where(eq(sites.id, siteId));
  if (s?.tur !== "woocommerce") throw new Error("WooCommerce bağlantısı bulunamadı.");
  return s;
}

/* ───────────── barkod ───────────── */

/** EAN-13 kontrol hanesi */
function ean13(base12: string) {
  const sum = [...base12].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return base12 + ((10 - (sum % 10)) % 10);
}

/**
 * Firma içi barkod: EAN-13, "29" ile başlar (GS1'in kapalı devre aralığı; ülke/firma önekiyle çakışmaz) + 10 haneli sıra.
 * Pazaryerleri benzersiz olması koşuluyla kabul eder.
 */
export async function nextBarcode() {
  await ensureMarketplaceSchema();
  const [r] = await db()
    .select({ m: sql<string | null>`MAX(${items.barkod})` })
    .from(items)
    .where(and(like(items.barkod, "29%"), sql`CHAR_LENGTH(${items.barkod}) = 13`));
  let seq = r?.m ? Number(r.m.slice(2, 12)) + 1 : 1;
  for (;;) {
    const code = ean13(`29${String(seq).padStart(10, "0")}`);
    const [ex] = await db().select({ id: items.id }).from(items).where(eq(items.barkod, code));
    if (!ex) return code;
    seq++;
  }
}

export const barcodeValid = (b: string) => /^\d{13}$/.test(b) ? ean13(b.slice(0, 12)) === b : /^[A-Za-z0-9-]{4,40}$/.test(b);

/* ───────────── fiyat ───────────── */

/** Bağlı teklif ürününün perakendesi (KDV hariç); ek seçenek dahilse seçenek fiyatı eklenir */
export const catalogPrice = (perakende: number | null, secenek: number | null, dahil: boolean) => (perakende === null ? null : perakende + (dahil ? (secenek ?? 0) : 0));

/** KDV hariç taban fiyat: kartın fiyatı, yoksa bağlı teklif ürününün fiyatı */
const basePrice = (item: Pick<Item, "fiyat">, catalog: number | null) => item.fiyat ?? catalog ?? null;

/** Kargo desisi: en × boy × yükseklik (cm) / 3000, bir ondalık */
export const desiOf = (en: number | null, boy: number | null, yukseklik: number | null) => (en && boy && yukseklik ? Math.round((en * boy * yukseklik) / 300) / 10 : null);

/** Kanaldaki satış fiyatı (KDV dahil, tam TL): kanala özel fiyat ya da taban × KDV × (1 + fark); fark ürüne özelse o, yoksa kanalınki */
export function channelPrice(item: Pick<Item, "fiyat" | "kdv">, catalog: number | null, listing: Pick<Listing, "fiyat" | "fiyatFarki"> | null, s: ChannelSettings) {
  if (listing?.fiyat) return Math.round(listing.fiyat);
  const base = basePrice(item, catalog);
  if (base === null) return null;
  return Math.round(base * (1 + item.kdv / 100) * (1 + (listing?.fiyatFarki ?? s.fiyatFarki) / 100));
}

/**
 * Bağlanırken sitedeki fiyatı veren ürüne özel fark (%): taban × KDV × (1 + fark) yuvarlanınca tam sitedeki fiyat.
 * Kanalın farkıyla zaten tutuyorsa null (kanalınki geçerli kalır).
 */
const farkFor = (base: number | null, kdv: number, site: number | null, kanal: number) => {
  if (!base || !site) return null;
  const g = base * (1 + kdv / 100);
  if (Math.round(g * (1 + kanal / 100)) === Math.round(site)) return null;
  const f0 = Math.round((site / g - 1) * 10000) / 100;
  for (const d of [0, 0.01, -0.01, 0.02, -0.02, 0.03, -0.03, 0.04, -0.04, 0.05, -0.05]) {
    const f = Math.round((f0 + d) * 100) / 100;
    if (Math.round(g * (1 + f / 100)) === Math.round(site)) return Math.max(-50, Math.min(200, f));
  }
  return Math.max(-50, Math.min(200, f0));
};

const farkOf = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Math.max(-50, Math.min(200, Number(v))));

/* ───────────── kartlar ───────────── */

export type ListingInput = {
  siteId: number;
  aktif: boolean;
  kategoriId: number | null;
  kategoriYol: string | null;
  markaId: number | null;
  markaAd: string | null;
  ozellikler: Record<string, { v?: number; c?: string }>;
  fiyat: number | null;
  /** Ürüne özel fiyat farkı (%); boşsa kanalınki */
  fiyatFarki?: number | null;
  /** WooCommerce: bağlı ürün ve varyant, sitedeki ad ve fiyat (seçilirken okunur) */
  disUrunId?: number | null;
  disVaryantId?: number | null;
  disAd?: string | null;
  disFiyat?: number | null;
};

export type ItemInput = {
  id: number | null;
  stokKodu: string;
  barkod: string;
  ad: string;
  aciklama: string;
  grupKodu: string;
  markaAdi: string;
  urunId: number | null;
  renk: string;
  olcu: string;
  gorseller: string[];
  desi: number | null;
  agirlik: number | null;
  en: number | null;
  boy: number | null;
  yukseklik: number | null;
  kdv: number;
  fiyat: number | null;
  secenekDahil: boolean;
  maliyet: number | null;
  stok: number;
  hazirlikGun: number;
  aktif: boolean;
  listelemeler: ListingInput[];
  /** Ad, açıklama, marka, KDV ve hazırlık süresi aynı grup kodlu diğer seçeneklere de yazılır */
  grubaUygula?: boolean;
};

export async function listItems() {
  await ensureMarketplaceSchema();
  const [rows, ls] = await Promise.all([
    db()
      .select({ i: items, katalogAd: urunler.ad, perakende: urunler.perakende, secenek: urunler.secenekPerakende, katalogMaliyet: urunler.maliyet, secenekMaliyet: urunler.secenekMaliyet })
      .from(items)
      .leftJoin(urunler, eq(urunler.id, items.urunId))
      .orderBy(asc(items.grupKodu), asc(items.id)),
    db().select().from(listings),
  ]);
  return rows.map((r) => ({
    ...r.i,
    gorseller: r.i.gorseller ? (JSON.parse(r.i.gorseller) as string[]) : [],
    katalogAd: r.katalogAd,
    katalogFiyat: catalogPrice(r.perakende, r.secenek, r.i.secenekDahil),
    katalogMaliyet: r.katalogMaliyet === null ? null : r.katalogMaliyet + (r.i.secenekDahil ? (r.secenekMaliyet ?? 0) : 0),
    listelemeler: ls.filter((l) => l.urunId === r.i.id).map((l) => ({ ...l, ozellikler: l.ozellikler ? (JSON.parse(l.ozellikler) as ListingInput["ozellikler"]) : {} })),
  }));
}
export type MarketplaceItem = Awaited<ReturnType<typeof listItems>>[number];

const clip = (v: string | null | undefined, max: number) => (v?.trim() ? v.trim().slice(0, max) : null);
const num = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

/** Kaydedilen içeriğin özeti: değiştiyse oluşmuş kart yeniden gönderilmek üzere taslağa döner */
const contentSig = (i: Partial<Item>, l: Partial<Listing>) =>
  JSON.stringify([i.ad, i.aciklama, i.grupKodu, i.gorseller, i.desi, i.kdv, i.stokKodu, i.renk, i.olcu, l.kategoriId, l.markaId, l.ozellikler]);

export async function saveItem(input: ItemInput): Promise<{ ok: true; id: number } | { ok: false; hata: string }> {
  await ensureMarketplaceSchema();
  const ad = clip(input.ad, 150);
  const stokKodu = clip(input.stokKodu, 60);
  const barkod = clip(input.barkod, 40);
  if (!ad) return { ok: false, hata: "Ürün adı gerekli." };
  if (!stokKodu || !/^[A-Za-z0-9._-]+$/.test(stokKodu)) return { ok: false, hata: "Stok kodu gerekli (harf, rakam, nokta, tire)." };
  if (!barkod || !barcodeValid(barkod)) return { ok: false, hata: "Barkod geçersiz (13 haneli EAN ya da harf/rakam)." };
  const gorseller = input.gorseller.map((g) => g.trim()).filter((g) => /^(https:\/\/\S+|\/(dosya|terminal)\/\S+)$/.test(g)).slice(0, 8);
  const values = {
    stokKodu, barkod, ad, aciklama: clip(input.aciklama, 30000), grupKodu: clip(input.grupKodu, 60) ?? stokKodu, markaAdi: clip(input.markaAdi, 80),
    urunId: input.urunId || null, renk: clip(input.renk, 40), olcu: clip(input.olcu, 60), gorseller: JSON.stringify(gorseller),
    desi: desiOf(num(input.en), num(input.boy), num(input.yukseklik)) ?? num(input.desi),
    agirlik: num(input.agirlik), en: num(input.en), boy: num(input.boy), yukseklik: num(input.yukseklik),
    secenekDahil: !!input.urunId && !!input.secenekDahil, maliyet: num(input.maliyet), kdv: [0, 1, 10, 20].includes(Number(input.kdv)) ? Number(input.kdv) : 20, fiyat: num(input.fiyat),
    stok: Math.max(0, Math.round(Number(input.stok) || 0)), hazirlikGun: Math.max(1, Math.min(30, Math.round(Number(input.hazirlikGun) || 3))), aktif: !!input.aktif,
  };
  const dup = await db()
    .select({ id: items.id, stokKodu: items.stokKodu })
    .from(items)
    .where(sql`(${items.stokKodu} = ${stokKodu} OR ${items.barkod} = ${barkod}) AND ${items.id} <> ${input.id ?? 0}`);
  if (dup.length) return { ok: false, hata: dup.some((d) => d.stokKodu === stokKodu) ? "Bu stok kodu başka bir üründe var." : "Bu barkod başka bir üründe var." };

  let id = input.id;
  const [old] = id ? await db().select().from(items).where(eq(items.id, id)) : [];
  if (id && !old) return { ok: false, hata: "Ürün bulunamadı." };
  // Oluşmuş kartın barkodu değiştirilemez (pazaryeri kartı barkodla bağlıdır)
  const oldListings = id ? await db().select().from(listings).where(eq(listings.urunId, id)) : [];
  if (old && old.barkod !== barkod && oldListings.some((l) => l.olustu)) return { ok: false, hata: "Pazaryerinde oluşmuş ürünün barkodu değiştirilemez." };
  const channels = new Map((await salesChannels()).map((c) => [c.id, c]));
  // Aynı site ürününe/varyantına iki kart bağlanamaz
  for (const l of input.listelemeler) {
    if (channels.get(l.siteId)?.tur !== "woocommerce" || !l.aktif || !l.disUrunId) continue;
    const [taken] = await db()
      .select({ ad: items.ad })
      .from(listings)
      .innerJoin(items, eq(items.id, listings.urunId))
      .where(sql`${listings.siteId} = ${l.siteId} AND ${listings.disUrunId} = ${l.disUrunId} AND COALESCE(${listings.disVaryantId}, 0) = ${l.disVaryantId ?? 0} AND ${listings.urunId} <> ${id ?? 0}`);
    if (taken) return { ok: false, hata: `Bu site ürünü zaten “${taken.ad}” kartına bağlı.` };
  }
  if (id) await db().update(items).set(values).where(eq(items.id, id));
  else id = (await db().insert(items).values(values).$returningId())[0].id;

  for (const l of input.listelemeler) {
    const ch = channels.get(l.siteId);
    if (!ch) continue;
    if (ch.tur === "woocommerce") {
      await saveWooListing(id, l, oldListings.find((x) => x.siteId === l.siteId));
      continue;
    }
    const ozellikler: ListingInput["ozellikler"] = {};
    for (const [k, v] of Object.entries(l.ozellikler ?? {})) {
      if (!/^\d+$/.test(k)) continue;
      if (v?.v) ozellikler[k] = { v: Number(v.v) };
      else if (v?.c?.trim()) ozellikler[k] = { c: v.c.trim().slice(0, 200) };
    }
    const lv = {
      aktif: !!l.aktif, kategoriId: l.kategoriId || null, kategoriYol: clip(l.kategoriYol, 500), markaId: l.markaId || null, markaAd: clip(l.markaAd, 120),
      ozellikler: JSON.stringify(ozellikler), fiyat: num(l.fiyat), fiyatFarki: farkOf(l.fiyatFarki),
    };
    const ex = oldListings.find((x) => x.siteId === l.siteId);
    if (!ex) {
      if (lv.aktif) await db().insert(listings).values({ ...lv, urunId: id, siteId: l.siteId, durum: "taslak" });
      continue;
    }
    const changed = contentSig({ ...old, ...values }, { ...ex, ...lv }) !== contentSig(old ?? {}, ex);
    let durum = ex.durum;
    // Kapatılan listeleme: oluşmuşsa pasif (stok 0 gönderilir), oluşmamışsa taslakta kalır
    if (!lv.aktif) durum = ex.olustu ? "pasif" : "taslak";
    // İçerik değişti: yeniden gönderilmek üzere taslağa döner (sonucu beklenen gönderim bitene kadar dokunulmaz)
    else if (changed && ex.durum !== "gonderildi") durum = "taslak";
    // Yeniden açılan oluşmuş kart: onay durumu pazaryerinden sorulur, stok fiyat/stok eşitlemesiyle geri gelir
    else if (ex.durum === "pasif") durum = "onay";
    await db().update(listings).set({ ...lv, durum }).where(eq(listings.id, ex.id));
  }
  if (input.grubaUygula) await applyToGroup(id, values);
  return { ok: true, id };
}

/** Ortak alanları gruptaki diğer kartlara yazar; pazaryerinde içeriği değişen kart yeniden gönderilmek üzere taslağa döner */
async function applyToGroup(id: number, v: Pick<Item, "grupKodu" | "ad" | "aciklama" | "markaAdi" | "kdv" | "hazirlikGun">) {
  const common = { ad: v.ad, aciklama: v.aciklama, markaAdi: v.markaAdi, kdv: v.kdv, hazirlikGun: v.hazirlikGun };
  const sibs = await db().select().from(items).where(sql`${items.grupKodu} = ${v.grupKodu} AND ${items.id} <> ${id}`);
  const changed = sibs.filter((x) => x.ad !== common.ad || x.aciklama !== common.aciklama || x.markaAdi !== common.markaAdi || x.kdv !== common.kdv || x.hazirlikGun !== common.hazirlikGun);
  if (!changed.length) return;
  const ids = changed.map((x) => x.id);
  await db().update(items).set(common).where(inArray(items.id, ids));
  await db()
    .update(listings)
    .set({ durum: "taslak" })
    .where(and(inArray(listings.urunId, ids), eq(listings.aktif, true), sql`${listings.disUrunId} IS NULL`, inArray(listings.durum, ["onay", "yayinda", "hata"])));
}

/** WooCommerce bağlantısı: bağlıysa "yayinda", kapalıysa "pasif"; bağlantı değişince fiyat yeniden yazılabilir */
async function saveWooListing(urunId: number, l: ListingInput, ex: Listing | undefined) {
  const disUrunId = l.disUrunId ? Number(l.disUrunId) : null;
  const v = {
    aktif: !!l.aktif && !!disUrunId, disUrunId, disVaryantId: disUrunId && l.disVaryantId ? Number(l.disVaryantId) : null,
    disAd: clip(l.disAd, 255), disFiyat: num(l.disFiyat), fiyat: num(l.fiyat), fiyatFarki: farkOf(l.fiyatFarki),
  };
  const durum = v.aktif ? ("yayinda" as const) : ("pasif" as const);
  if (!ex) {
    if (v.aktif) await db().insert(listings).values({ ...v, urunId, siteId: l.siteId, durum });
    return;
  }
  const relinked = ex.disUrunId !== v.disUrunId || ex.disVaryantId !== v.disVaryantId;
  await db()
    .update(listings)
    .set({ ...v, durum, hata: null, ...(relinked ? { sonFiyatStok: null } : {}) })
    .where(eq(listings.id, ex.id));
}

/** Kart silinir yalnızca hiçbir pazaryerinde oluşmamışsa; oluşmuşsa kapatılır (stok 0) */
export async function deleteItem(id: number) {
  await ensureMarketplaceSchema();
  const ls = await db().select({ olustu: listings.olustu }).from(listings).where(eq(listings.urunId, id));
  if (ls.some((l) => l.olustu)) {
    await db().update(items).set({ aktif: false }).where(eq(items.id, id));
    return { silindi: false };
  }
  await db().delete(items).where(eq(items.id, id));
  return { silindi: true };
}

/* ───────────── kategoriler, özellikler, markalar ───────────── */

export async function refreshCategories(siteId: number) {
  await ensureMarketplaceSchema();
  const site = await siteOf(siteId);
  const list = await tyCategories(site);
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500).map((k) => ({ tur: site.tur, id: k.id, ustId: k.ustId, ad: k.ad.slice(0, 200), yol: k.yol.slice(0, 600), yaprak: k.yaprak }));
    await db()
      .insert(categories)
      .values(chunk)
      .onDuplicateKeyUpdate({ set: { ustId: sql`VALUES(ust_id)`, ad: sql`VALUES(ad)`, yol: sql`VALUES(yol)`, yaprak: sql`VALUES(yaprak)` } });
  }
  await log(siteId, "kategori", null, "tamam", `${list.length} kategori güncellendi.`);
  return list.length;
}

/** Yaprak kategorilerde arama: her kelime yolda geçmeli */
export async function searchCategories(siteId: number, q: string) {
  await ensureMarketplaceSchema();
  const site = await siteOf(siteId);
  const words = q.trim().split(/\s+/).filter((w) => w.length > 1).slice(0, 5);
  if (!words.length) return [];
  return db()
    .select({ id: categories.id, yol: categories.yol })
    .from(categories)
    .where(and(eq(categories.tur, site.tur), eq(categories.yaprak, true), ...words.map((w) => like(categories.yol, `%${w.replace(/[%_]/g, "")}%`))))
    .orderBy(asc(categories.yol))
    .limit(40);
}

export async function categoryCount(tur: string) {
  await ensureMarketplaceSchema();
  const [r] = await db().select({ n: sql<number>`COUNT(*)`.mapWith(Number) }).from(categories).where(eq(categories.tur, tur));
  return r?.n ?? 0;
}

const ATTR_TTL = 7 * 24 * 3600_000;

/** Kategori özellikleri (yedi gün önbellekte) */
export async function categoryAttributes(siteId: number, kategoriId: number): Promise<CategoryAttribute[]> {
  await ensureMarketplaceSchema();
  const site = await siteOf(siteId);
  const [c] = await db().select({ o: categories.ozellikler, t: categories.ozellikTarih }).from(categories).where(and(eq(categories.tur, site.tur), eq(categories.id, kategoriId)));
  if (c?.o && c.t && Date.now() - c.t.getTime() < ATTR_TTL) return JSON.parse(c.o) as CategoryAttribute[];
  const attrs = await tyCategoryAttributes(site, kategoriId);
  if (c) await db().update(categories).set({ ozellikler: JSON.stringify(attrs), ozellikTarih: new Date() }).where(and(eq(categories.tur, site.tur), eq(categories.id, kategoriId)));
  return attrs;
}

export async function searchBrands(siteId: number, q: string) {
  const site = await siteOf(siteId);
  return q.trim().length < 2 ? [] : tyBrands(site, q.trim());
}

/* ───────────── gönderim ───────────── */

const publicUrl = () => (process.env.PUBLIC_URL ?? "").replace(/\/+$/, "");

/** Pazaryerine giden görsel adresi: paneldeki webp görseller JPEG'e çevrilerek verilir (/jpg/…) */
export const imageUrl = (g: string) => (/^https:\/\//.test(g) ? g : `${publicUrl()}/jpg${g.replace(/\.webp$/, ".jpg")}`);

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const descriptionHtml = (s: string) =>
  s
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");

type Row = { i: Item; l: Listing; perakende: number | null; secenek: number | null };
const catalogOf = (r: Row) => catalogPrice(r.perakende, r.secenek, r.i.secenekDahil);

/** Gönderime hazır mı: eksikler listesi (boşsa hazır) */
export async function listingProblems(siteId: number, r: Row, s: ChannelSettings) {
  const p: string[] = [];
  const gorseller = r.i.gorseller ? (JSON.parse(r.i.gorseller) as string[]) : [];
  if (!r.l.kategoriId) p.push("kategori seçilmedi");
  if (!r.l.markaId) p.push("marka seçilmedi");
  if (!gorseller.length) p.push("görsel yok");
  if (!r.i.desi) p.push("desi girilmedi");
  if (!channelPrice(r.i, catalogOf(r), r.l, s)) p.push("fiyat yok");
  if ((r.i.aciklama ?? "").trim().length < 30) p.push("açıklama çok kısa (en az 30 karakter)");
  if (r.l.kategoriId) {
    const attrs = await categoryAttributes(siteId, r.l.kategoriId).catch(() => null);
    if (!attrs) p.push("kategori özellikleri okunamadı");
    else {
      const vals = r.l.ozellikler ? (JSON.parse(r.l.ozellikler) as ListingInput["ozellikler"]) : {};
      const eksik = attrs.filter((a) => a.zorunlu && !vals[a.id]?.v && !vals[a.id]?.c).map((a) => a.ad);
      if (eksik.length) p.push(`zorunlu özellik eksik: ${eksik.join(", ")}`);
    }
  }
  return p;
}

function toTyItem(r: Row, s: ChannelSettings): TyItem {
  const price = channelPrice(r.i, catalogOf(r), r.l, s)!;
  const vals = r.l.ozellikler ? (JSON.parse(r.l.ozellikler) as ListingInput["ozellikler"]) : {};
  return {
    barcode: r.i.barkod,
    title: r.i.ad.slice(0, 100),
    productMainId: r.i.grupKodu,
    brandId: r.l.markaId!,
    categoryId: r.l.kategoriId!,
    quantity: r.i.aktif && r.l.aktif ? r.i.stok : 0,
    stockCode: r.i.stokKodu,
    dimensionalWeight: r.i.desi ?? 1,
    description: descriptionHtml(r.i.aciklama ?? r.i.ad),
    currencyType: "TRY",
    listPrice: price,
    salePrice: price,
    vatRate: r.i.kdv,
    ...(s.kargoFirmaId ? { cargoCompanyId: s.kargoFirmaId } : {}),
    deliveryDuration: r.i.hazirlikGun,
    images: (JSON.parse(r.i.gorseller ?? "[]") as string[]).map((g) => ({ url: imageUrl(g) })),
    attributes: Object.entries(vals).map(([k, v]) => (v.v ? { attributeId: Number(k), attributeValueId: v.v } : { attributeId: Number(k), customAttributeValue: v.c! })),
  };
}

async function rowsOf(siteId: number, where?: ReturnType<typeof and>) {
  return db()
    .select({ i: items, l: listings, perakende: urunler.perakende, secenek: urunler.secenekPerakende })
    .from(listings)
    .innerJoin(items, eq(items.id, listings.urunId))
    .leftJoin(urunler, eq(urunler.id, items.urunId))
    .where(and(eq(listings.siteId, siteId), where));
}

/**
 * Taslak ve hatalı listelemeleri gönderir (urunIds verilirse yalnızca onları). Eksiği olan listeleme gönderilmez,
 * hatası yazılır. Yeni kartlar oluşturulur, oluşmuş kartlar güncellenir; her biri tek toplu işlemdir.
 */
export async function sendListings(siteId: number, kim: string, urunIds?: number[]) {
  await ensureMarketplaceSchema();
  const site = await siteOf(siteId);
  const s = await settingsOf(siteId);
  const rows = await rowsOf(siteId, and(eq(listings.aktif, true), eq(items.aktif, true), inArray(listings.durum, ["taslak", "hata"]), urunIds?.length ? inArray(listings.urunId, urunIds) : undefined));
  const ready: Row[] = [];
  let eksik = 0;
  for (const r of rows) {
    const p = await listingProblems(siteId, r, s);
    if (p.length) {
      eksik++;
      await db().update(listings).set({ durum: "hata", hata: `Gönderilmedi: ${p.join("; ")}.` }).where(eq(listings.id, r.l.id));
    } else ready.push(r);
  }
  let gonderilen = 0;
  for (const update of [false, true]) {
    const group = ready.filter((r) => r.l.olustu === update);
    for (let i = 0; i < group.length; i += 100) {
      const chunk = group.slice(i, i + 100);
      try {
        const batchId = await tySendProducts(site, chunk.map((r) => toTyItem(r, s)), update);
        await db()
          .update(listings)
          .set({ durum: "gonderildi", batchId, hata: null, sonGonderim: new Date() })
          .where(inArray(listings.id, chunk.map((r) => r.l.id)));
        gonderilen += chunk.length;
        await log(siteId, update ? "urun-guncelle" : "urun-olustur", batchId, "gonderildi", `${chunk.length} ürün: ${chunk.map((r) => r.i.stokKodu).join(", ")}`.slice(0, 1000), kim);
      } catch (e) {
        const hata = e instanceof Error ? e.message : "Gönderilemedi.";
        await db().update(listings).set({ durum: "hata", hata }).where(inArray(listings.id, chunk.map((r) => r.l.id)));
        await log(siteId, update ? "urun-guncelle" : "urun-olustur", null, "hata", hata.slice(0, 1000), kim);
      }
    }
  }
  return { gonderilen, eksik };
}

/** Gönderilen toplu işlemlerin sonucu ve onay bekleyen kartların durumu */
export async function checkListings(siteId: number) {
  await ensureMarketplaceSchema();
  const site = await siteOf(siteId);
  const sent = await rowsOf(siteId, eq(listings.durum, "gonderildi"));
  for (const batchId of [...new Set(sent.map((r) => r.l.batchId).filter((b): b is string => !!b))]) {
    const res = await tyBatch(site, batchId);
    if (!res.bitti) continue;
    for (const r of sent.filter((x) => x.l.batchId === batchId)) {
      const k = res.kalemler.find((x) => x.barkod === r.i.barkod);
      if (!k) {
        // Toplu işlem bitti ama kalem yok: pazaryeri kaydı vermedi, yeniden gönderilmek üzere hataya düşer
        await db().update(listings).set({ durum: "hata", hata: "Pazaryeri bu ürün için sonuç vermedi; yeniden gönderin." }).where(eq(listings.id, r.l.id));
      } else if (k.basarili) {
        await db().update(listings).set({ durum: "onay", olustu: true, hata: null, sonFiyatStok: null }).where(eq(listings.id, r.l.id));
      } else {
        await db().update(listings).set({ durum: "hata", hata: k.hatalar.join("; ").slice(0, 2000) || "Pazaryeri ürünü reddetti." }).where(eq(listings.id, r.l.id));
      }
    }
    const ok = res.kalemler.filter((k) => k.basarili).length;
    await log(siteId, "urun-sonuc", batchId, ok === res.kalemler.length ? "tamam" : "hata", `${ok}/${res.kalemler.length} ürün kabul edildi.`);
  }
  // Onay bekleyenler: her turda en çok 20 kart sorulur
  const waiting = await rowsOf(siteId, eq(listings.durum, "onay"));
  for (const r of waiting.slice(0, 20)) {
    const st = await tyProductState(site, r.i.barkod).catch(() => null);
    if (!st) continue;
    if (st.reddedildi) await db().update(listings).set({ durum: "hata", hata: `Reddedildi${st.neden ? `: ${st.neden}` : ""}` }).where(eq(listings.id, r.l.id));
    else if (st.onayli) await db().update(listings).set({ durum: "yayinda", hata: null }).where(eq(listings.id, r.l.id));
  }
}

/** Oluşmuş kartların fiyat ve stoku: yalnızca değişenler gönderilir (kapalı ürün/listeleme stok 0) */
export async function pushPriceStock(siteId: number, kim?: string) {
  await ensureMarketplaceSchema();
  const site = await siteOf(siteId);
  const s = await settingsOf(siteId);
  const rows = await rowsOf(siteId, eq(listings.olustu, true));
  const changed: { r: Row; sig: string; item: { barcode: string; quantity: number; salePrice: number; listPrice: number } }[] = [];
  for (const r of rows) {
    const price = channelPrice(r.i, catalogOf(r), r.l, s);
    if (!price) continue;
    const quantity = r.i.aktif && r.l.aktif ? r.i.stok : 0;
    const sig = `${price}|${price}|${quantity}`;
    if (sig !== r.l.sonFiyatStok) changed.push({ r, sig, item: { barcode: r.i.barkod, quantity, salePrice: price, listPrice: price } });
  }
  for (let i = 0; i < changed.length; i += 500) {
    const chunk = changed.slice(i, i + 500);
    const batchId = await tyPriceStock(site, chunk.map((c) => c.item));
    for (const c of chunk) await db().update(listings).set({ sonFiyatStok: c.sig }).where(eq(listings.id, c.r.l.id));
    await log(siteId, "fiyat-stok", batchId, "gonderildi", `${chunk.length} ürün: ${chunk.map((c) => `${c.r.i.stokKodu} ${c.item.salePrice} ₺ × ${c.item.quantity}`).join(", ")}`.slice(0, 1000), kim);
  }
  return changed.length;
}

/** Sipariş eşitlemesiyle birlikte çalışır: gönderim sonuçları, onaylar ve değişen fiyat/stok; sitede (açıksa) değişen fiyat */
export async function marketplaceTick(siteId: number) {
  await ensureMarketplaceSchema();
  const [n] = await db()
    .select({ n: sql<number>`COUNT(*)`.mapWith(Number), tur: sql<string>`MAX(${sites.tur})` })
    .from(listings)
    .innerJoin(sites, eq(sites.id, listings.siteId))
    .where(eq(listings.siteId, siteId));
  if (!n?.n) return;
  if (n.tur === "woocommerce") {
    if ((await settingsOf(siteId)).fiyatYaz) await pushWooPrices(siteId);
    return;
  }
  await checkListings(siteId);
  await pushPriceStock(siteId);
}

/* ───────────── WooCommerce ───────────── */

export async function wooSearch(siteId: number, q: string) {
  return q.trim().length < 2 ? [] : wcSearch(await wooSiteOf(siteId), q.trim());
}

export async function wooVariations(siteId: number, productId: number) {
  return wcVariations(await wooSiteOf(siteId), productId);
}

/* Siteden aktarım: sitedeki ürünün her varyantı ayrı kart olur (kendi stok kodu, barkodu, stoku), aynı grup koduyla
   panelde tek ürün altında görünür; teklif ürünü ölçü ve ad benzerliğiyle önerilir. Sitede hiçbir şey değişmez. */

const TR: Record<string, string> = { ç: "C", ğ: "G", ı: "I", i: "I", ö: "O", ş: "S", ü: "U" };
const slug = (s: string) =>
  s
    .toLocaleLowerCase("tr")
    .replace(/[çğıiöşü]/g, (c) => TR[c])
    .toUpperCase()
    .replace(/×/g, "X")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
/** Addan kısa kod: en fazla 24 karakter, kelime sınırında */
const shortSlug = (s: string) => {
  const full = slug(s);
  if (full.length <= 24) return full;
  const cut = full.slice(0, 25);
  return cut.slice(0, cut.lastIndexOf("-") > 8 ? cut.lastIndexOf("-") : 24);
};
/** Kodların tire ile ayrılmış ortak öneki: LB-55X250, LB-75X300 → LB */
const commonPrefix = (codes: string[]) => {
  const parts = codes.map((c) => c.split("-"));
  const out: string[] = [];
  for (let i = 0; parts.every((x) => x.length > i + 1 && x[i] === parts[0][i]); i++) out.push(parts[0][i]);
  return out.join("-");
};
/** "55 × 250 cm", "55x250" → "55x250" */
const sizeKey = (s: string | null | undefined) => {
  const m = (s ?? "").match(/(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/i);
  return m ? `${Number(m[1].replace(",", "."))}x${Number(m[2].replace(",", "."))}` : null;
};
const STOP = new Set(["cm", "m", "mm", "x", "ve", "ile", "adet"]);
const words = (s: string) =>
  new Set(
    s
      .toLocaleLowerCase("tr")
      .replace(/[^a-zçğıöşü0-9]+/g, " ")
      .split(" ")
      .filter((w) => w && !/^\d/.test(w) && !STOP.has(w)),
  );

type CatalogLite = { id: number; kod: string; ad: string; aciklama: string | null };
/** Teklif ürünü önerisi: ölçü geçiyorsa aynı ölçüdekiler arasından, ad benzerliği en yüksek ve tek olan */
function suggestCatalog(text: string, catalog: CatalogLite[]) {
  const key = sizeKey(text);
  const w = words(text);
  const scored = catalog
    .filter((c) => !key || sizeKey(`${c.ad} ${c.aciklama ?? ""}`) === key)
    .map((c) => ({ c, n: [...words(c.ad)].filter((x) => w.has(x)).length }))
    .filter((x) => x.n >= (key ? 1 : 2))
    .sort((a, b) => b.n - a.n);
  return scored.length && (scored.length === 1 || scored[0].n > scored[1].n) ? scored[0].c : null;
}

export type WooImportRow = {
  disVaryantId: number | null; ad: string; sku: string; fiyat: number | null; olcu: string; renk: string; gorsel: string | null;
  urunId: number | null; stokKodu: string; bagli: string | null;
};

/** Aktarım önizlemesi: varyant başına önerilen stok kodu ve teklif ürünü; zaten bir karta bağlı olanlar işaretli */
export async function wooImportPreview(siteId: number, productId: number) {
  await ensureMarketplaceSchema();
  const p = await wcProduct(await wooSiteOf(siteId), productId);
  const [catalog, linked, codes] = await Promise.all([
    db().select({ id: urunler.id, kod: urunler.kod, ad: urunler.ad, aciklama: urunler.aciklama }).from(urunler).where(eq(urunler.aktif, true)),
    db()
      .select({ v: listings.disVaryantId, ad: items.ad, stokKodu: items.stokKodu })
      .from(listings)
      .innerJoin(items, eq(items.id, listings.urunId))
      .where(and(eq(listings.siteId, siteId), eq(listings.disUrunId, productId))),
    db().select({ k: items.stokKodu }).from(items),
  ]);
  const used = new Set(codes.map((c) => c.k.toUpperCase()));
  const unique = (k: string) => {
    let out = k || "URUN";
    for (let n = 2; used.has(out.toUpperCase()); n++) out = `${k}-${n}`;
    used.add(out.toUpperCase());
    return out;
  };
  const vs = p.varyantli ? [...p.varyantlar].sort((a, b) => a.id - b.id) : [{ id: 0, ad: "", sku: p.sku, fiyat: p.fiyat, nitelikler: [], gorsel: null }];
  const matches = vs.map((v) => suggestCatalog(`${p.ad} ${v.ad}`, catalog));
  // Stok kodu: sitedeki stok kodu, yoksa eşleşen teklif ürününün kodu (LB-55X250), yoksa addan kısa kod; grup kodu bunların ortak öneki
  const codes2 = matches.map((c) => c?.kod.toUpperCase() ?? null);
  const common = vs.length > 1 && codes2.every(Boolean) ? commonPrefix(codes2 as string[]) : "";
  const base = p.sku || common || shortSlug(p.ad);
  const rows = vs.map((v, i): WooImportRow => {
    const renk = v.nitelikler.filter((a) => /renk|color/i.test(a.ad)).map((a) => a.deger).join(" ");
    const olcu = v.nitelikler.filter((a) => !/renk|color/i.test(a.ad)).map((a) => a.deger).join(" ");
    const c = matches[i];
    const l = linked.find((x) => (x.v ?? 0) === v.id);
    const own = p.varyantli ? `${base}-${shortSlug(v.ad.replace(/\s*(cm|mm|m)$/i, ""))}` : base;
    // Varyantın kendi stok kodu yoksa WooCommerce ana ürününkini gösterir: o varyanta ait sayılmaz
    const sku = v.sku && (!p.varyantli || v.sku !== p.sku) ? v.sku : "";
    return {
      disVaryantId: v.id || null, ad: v.ad, sku: v.sku, fiyat: v.fiyat, olcu, renk, gorsel: v.gorsel, urunId: c?.id ?? null,
      stokKodu: l ? l.stokKodu : unique(sku || codes2[i] || own),
      bagli: l ? l.ad : null,
    };
  });
  // Tek ürünün grup kodu kendi stok kodudur
  return { urun: { id: p.id, ad: p.ad, sku: p.sku, varyantli: p.varyantli, aciklama: p.aciklama, gorseller: p.gorseller }, grupKodu: p.varyantli ? base : rows[0].stokKodu, satirlar: rows };
}

export type WooImportInput = {
  siteId: number; disUrunId: number; ad: string; aciklama: string; grupKodu: string; kdv: number;
  satirlar: { disVaryantId: number | null; stokKodu: string; urunId: number | null; olcu: string; renk: string }[];
};

/**
 * Seçilen varyantlar için kart açar ve sitedeki varyanta bağlar. Fiyat ve görseller siteden yeniden okunur; teklif ürününe
 * bağlananın fiyatı teklif ürününden gelir, bağlanmayanın KDV hariç fiyatı sitedeki fiyattan çıkarılır.
 */
export async function wooImport(input: WooImportInput) {
  await ensureMarketplaceSchema();
  const p = await wcProduct(await wooSiteOf(input.siteId), input.disUrunId);
  const kdv = [0, 1, 10, 20].includes(Number(input.kdv)) ? Number(input.kdv) : 20;
  const s = await settingsOf(input.siteId);
  const ids = input.satirlar.map((r) => Number(r.urunId)).filter(Boolean);
  const cats = new Map((ids.length ? await db().select({ id: urunler.id, perakende: urunler.perakende }).from(urunler).where(inArray(urunler.id, ids)) : []).map((c) => [c.id, c.perakende]));
  const hatalar: string[] = [];
  let eklenen = 0;
  for (const r of input.satirlar) {
    const v = r.disVaryantId ? p.varyantlar.find((x) => x.id === Number(r.disVaryantId)) : null;
    if (r.disVaryantId && !v) {
      hatalar.push(`#${r.disVaryantId}: sitede bu varyant yok`);
      continue;
    }
    const siteFiyat = v ? v.fiyat : p.fiyat;
    const fiyat = r.urunId || siteFiyat === null ? null : Math.round((siteFiyat / (1 + kdv / 100)) * 100) / 100;
    // Sitedeki fiyat korunur: panelden farkı ürünün kanal farkı olur, sonra fiyat panelden yönetilir
    const fark = farkFor(fiyat ?? cats.get(Number(r.urunId)) ?? null, kdv, siteFiyat, s.fiyatFarki);
    const res = await saveItem({
      id: null, stokKodu: r.stokKodu, barkod: await nextBarcode(), ad: input.ad || p.ad, aciklama: input.aciklama, grupKodu: input.grupKodu, markaAdi: "",
      urunId: r.urunId || null, renk: r.renk, olcu: r.olcu, gorseller: [...new Set([v?.gorsel, ...p.gorseller].filter((g): g is string => !!g))].slice(0, 8),
      desi: null, agirlik: null, en: null, boy: null, yukseklik: null, kdv,
      fiyat,
      secenekDahil: false, maliyet: null, stok: 10, hazirlikGun: 3, aktif: true,
      listelemeler: [{
        siteId: input.siteId, aktif: true, kategoriId: null, kategoriYol: null, markaId: null, markaAd: null, ozellikler: {}, fiyat: null, fiyatFarki: fark,
        disUrunId: p.id, disVaryantId: v?.id ?? null, disAd: v ? `${p.ad} · ${v.ad}` : p.ad, disFiyat: siteFiyat,
      }],
    });
    if (res.ok) eklenen++;
    else hatalar.push(`${r.stokKodu}: ${res.hata}`);
  }
  return { eklenen, hatalar };
}

/** Bağlı ürünlerin sitedeki adını ve fiyatını yeniden okur; sitede bulunamayan bağlantı hataya düşer */
export async function refreshWoo(siteId: number) {
  await ensureMarketplaceSchema();
  const site = await wooSiteOf(siteId);
  const rows = await db().select().from(listings).where(and(eq(listings.siteId, siteId), sql`${listings.disUrunId} IS NOT NULL`));
  const cur = await wcCurrent(site, rows.map((l) => ({ urunId: l.disUrunId!, varyantId: l.disVaryantId })));
  let eksik = 0;
  for (const l of rows) {
    const c = cur.get(`${l.disUrunId}:${l.disVaryantId ?? 0}`);
    if (!c) eksik++;
    await db()
      .update(listings)
      .set(c ? { disAd: c.ad.slice(0, 255), disFiyat: c.fiyat, hata: null } : { hata: "Sitede bu ürün/varyant bulunamadı (silinmiş olabilir)." })
      .where(eq(listings.id, l.id));
  }
  await log(siteId, "site-oku", null, eksik ? "hata" : "tamam", `${rows.length} bağlı ürünün sitedeki fiyatı okundu${eksik ? `; ${eksik} ürün sitede bulunamadı` : ""}.`);
  return { okunan: rows.length, eksik };
}

/** Fiyatı sitedekinden farklı olan bağlı ürünlerin fiyatını yazar (ürün ya da bağlantı kapalıysa dokunulmaz) */
export async function pushWooPrices(siteId: number, kim?: string) {
  await ensureMarketplaceSchema();
  const site = await wooSiteOf(siteId);
  const s = await settingsOf(siteId);
  if (!s.fiyatYaz) throw new Error("Bu sitede fiyat yazma kapalı (kanal ayarları).");
  const rows = await rowsOf(siteId, and(eq(listings.aktif, true), eq(items.aktif, true), sql`${listings.disUrunId} IS NOT NULL`));
  const changed = rows
    .map((r) => ({ r, price: channelPrice(r.i, catalogOf(r), r.l, s) }))
    .filter((x): x is { r: Row; price: number } => !!x.price && String(x.price) !== x.r.l.sonFiyatStok && x.price !== x.r.l.disFiyat);
  if (!changed.length) return 0;
  try {
    await wcSetPrices(site, changed.map((c) => ({ urunId: c.r.l.disUrunId!, varyantId: c.r.l.disVaryantId, fiyat: c.price, kdv: c.r.i.kdv })));
  } catch (e) {
    const hata = e instanceof Error ? e.message : "Fiyat yazılamadı.";
    await log(siteId, "site-fiyat", null, "hata", hata, kim);
    throw e;
  }
  for (const c of changed) await db().update(listings).set({ sonFiyatStok: String(c.price), disFiyat: c.price, sonGonderim: new Date(), hata: null }).where(eq(listings.id, c.r.l.id));
  await log(siteId, "site-fiyat", null, "tamam", `${changed.length} ürün: ${changed.map((c) => `${c.r.i.stokKodu} ${c.price} ₺`).join(", ")}`, kim);
  return changed.length;
}

/* ───────────── kayıt ───────────── */

async function log(siteId: number, tur: string, batchId: string | null, durum: string, ozet: string, kim?: string) {
  await db().insert(logs).values({ siteId, tur, batchId, durum, ozet: ozet.slice(0, 1000), kullanici: kim ?? null });
}

export async function recentLogs(limit = 40) {
  await ensureMarketplaceSchema();
  return db().select({ l: logs, site: sites.ad }).from(logs).innerJoin(sites, eq(sites.id, logs.siteId)).orderBy(desc(logs.id)).limit(limit);
}
