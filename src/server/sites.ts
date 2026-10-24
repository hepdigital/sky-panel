import "server-only";
import { and, asc, eq, or, sql } from "drizzle-orm";
import type { PdfData } from "@/lib/terminal/calc";
import { db, schema } from "./db";

const { siteBaglantilari: sites, siparisler, musteriler } = schema;
type Site = typeof sites.$inferSelect;
type PanelStatus = (typeof schema.SIPARIS_DURUMLARI)[number];

/* ───────────── ortak biçim ───────────── */

/** Sitenin seçenek listeleri: panel durum/ödeme/kargo düğmelerini bunlardan kurar */
export type Vocabulary = {
  durumlar: { key: string; label: string }[];
  odemeDurumlari: { key: string; label: string }[];
  odemeYontemleri: { key: string; label: string }[];
  kargolar: { key: string; label: string; url: string }[];
};

/** Siteden gelen sipariş (GazeboTente ve WooCommerce aynı biçime çevrilir) */
export type SiteOrder = {
  no: string;
  /** WooCommerce'te sitenin iç kimliği (güncelleme isteği bununla yapılır) */
  disId?: string;
  durum: string;
  odemeYontemi: string;
  odemeYontemiAd?: string;
  odemeDurumu: string | null;
  musteri: { ad: string; eposta: string; telefon: string; il: string; ilce: string; adres: string; faturaTipi: string; firma: string | null; vergiDairesi: string | null; vergiNo: string | null };
  teslimat?: { ad: string; adres: string; il: string; ilce: string; telefon: string } | null;
  musteriNotu: string | null;
  yonetimNotu?: string | null;
  araToplam: number;
  indirim: number;
  kdv: number;
  toplam: number;
  kargoUcreti?: number;
  kargo: { firma: string | null; takipNo: string | null; gonderim: string | null };
  kalemler: { ad: string; adet: number; birim: number; baskili?: boolean; secenekler: Record<string, string>; link?: string; gorsel: string | null }[];
  gecmis: { durum: string | null; mesaj: string | null; gorunur: boolean; kim: string; kimAd: string | null; tarih: string }[];
  dosyalar: { tur: string; ad: string; boyut: number; yukleyen: string; tarih: string }[];
  linkler: { musteri?: string; yonetim?: string };
  olusturma: string;
  guncelleme: string;
};

export type SiteAction =
  | { islem: "durum"; durum: string; mesaj?: string; bildir?: boolean }
  | { islem: "odeme"; odemeDurumu: string; bildir?: boolean }
  | { islem: "kargo"; kargoFirma: string; takipNo: string; kargodaYap?: boolean; bildir?: boolean }
  | { islem: "not"; mesaj: string; gorunur?: boolean };

/* ───────────── durum eşlemesi (panelin genel durumu) ───────────── */

const GT_MAP: Record<string, PanelStatus> = { yeni: "alindi", onaylandi: "alindi", tasarim: "uretimde", tasarim_onay: "uretimde", uretim: "uretimde", kargoda: "kargoda", teslim: "teslim", iptal: "iptal" };
const WC_MAP: Record<string, PanelStatus> = { pending: "alindi", "on-hold": "alindi", processing: "uretimde", completed: "teslim", cancelled: "iptal", refunded: "iptal", failed: "iptal" };
const panelStatus = (site: Site, durum: string): PanelStatus => (site.tur === "gazebotente" ? GT_MAP : WC_MAP)[durum] ?? "alindi";

/* ───────────── GazeboTente ───────────── */

const base = (site: Site) => site.adres.replace(/\/+$/, "");
const TIMEOUT = 20_000;

