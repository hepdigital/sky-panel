import "server-only";
import { and, desc, eq, inArray, isNotNull, like, sql } from "drizzle-orm";
import { profitOf } from "@/lib/marketplace-profit";
import { db, schema } from "../db";
import { ensureMarketplaceSchema } from "../db/ensure";
import type { SiteOrder } from "../sites";
import { TY_FINANCE_WINDOW, tyCargoItems, tyDeductions, tySettlements, type TyFinanceRow } from "./trendyol";

// Pazaryeri cari hesabı (Trendyol ekstresi): satış ve iade satırları komisyon oranı ve tutarıyla, kargo faturaları sipariş
// ve desi kalemleriyle, platform hizmet bedeli. Sipariş eşitlemesiyle birlikte üç saatte bir son 30 gün taranır (geç düşen
// kayıtlar için); aradaki eşitlemelerde bir yıl dolana kadar geçmişe doğru en çok iki pencere (15 gün) ilerlenir. Trendyol'a
// yalnızca okuma yapılır. Kayıtlar sipariş kârında ve ürün kartındaki kâr hesabında (öğrenilen komisyon/kargo) kullanılır.

const { pazaryeriKesintileri: rows, pazaryeriFinans: state, pazaryeriUrunleri: items, pazaryeriListelemeleri: listings } = schema;
type Site = typeof schema.siteBaglantilari.$inferSelect;

const DAY = 24 * 3600_000;
const FIRST_LOOKBACK = 365 * DAY;
const RESCAN = 30 * DAY;
const EVERY = 3 * 3600_000;
const WINDOWS_PER_TICK = 2;

/** Ekstre işlem türleri: satış, iade ve satıcının karşıladığı indirim/kupon (iptalleriyle) */
const SETTLEMENTS: [type: string, tur: string][] = [
  ["Sale", "satis"], ["Return", "iade"], ["Discount", "indirim"], ["DiscountCancel", "indirim"], ["Coupon", "indirim"], ["CouponCancel", "indirim"],
];

const r2 = (v: number) => Math.round(v * 100) / 100;
const n = (v: unknown) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

type Row = typeof rows.$inferInsert;
async function save(list: Row[]) {
  for (const r of list)
    await db()
      .insert(rows)
      .values(r)
      .onDuplicateKeyUpdate({ set: { tur: r.tur, siparisNo: r.siparisNo, barkod: r.barkod, tutar: r.tutar, komisyon: r.komisyon, oran: r.oran, desi: r.desi, aciklama: r.aciklama, tarih: r.tarih } });
}

const settlementRow = (siteId: number, tur: string, x: TyFinanceRow): Row => ({
  siteId, kayitId: `s:${x.id}`, tur, siparisNo: x.orderNumber || null, barkod: x.barcode?.slice(0, 60) || null,
  tutar: r2((n(x.credit) ?? 0) - (n(x.debt) ?? 0)),
  // İadede komisyon geri ödenir: kesinti eksi yazılır
  komisyon: n(x.commissionAmount) === null ? null : r2((tur === "iade" ? -1 : 1) * Math.abs(n(x.commissionAmount)!)),
  oran: n(x.commissionRate), desi: null, aciklama: x.transactionType?.slice(0, 200) || null, tarih: new Date(x.transactionDate),
});

