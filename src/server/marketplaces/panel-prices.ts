import "server-only";
import { and, asc, eq, like, or } from "drizzle-orm";
import { db, schema } from "../db";
import { catalogPrice, channelPrice, settingsOf } from "./listing";
import { wcCurrent, wcPublishedProducts } from "./woocommerce";

// Sitedeki ürünlerin panel fiyatı: siteye bağlı satış kartlarının (pazaryeri_urunleri ↔ pazaryeri_listelemeleri) kanal fiyatı.
// Bu, panelin siteye yazacağı fiyattır (kart fiyatı ya da bağlı teklif ürününün perakendesi × KDV × kanal farkı; ya da
// listelemeye özel fiyat). WhatsApp asistanı fiyatı buradan söyler; panelde karşılığı olmayan site ürününde site fiyatı geçici
// olarak kullanılır (bkz. fiyat kapsamı raporu).

const { pazaryeriUrunleri: items, pazaryeriListelemeleri: listings, urunler } = schema;

export type PanelFiyat = {
  /** KDV dahil, kanaldaki fiyat */
  fiyat: number;
  /** Teklife girecek birim fiyat: kartın KDV hariç taban fiyatı (kanal farkı yok) */
  haric: number;
  kartId: number;
  stokKodu: string;
  ad: string;
  renk: string | null;
  olcu: string | null;
  gorsel: string | null;
  varyantId: number | null;
};

const cache = new Map<number, { t: number; v: Map<number, PanelFiyat[]> }>();

/** Sitenin ürün numarası → o ürüne (ya da varyantlarına) bağlı etkin satış kartlarının panel fiyatları. 1 dakika önbellek. */
export async function sitePanelPrices(siteId: number) {
  const hit = cache.get(siteId);
  if (hit && Date.now() - hit.t < 60_000) return hit.v;
  const [s, rows] = await Promise.all([
    settingsOf(siteId),
    db()
      .select({ i: items, l: listings, perakende: urunler.perakende, secenek: urunler.secenekPerakende })
      .from(listings)
      .innerJoin(items, eq(items.id, listings.urunId))
      .leftJoin(urunler, eq(urunler.id, items.urunId))
      .where(and(eq(listings.siteId, siteId), eq(listings.aktif, true), eq(items.aktif, true))),
  ]);
  const v = new Map<number, PanelFiyat[]>();
  for (const r of rows) {
    if (!r.l.disUrunId) continue;
    const katalog = catalogPrice(r.perakende, r.secenek, r.i.secenekDahil, r.i.yalnizSecenek);
    const fiyat = channelPrice(r.i, katalog, r.l, s);
    const haric = r.i.fiyat ?? katalog;
    if (fiyat === null || haric === null) continue;
    const gorseller = r.i.gorseller ? (JSON.parse(r.i.gorseller) as string[]) : [];
    const list = v.get(r.l.disUrunId) ?? [];
    list.push({ fiyat, haric, kartId: r.i.id, stokKodu: r.i.stokKodu, ad: r.i.ad, renk: r.i.renk, olcu: r.i.olcu, gorsel: gorseller[0] ?? null, varyantId: r.l.disVaryantId });
    v.set(r.l.disUrunId, list);
  }
  cache.set(siteId, { t: Date.now(), v });
  return v;
}

/** Bir site ürününün panel fiyatı: tek kartsa o, birden çok seçenekse en düşük ("başlayan"); yoksa null */
export async function panelPriceOf(siteId: number, urunId: number) {
  const list = (await sitePanelPrices(siteId)).get(urunId);
  if (!list?.length) return null;
  const min = list.reduce((a, b) => (b.fiyat < a.fiyat ? b : a));
  return { fiyat: min.fiyat, coklu: list.length > 1, secenekler: list };
}

export type KapsamDurum = "yok" | "farkli" | "esit";
export type KapsamSatir = {
  id: number;
  ad: string;
  link: string;
  gorsel: string | null;
  /** Sitedeki KDV dahil fiyat (varyantlıda en düşük) */
  site: number | null;
  /** Panel fiyatı (KDV dahil; birden çok seçenekte en düşük) */
  panel: number | null;
  durum: KapsamDurum;
  /** Fiyatı tutmayan seçenekler: kart, sitedeki ve paneldeki fiyat */
  farklar: { kart: string; site: number | null; panel: number }[];
};

/**
 * Fiyat kapsamı: sitedeki her yayındaki ürünün panelde fiyatı var mı, varsa sitedekiyle aynı mı. Bağlı kartlar
 * kendi ürün/varyantlarıyla karşılaştırılır (1 TL'den küçük fark sayılmaz).
 */
export async function priceCoverage(siteId: number): Promise<KapsamSatir[]> {
  const [site] = await db().select().from(schema.siteBaglantilari).where(eq(schema.siteBaglantilari.id, siteId));
  if (!site) return [];
  cache.delete(siteId);
  const [products, prices] = await Promise.all([wcPublishedProducts(site), sitePanelPrices(siteId)]);
  const refs = [...prices.entries()].flatMap(([urunId, list]) => list.map((x) => ({ urunId, varyantId: x.varyantId })));
  const current = refs.length ? await wcCurrent(site, refs) : new Map<string, { ad: string; fiyat: number | null }>();
  return products.map((p) => {
    const list = prices.get(p.id) ?? [];
    const base = { id: p.id, ad: p.ad, link: p.link, gorsel: p.gorsel, site: p.fiyat };
    if (!list.length) return { ...base, panel: null, durum: "yok" as const, farklar: [] };
    const farklar = list
      .map((x) => ({ kart: [x.ad, x.olcu, x.renk].filter(Boolean).join(" · "), site: current.get(`${p.id}:${x.varyantId ?? 0}`)?.fiyat ?? null, panel: x.fiyat }))
      .filter((x) => x.site === null || Math.abs(x.site - x.panel) >= 1);
    return { ...base, panel: Math.min(...list.map((x) => x.fiyat)), durum: farklar.length ? ("farkli" as const) : ("esit" as const), farklar };
  });
}

/** Teklife eklenebilecek satış kartları (ad, stok kodu, renk ya da ölçüde arama): KDV hariç taban fiyat ve ilk görsel; maliyet dönmez */
export async function searchSaleItems(q: string) {
  const t = q.trim().slice(0, 60);
  if (t.length < 2) return [];
  const p = `%${t}%`;
  const rows = await db()
    .select({ i: items, perakende: urunler.perakende, secenek: urunler.secenekPerakende })
    .from(items)
    .leftJoin(urunler, eq(urunler.id, items.urunId))
    .where(and(eq(items.aktif, true), or(like(items.ad, p), like(items.stokKodu, p), like(items.renk, p), like(items.olcu, p))))
    .orderBy(asc(items.grupKodu), asc(items.id))
    .limit(20);
  return rows.flatMap((r) => {
    const haric = r.i.fiyat ?? catalogPrice(r.perakende, r.secenek, r.i.secenekDahil, r.i.yalnizSecenek);
    if (haric === null) return [];
    const gorseller = r.i.gorseller ? (JSON.parse(r.i.gorseller) as string[]) : [];
    return [{ kod: r.i.stokKodu, ad: r.i.ad, renk: r.i.renk, olcu: r.i.olcu, gorsel: gorseller[0] ?? null, haric, stok: r.i.stok }];
  });
}
export type SaleItemHit = Awaited<ReturnType<typeof searchSaleItems>>[number];