async function gtRequest(site: Site, path: string, init?: RequestInit) {
  const res = await fetch(`${base(site)}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${site.anahtar ?? ""}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; hata?: string } | null;
  if (!res.ok || !data?.ok) throw new Error(data?.hata ? `Site: ${data.hata}` : `Site yanıt vermedi (HTTP ${res.status}).`);
  return data as Record<string, unknown>;
}

async function gtFetch(site: Site, since: string | null) {
  const data = await gtRequest(site, `/api/panel/siparisler/?limit=50${since ? `&since=${encodeURIComponent(since)}` : ""}`);
  const { siparisler: orders, ...vocab } = data as unknown as { siparisler: SiteOrder[] } & Vocabulary;
  return { orders, vocab: vocab as Vocabulary, cursor: orders.at(-1)?.guncelleme ?? since };
}

/* ───────────── WooCommerce ───────────── */

type WcAddress = { first_name: string; last_name: string; company: string; address_1: string; address_2: string; city: string; state: string; postcode: string; phone?: string; email?: string };
type WcOrder = {
  id: number; number: string; status: string; date_created_gmt: string; date_modified_gmt: string; date_paid_gmt: string | null;
  total: string; total_tax: string; discount_total: string; shipping_total: string; payment_method: string; payment_method_title: string;
  customer_note: string; billing: WcAddress; shipping: WcAddress;
  line_items: { name: string; quantity: number; total: string; total_tax: string; sku: string; image?: { src: string }; meta_data: { display_key: string; display_value: unknown }[] }[];
  meta_data: { key: string; value: unknown }[];
};

function wcAuth(site: Site) {
  return `Basic ${Buffer.from(site.anahtar ?? "").toString("base64")}`;
}
async function wcRequest(site: Site, path: string, init?: RequestInit) {
  const res = await fetch(`${base(site)}/wp-json/wc/v3${path}`, {
    ...init,
    headers: { Authorization: wcAuth(site), "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`WooCommerce: ${(data as { message?: string } | null)?.message ?? `HTTP ${res.status}`}`);
  return data;
}

const n = (v: string | number | null | undefined) => Math.round(Number(v ?? 0) * 100) / 100;
const fullName = (a: WcAddress) => [a.first_name, a.last_name].filter(Boolean).join(" ").trim();
const metaOf = (o: WcOrder, ...keys: string[]) => {
  for (const k of keys) {
    const m = o.meta_data?.find((x) => x.key === k);
    if (m && m.value) return String(m.value);
  }
  return null;
};

function wcToOrder(site: Site, o: WcOrder, notes: { note: string; customer_note: boolean; author?: string; date_created_gmt: string }[]): SiteOrder {
  const b = o.billing;
  const s = o.shipping;
  const kdv = n(o.total_tax);
  return {
    no: o.number || String(o.id),
    disId: String(o.id),
    durum: o.status,
    odemeYontemi: o.payment_method,
    odemeYontemiAd: o.payment_method_title,
    odemeDurumu: o.date_paid_gmt ? "odendi" : "bekliyor",
    musteri: {
      ad: fullName(b) || b.company, eposta: b.email ?? "", telefon: b.phone ?? "", il: b.state || b.city, ilce: b.city,
      adres: [b.address_1, b.address_2, b.postcode].filter(Boolean).join(" "), faturaTipi: b.company ? "kurumsal" : "bireysel",
      firma: b.company || null, vergiDairesi: metaOf(o, "_billing_tax_office", "billing_tax_office", "_vergi_dairesi"), vergiNo: metaOf(o, "_billing_tax_number", "billing_tax_number", "_vergi_no", "_billing_tc"),
    },
    teslimat: s && (s.address_1 || s.city) ? { ad: fullName(s) || fullName(b), adres: [s.address_1, s.address_2, s.postcode].filter(Boolean).join(" "), il: s.state || s.city, ilce: s.city, telefon: s.phone ?? "" } : null,
    musteriNotu: o.customer_note || null,
    araToplam: n(o.total) - kdv,
    indirim: n(o.discount_total),
    kdv,
    toplam: n(o.total),
    kargoUcreti: n(o.shipping_total),
    kargo: { firma: null, takipNo: metaOf(o, "_tracking_number", "tracking_number", "_kargo_takip_no"), gonderim: null },
    kalemler: o.line_items.map((li) => {
      const total = n(li.total) + n(li.total_tax);
      const secenekler: Record<string, string> = {};
      for (const m of li.meta_data ?? []) if (m.display_key && !m.display_key.startsWith("_") && typeof m.display_value !== "object") secenekler[m.display_key] = String(m.display_value).replace(/<[^>]+>/g, "");
      if (li.sku) secenekler["Stok kodu"] = li.sku;
      return { ad: li.name, adet: li.quantity, birim: li.quantity ? Math.round((total / li.quantity) * 100) / 100 : total, secenekler, gorsel: li.image?.src || null };
    }),
    gecmis: notes
      .slice()
      .reverse()
      .map((x) => ({ durum: null, mesaj: x.note.replace(/<[^>]+>/g, ""), gorunur: x.customer_note, kim: x.author === "system" || !x.author ? "system" : "admin", kimAd: x.author ?? null, tarih: `${x.date_created_gmt}Z` })),
    dosyalar: [],
    linkler: { yonetim: `${base(site)}/wp-admin/post.php?post=${o.id}&action=edit` },
    olusturma: `${o.date_created_gmt}Z`,
    guncelleme: `${o.date_modified_gmt}Z`,
  };
}

async function wcVocabulary(site: Site): Promise<Vocabulary> {
  const [statuses, gateways] = await Promise.all([
    wcRequest(site, "/reports/orders/totals").catch(() => []) as Promise<{ slug: string; name: string }[]>,
    wcRequest(site, "/payment_gateways").catch(() => []) as Promise<{ id: string; title: string; enabled: boolean }[]>,
  ]);
  const TR: Record<string, string> = { pending: "Ödeme bekleniyor", processing: "Hazırlanıyor", "on-hold": "Beklemede", completed: "Tamamlandı", cancelled: "İptal edildi", refunded: "İade edildi", failed: "Başarısız" };
  return {
    durumlar: (statuses.length ? statuses : Object.keys(TR).map((slug) => ({ slug, name: slug }))).map((x) => ({ key: x.slug, label: TR[x.slug] ?? x.name })),
    odemeDurumlari: [],
    odemeYontemleri: gateways.filter((g) => g.enabled).map((g) => ({ key: g.id, label: g.title })),
    kargolar: [],
  };
}

async function wcFetch(site: Site, since: string | null) {
  const q = new URLSearchParams({ per_page: "30", orderby: "modified", order: "asc", dates_are_gmt: "true" });
  if (since) q.set("modified_after", since.replace(/Z$/, ""));
  const list = (await wcRequest(site, `/orders?${q}`)) as WcOrder[];
  const orders: SiteOrder[] = [];
  for (const o of list) {
    const notes = ((await wcRequest(site, `/orders/${o.id}/notes`).catch(() => [])) as { note: string; customer_note: boolean; author?: string; date_created_gmt: string }[]) ?? [];
    orders.push(wcToOrder(site, o, notes));
  }
  return { orders, vocab: await wcVocabulary(site), cursor: orders.at(-1)?.guncelleme ?? since };
}

/** WooCommerce'e işlem: durum PUT, diğerleri sipariş notu (WooCommerce'te ayrı ödeme/kargo alanı yok) */
async function wcAction(site: Site, disId: string, a: SiteAction, kim: string) {
  if (a.islem === "durum") {
    await wcRequest(site, `/orders/${disId}`, { method: "PUT", body: JSON.stringify({ status: a.durum }) });
    if (a.mesaj) await wcRequest(site, `/orders/${disId}/notes`, { method: "POST", body: JSON.stringify({ note: `${a.mesaj} (${kim})`, customer_note: !!a.bildir }) });
  } else if (a.islem === "not") {
    await wcRequest(site, `/orders/${disId}/notes`, { method: "POST", body: JSON.stringify({ note: `${a.mesaj} (${kim})`, customer_note: !!a.gorunur }) });
  } else if (a.islem === "kargo") {
    await wcRequest(site, `/orders/${disId}/notes`, { method: "POST", body: JSON.stringify({ note: `Kargo: ${a.kargoFirma}${a.takipNo ? ` · takip no ${a.takipNo}` : ""} (${kim})`, customer_note: !!a.bildir }) });
  } else {
    throw new Error("WooCommerce'te ödeme durumu ayrı değiştirilemez; sipariş durumunu kullanın.");
  }
  const o = (await wcRequest(site, `/orders/${disId}`)) as WcOrder;
  const notes = (await wcRequest(site, `/orders/${disId}/notes`).catch(() => [])) as { note: string; customer_note: boolean; author?: string; date_created_gmt: string }[];
  return wcToOrder(site, o, notes);
}

/* ───────────── kayıt ───────────── */

/** Siparişin panel görünümü (teklif ekranlarıyla aynı kalem gösterimi için PdfData biçimi) */
function toVeri(site: Site, o: SiteOrder): PdfData {
  const kalemler = o.kalemler.map((k) => ({
    ad: k.ad,
    alt: Object.entries(k.secenekler).map(([a, b]) => `${a}: ${b}`).join(" · "),
    adet: k.adet, birim: k.birim, isk: "", tutar: k.birim * k.adet, img: k.gorsel, parcalar: [],
  }));
  if (o.kargoUcreti) kalemler.push({ ad: "Kargo", alt: "", adet: 1, birim: o.kargoUcreti, isk: "", tutar: o.kargoUcreti, img: null, parcalar: [] });
  return {
    no: o.no, tarih: new Date(o.olusturma).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" }), gecerlilik: "", hazirlayan: site.ad,
    musteri: o.musteri.firma || o.musteri.ad, yetkili: o.musteri.firma ? o.musteri.ad : "", iletisim: [o.musteri.telefon, o.musteri.eposta].filter(Boolean).join(" · "),
    modeAd: "Site", toptan: false, vatOn: true, gorsel: true, kalemler,
    araListe: o.araToplam, satirIsk: 0, genelIsk: o.indirim, genelIskEtiket: o.indirim ? "(site indirimi)" : "",
    araToplam: o.toplam - o.kdv, kdv: o.kdv, genelToplam: o.toplam, uyarilar: [], notlar: [], dosyaAdi: "",
  } as unknown as PdfData;
}

/** Müşteri: e-posta ya da telefonla eşleşen kayıt; yoksa ortak havuza açılır (sahibi yok, geldiği marka sitenin markası) */
async function customerFor(site: Site, o: SiteOrder) {
  const m = o.musteri;
  const conds = [m.eposta ? eq(musteriler.eposta, m.eposta) : undefined, m.telefon ? eq(musteriler.telefon, m.telefon) : undefined].filter(Boolean);
  if (conds.length) {
    const [found] = await db().select({ id: musteriler.id }).from(musteriler).where(or(...conds)).limit(1);
    if (found) return found.id;
  }
  const [r] = await db()
    .insert(musteriler)
    .values({
      firma: (m.firma || m.ad || "Site müşterisi").slice(0, 200), yetkili: m.firma ? m.ad.slice(0, 120) : null, telefon: m.telefon || null, eposta: m.eposta || null,
      vergiDairesi: m.vergiDairesi, vergiNo: m.vergiNo, il: m.il || null, adres: [m.adres, m.ilce, m.il].filter(Boolean).join(" · ") || null,
      markaId: site.markaId, olusturan: `Site: ${site.ad}`,
    })
    .$returningId();
  return r.id;
}

/** Siparişi panelde oluşturur ya da günceller (site + site sipariş no eşsiz) */
async function upsert(site: Site, o: SiteOrder, vocab?: Vocabulary | null) {
  // Ödeme yönteminin sitedeki adı ("havale" → "Havale / EFT")
  const yontem = o.odemeYontemiAd || vocab?.odemeYontemleri.find((m) => m.key === o.odemeYontemi)?.label || o.odemeYontemi || "";
  const values = {
    disDurum: o.durum, durum: panelStatus(site, o.durum), odemeYontemi: yontem.slice(0, 80), odemeDurumu: o.odemeDurumu,
    musteriAdi: (o.musteri.firma || o.musteri.ad).slice(0, 200), tutarKdvHaric: o.toplam - o.kdv, tutarKdvDahil: o.toplam,
    veri: JSON.stringify(toVeri(site, o)), siteVeri: JSON.stringify(o), disTarih: new Date(o.olusturma),
  };
  const [ex] = await db().select({ id: siparisler.id }).from(siparisler).where(and(eq(siparisler.siteId, site.id), eq(siparisler.disNo, o.no)));
  if (ex) {
    await db().update(siparisler).set(values).where(eq(siparisler.id, ex.id));
    return ex.id;
  }
  const musteriId = await customerFor(site, o);
  // Panel numarası sitenin numarasıdır; başka bir siparişte kullanılıyorsa sitenin kısa adıyla ayrılır
  const [clash] = await db().select({ id: siparisler.id }).from(siparisler).where(eq(siparisler.no, o.no));
  const d = new Date(o.olusturma);
  const [r] = await db()
    .insert(siparisler)
    .values({
      ...values, no: clash ? `${o.no}-${site.id}` : o.no, yil: d.getFullYear(), sira: 0, kaynak: "site", siteId: site.id, disNo: o.no,
      markaId: site.markaId, musteriId, kullaniciId: null,
    })
    .$returningId();
  return r.id;
}

/* ───────────── çekme ───────────── */

/** Bir sitenin yeni/değişen siparişlerini çeker; imleç kaldığı yerden ilerler */
export async function syncSite(siteId: number) {
  const [site] = await db().select().from(sites).where(eq(sites.id, siteId));
  if (!site) throw new Error("Bağlantı bulunamadı.");
  await db().update(sites).set({ sonDeneme: new Date() }).where(eq(sites.id, site.id));
  let cursor = site.imlec;
  let count = 0;
  try {
    for (let page = 0; page < 20; page++) {
      const { orders, vocab, cursor: next } = site.tur === "gazebotente" ? await gtFetch(site, cursor) : await wcFetch(site, cursor);
      if (page === 0) await db().update(sites).set({ sozluk: JSON.stringify(vocab) }).where(eq(sites.id, site.id));
      for (const o of orders) await upsert(site, o, vocab);
      count += orders.length;
      cursor = next;
      await db().update(sites).set({ imlec: cursor }).where(eq(sites.id, site.id));
      if (orders.length < (site.tur === "gazebotente" ? 50 : 30)) break;
    }
    await db().update(sites).set({ sonBasari: new Date(), sonHata: null }).where(eq(sites.id, site.id));
    return { ok: true as const, count };
  } catch (e) {
    const hata = e instanceof Error ? (e.name === "TimeoutError" ? "Site zamanında yanıt vermedi." : e.message) : "Bilinmeyen hata";
    await db().update(sites).set({ sonHata: hata.slice(0, 1000) }).where(eq(sites.id, site.id));
    return { ok: false as const, hata, count };
  }
}

/** Son denemesi maxAge saniyeden eski olan aktif siteleri çeker (sayfa açılışlarında arka planda) */
export async function syncStale(maxAgeSec = 90) {
  const list = await db()
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.aktif, true), or(sql`${sites.sonDeneme} IS NULL`, sql`${sites.sonDeneme} < NOW() - INTERVAL ${maxAgeSec} SECOND`)));
  for (const s of list) await syncSite(s.id);
}

/** Paneldeki işlemi siteye yazar; başarılıysa siparişin panel kaydı sitenin güncel haliyle yenilenir */
export async function pushAction(orderId: number, a: SiteAction, kim: string) {
  const [o] = await db().select({ siteId: siparisler.siteId, disNo: siparisler.disNo, siteVeri: siparisler.siteVeri }).from(siparisler).where(eq(siparisler.id, orderId));
  if (!o?.siteId || !o.disNo) throw new Error("Bu sipariş bir siteden gelmedi.");
  const [site] = await db().select().from(sites).where(eq(sites.id, o.siteId));
  if (!site) throw new Error("Site bağlantısı bulunamadı.");
  let fresh: SiteOrder | null;
  if (site.tur === "gazebotente") {
    const r = (await gtRequest(site, `/api/panel/siparisler/${encodeURIComponent(o.disNo)}/`, { method: "POST", body: JSON.stringify({ ...a, kim }) })) as { siparis: SiteOrder | null };
    fresh = r.siparis;
  } else {
    const disId = (JSON.parse(o.siteVeri ?? "{}") as SiteOrder).disId;
    if (!disId) throw new Error("WooCommerce sipariş kimliği eksik.");
    fresh = await wcAction(site, disId, a, kim);
  }
  if (fresh) await upsert(site, fresh, site.sozluk ? (JSON.parse(site.sozluk) as Vocabulary) : null);
}

/* ───────────── bağlantılar ───────────── */

export async function listSites() {
  const rows = await db()
    .select({
      s: sites, marka: schema.markalar.ad, markaRenk: schema.markalar.renk,
      siparis: sql<number>`(SELECT COUNT(*) FROM siparisler AS s2 WHERE s2.site_id = site_baglantilari.id)`.mapWith(Number),
    })
    .from(sites)
    .leftJoin(schema.markalar, eq(schema.markalar.id, sites.markaId))
    .orderBy(asc(sites.id));
  return rows.map((r) => ({ ...r.s, anahtar: undefined, anahtarVar: !!r.s.anahtar, marka: r.marka, markaRenk: r.markaRenk, siparis: r.siparis }));
}

export async function vocabularyOf(siteId: number): Promise<Vocabulary | null> {
  const [s] = await db().select({ sozluk: sites.sozluk }).from(sites).where(eq(sites.id, siteId));
  return s?.sozluk ? (JSON.parse(s.sozluk) as Vocabulary) : null;
}

export type SiteInput = { id: number | null; markaId: number; tur: string; ad: string; adres: string; anahtar: string; aktif: boolean };

/** Bağlantı ekle/düzenle (yönetici). Anahtar boş bırakılırsa eskisi korunur. Adres değişirse baştan çekilir. */
export async function saveSite(i: SiteInput): Promise<{ ok: true; id: number } | { ok: false; hata: string }> {
  const ad = i.ad.trim().slice(0, 120);
  const adres = i.adres.trim().replace(/\/+$/, "");
  if (!ad) return { ok: false, hata: "Bağlantı adı gerekli." };
  if (!/^https?:\/\/[^\s/]+/.test(adres)) return { ok: false, hata: "Site adresini https:// ile yazın." };
  const tur = i.tur === "woocommerce" ? ("woocommerce" as const) : ("gazebotente" as const);
  const anahtar = i.anahtar.trim();
  if (tur === "woocommerce" && anahtar && !/^ck_[\w]+:cs_[\w]+$/.test(anahtar)) return { ok: false, hata: "WooCommerce anahtarını ck_…:cs_… biçiminde yazın." };
  const values = { markaId: i.markaId, tur, ad, adres, aktif: !!i.aktif, ...(anahtar ? { anahtar } : {}) };
  if (i.id) {
    const [old] = await db().select({ adres: sites.adres }).from(sites).where(eq(sites.id, i.id));
    if (!old) return { ok: false, hata: "Bağlantı bulunamadı." };
    await db().update(sites).set({ ...values, ...(old.adres !== adres ? { imlec: null } : {}) }).where(eq(sites.id, i.id));
    return { ok: true, id: i.id };
  }
  if (!anahtar) return { ok: false, hata: "Anahtar gerekli." };
  const [r] = await db().insert(sites).values(values).$returningId();
  return { ok: true, id: r.id };
}

/** Bağlantı testi: anahtarla tek sipariş istenir */
export async function testSite(siteId: number) {
  const [site] = await db().select().from(sites).where(eq(sites.id, siteId));
  if (!site) return { ok: false as const, hata: "Bağlantı bulunamadı." };
  try {
    if (site.tur === "gazebotente") await gtRequest(site, "/api/panel/siparisler/?limit=1");
    else await wcRequest(site, "/orders?per_page=1");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, hata: e instanceof Error ? e.message : "Bağlanılamadı." };
  }
}