/** Bir zaman penceresinin ekstre kayıtları ve kesinti faturaları (kargo faturası kalemleri bir kez çekilir) */
async function scanWindow(site: Site, start: number, end: number) {
  const list: Row[] = [];
  for (const [type, tur] of SETTLEMENTS) for (const x of await tySettlements(site, type, start, end)) list.push(settlementRow(site.id, tur, x));
  for (const x of await tyDeductions(site, start, end)) {
    const tarih = new Date(x.transactionDate);
    const tip = x.transactionType ?? "";
    // "İ" düz /i/i ile eşleşmez: Türkçe küçük harfe çevrilip aranır
    const has = (s: string | null | undefined, w: string) => (s ?? "").toLocaleLowerCase("tr").includes(w);
    // Komisyon faturası satış satırlarındaki komisyonların faturasıdır (tutarı onların toplamı): ayrıca sayılmaz
    if (has(tip, "komisyon")) continue;
    if (has(tip, "kargo")) {
      const [had] = await db().select({ id: rows.id }).from(rows).where(and(eq(rows.siteId, site.id), like(rows.kayitId, `k:${x.id}:%`))).limit(1);
      if (had) continue;
      const kalemler = await tyCargoItems(site, x.id);
      for (const k of kalemler) {
        const iade = has(k.shipmentPackageType, "iade");
        list.push({
          siteId: site.id, kayitId: `k:${x.id}:${k.parcelUniqueId}:${iade ? "i" : "g"}`, tur: iade ? "iade-kargo" : "kargo",
          siparisNo: k.orderNumber || null, barkod: null, tutar: -r2(Math.abs(n(k.amount) ?? 0)), komisyon: null, oran: null, desi: n(k.desi),
          aciklama: k.shipmentPackageType?.slice(0, 200) || null, tarih,
        });
      }
      // Kalemi gelmeyen fatura siparişe bağlanmadan tutulur (toplam giderde görünür)
      if (!kalemler.length)
        list.push({ siteId: site.id, kayitId: `k:${x.id}:-`, tur: "kargo", siparisNo: null, barkod: null, tutar: -r2(n(x.debt) ?? 0), komisyon: null, oran: null, desi: null, aciklama: tip.slice(0, 200), tarih });
    } else {
      list.push({
        siteId: site.id, kayitId: `d:${x.id}`, tur: has(tip, "hizmet") ? "hizmet" : "diger", siparisNo: x.orderNumber || null, barkod: null,
        tutar: r2((n(x.credit) ?? 0) - (n(x.debt) ?? 0)), komisyon: null, oran: null, desi: null, aciklama: tip.slice(0, 200) || null, tarih,
      });
    }
  }
  await save(list);
  return list.length;
}

/**
 * Sipariş eşitlemesinde çağrılır. Son 30 gün üç saatte bir taranır; arada, bir yıl dolana kadar geçmiş yeniden eskiye doğru
 * ilerlenir (imleç: taranan en eski an). Yeni bağlantıda ya da "geçmişi yeniden çek"te (kayıt silinir) baştan başlar.
 */
export async function financeTick(site: Site) {
  if (site.tur !== "trendyol") return 0;
  await ensureMarketplaceSchema();
  const now = Date.now();
  const [st] = await db().select().from(state).where(eq(state.siteId, site.id));
  let count = 0;
  if (!st?.son || now - st.son.getTime() >= EVERY) {
    for (let end = now; end > now - RESCAN; end -= TY_FINANCE_WINDOW) count += await scanWindow(site, Math.max(now - RESCAN, end - TY_FINANCE_WINDOW), end);
    const imlec = Math.min(st?.imlec ?? now, now - RESCAN);
    await db().insert(state).values({ siteId: site.id, imlec, son: new Date(now) }).onDuplicateKeyUpdate({ set: { imlec, son: new Date(now) } });
    return count;
  }
  let cur = st.imlec;
  for (let i = 0; i < WINDOWS_PER_TICK && cur > now - FIRST_LOOKBACK; i++) {
    const start = Math.max(now - FIRST_LOOKBACK, cur - TY_FINANCE_WINDOW);
    count += await scanWindow(site, start, cur);
    cur = start;
    await db().update(state).set({ imlec: cur }).where(eq(state.siteId, site.id));
  }
  return count;
}

/* ───────────── öğrenilen değerler ───────────── */

export type FinanceRefs = {
  /** Barkoda ve pazaryeri kategorisine göre son satıştaki komisyon oranı (%) */
  barkod: Record<string, number>;
  kategori: Record<string, number>;
  /** Son gönderi kargo faturasından desi başına ücret ve son hizmet bedeli (KDV dahil) */
  desiKargo: number | null;
  hizmet: number | null;
};

export async function financeRefs(siteId: number): Promise<FinanceRefs> {
  await ensureMarketplaceSchema();
  const [sales, kargo, hizmet] = await Promise.all([
    db()
      .select({ barkod: rows.barkod, oran: rows.oran, kategoriId: listings.kategoriId })
      .from(rows)
      .leftJoin(items, eq(items.barkod, rows.barkod))
      .leftJoin(listings, and(eq(listings.urunId, items.id), eq(listings.siteId, siteId)))
      .where(and(eq(rows.siteId, siteId), eq(rows.tur, "satis"), isNotNull(rows.oran)))
      .orderBy(rows.tarih),
    db().select({ tutar: rows.tutar, desi: rows.desi }).from(rows).where(and(eq(rows.siteId, siteId), eq(rows.tur, "kargo"), sql`${rows.desi} > 0`)).orderBy(desc(rows.tarih)).limit(1),
    db().select({ tutar: rows.tutar }).from(rows).where(and(eq(rows.siteId, siteId), eq(rows.tur, "hizmet"))).orderBy(desc(rows.tarih)).limit(1),
  ]);
  const barkod: Record<string, number> = {};
  const kategori: Record<string, number> = {};
  // Tarihe göre sıralı: sonraki satış öncekinin üzerine yazar (güncel oran)
  for (const s of sales) {
    if (s.barkod) barkod[s.barkod] = s.oran!;
    if (s.kategoriId) kategori[s.kategoriId] = s.oran!;
  }
  return {
    barkod, kategori,
    desiKargo: kargo[0] ? r2(Math.abs(kargo[0].tutar) / kargo[0].desi!) : null,
    hizmet: hizmet[0] ? r2(Math.abs(hizmet[0].tutar)) : null,
  };
}

/* ───────────── sipariş kârı ───────────── */

export type OrderProfitLine = { ad: string; tutar: number; not?: string; tahmini?: boolean };
export type OrderProfit = {
  satirlar: OrderProfitLine[];
  hakedis: number;
  maliyet: number | null;
  maliyetEksik: boolean;
  kar: number | null;
  /** Ekstrede satış kaydı yok: komisyon ve kargo tahmini */
  tahmini: boolean;
};

/**
 * Pazaryeri siparişinin kârı: ekstrede satış/iade/kargo kaydı varsa gerçek tutarlar, yoksa öğrenilen oranlarla tahmin.
 * Maliyet kalem barkodlarından (ürün kartı maliyeti) gelir; iade edilen siparişte ürün geri döndüğü için maliyet düşülmez.
 */
export async function orderProfit(siteId: number, o: SiteOrder): Promise<OrderProfit | null> {
  await ensureMarketplaceSchema();
  const [kayit, refs, [ayar]] = await Promise.all([
    db().select().from(rows).where(and(eq(rows.siteId, siteId), eq(rows.siparisNo, o.no))),
    financeRefs(siteId),
    db().select({ veri: schema.pazaryeriAyarlari.veri }).from(schema.pazaryeriAyarlari).where(eq(schema.pazaryeriAyarlari.siteId, siteId)),
  ]);
  const s = (ayar ? JSON.parse(ayar.veri) : {}) as { komisyon?: number | null; desiKargo?: number | null; hizmetBedeli?: number | null };
  const kalemler = o.kalemler.map((k) => ({ ...k, barkod: k.secenekler?.Barkod ?? null }));
  const barkodlar = kalemler.map((k) => k.barkod).filter((b): b is string => !!b);
  const kartlar = barkodlar.length
    ? await db()
        .select({ barkod: items.barkod, maliyet: items.maliyet, desi: items.desi, kdv: items.kdv, katalog: schema.urunler.maliyet, komisyon: listings.komisyon, kategoriId: listings.kategoriId })
        .from(items)
        .leftJoin(schema.urunler, eq(schema.urunler.id, items.urunId))
        .leftJoin(listings, and(eq(listings.urunId, items.id), eq(listings.siteId, siteId)))
        .where(inArray(items.barkod, barkodlar))
    : [];
  const kart = (b: string | null) => kartlar.find((x) => x.barkod === b);

  const sum = (tur: string[], f: (r: (typeof kayit)[number]) => number) => r2(kayit.filter((r) => tur.includes(r.tur)).reduce((a, r) => a + f(r), 0));
  const satis = sum(["satis"], (r) => r.tutar);
  const tahmini = !kayit.some((r) => r.tur === "satis");
  const satirlar: OrderProfitLine[] = [];
  let komisyon: number;
  if (!tahmini) {
    const oranlar = [...new Set(kayit.filter((r) => r.tur === "satis" && r.oran !== null).map((r) => r.oran))];
    satirlar.push({ ad: "Satış", tutar: satis });
    const indirim = sum(["indirim"], (r) => r.tutar);
    if (indirim) satirlar.push({ ad: "İndirim / kupon", tutar: indirim });
    const iade = sum(["iade"], (r) => r.tutar);
    if (iade) satirlar.push({ ad: "İade", tutar: iade });
    komisyon = sum(["satis", "iade"], (r) => r.komisyon ?? 0);
    satirlar.push({ ad: "Komisyon", tutar: -komisyon, not: oranlar.length ? oranlar.map((x) => `%${x!.toLocaleString("tr-TR")}`).join(", ") : undefined });
  } else {
    satirlar.push({ ad: "Satış", tutar: o.toplam, not: "sipariş tutarı" });
    komisyon = r2(
      kalemler.reduce((a, k) => {
        const c = kart(k.barkod);
        const oran = c?.komisyon ?? (k.barkod ? refs.barkod[k.barkod] : undefined) ?? (c?.kategoriId ? refs.kategori[c.kategoriId] : undefined) ?? s.komisyon ?? null;
        return a + (oran === null ? 0 : (k.birim * k.adet * oran) / 100);
      }, 0),
    );
    satirlar.push({ ad: "Komisyon", tutar: -komisyon, tahmini: true, not: komisyon ? "öğrenilen oranla" : "oran bilinmiyor" });
  }
  const kargoKayit = kayit.filter((r) => r.tur === "kargo" || r.tur === "iade-kargo");
  if (kargoKayit.length) {
    for (const r of kargoKayit) satirlar.push({ ad: r.tur === "kargo" ? "Kargo" : "İade kargo", tutar: r.tutar, not: r.desi ? `${r.desi.toLocaleString("tr-TR")} desi` : undefined });
  } else {
    const desiKargo = s.desiKargo ?? refs.desiKargo;
    const desi = kalemler.reduce((a, k) => a + (kart(k.barkod)?.desi ?? 0) * k.adet, 0);
    satirlar.push({ ad: "Kargo", tutar: -r2(desi * (desiKargo ?? 0)), tahmini: true, not: desi && desiKargo ? `${desi.toLocaleString("tr-TR")} desi × ${desiKargo.toLocaleString("tr-TR")} ₺` : "desi ya da ücret bilinmiyor" });
  }
  const hizmet = s.hizmetBedeli ?? refs.hizmet;
  if (hizmet) satirlar.push({ ad: "Platform hizmet bedeli", tutar: -hizmet, tahmini: true, not: "gönderi başına" });

  const hakedis = r2(satirlar.reduce((a, l) => a + l.tutar, 0));
  const iadeEdildi = !tahmini && sum(["iade"], (r) => r.tutar) <= -satis + 0.01;
  let maliyet: number | null = 0;
  let maliyetEksik = false;
  for (const k of kalemler) {
    const c = kart(k.barkod);
    const m = c?.maliyet ?? c?.katalog ?? null;
    if (m === null) maliyetEksik = true;
    else maliyet += m * k.adet;
  }
  if (iadeEdildi) maliyet = 0;
  else if (maliyetEksik && maliyet === 0) maliyet = null;
  // KDV hariç kâr: gelirin KDV'si ürünün oranıyla, kesintilerinki %20 ile ayrılır
  const gelir = satirlar.filter((l) => l.ad === "Satış" || l.ad === "İndirim / kupon" || l.ad === "İade").reduce((a, l) => a + l.tutar, 0);
  const kdv = kartlar[0]?.kdv ?? 20;
  const kar = maliyet === null ? null : profitOf({ fiyat: gelir, kdv, komisyonOran: 0, kargo: gelir - hakedis, hizmet: 0, maliyet }).kar;
  return { satirlar, hakedis, maliyet: maliyet === null ? null : r2(maliyet), maliyetEksik, kar, tahmini };
}
