import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { SZ, gzRows, gzTotal, imgSrc, val, type Gazebo } from "@/lib/terminal/calc";
import { withPriceTable } from "@/lib/terminal/price-table";
import type { Wall } from "@/modules/gazebo/walls";
import { KONF_EK_KATEGORI, KONF_KDV, KONF_MODE, cleanConfig, cleanExtras, ekSizes, summaryLines, type KonfEk } from "@/lib/konfigurator";
import { getCatalog } from "./catalog";
import { listColors } from "./colors";
import { db, schema } from "./db";
import { saveWebp } from "./files";
import { gazeboTables } from "./gazebo-prices";
import { wcRequest, wcVariations } from "./marketplaces/woocommerce";
import { notify, sellers } from "./push";
import { ensureRequestTable } from "./site-requests";

// Site konfigüratörünün sepeti: tarayıcıdan gelen tasarım sunucuda yeniden doğrulanıp fiyatlanır ve imzalanır.
// Site (WordPress eklentisi) imzayı ortak anahtarla (KONFIGURATOR_SECRET) doğrular; fiyata tarayıcıdan dokunulamaz.
// Biçim: base64url(JSON) + "." + base64url(HMAC-SHA256). Geçerlilik 2 saat (sepete eklenene kadar).

const TTL = 2 * 3600;
const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export type KonfPayload = {
  v: 1;
  /** Tek kullanımlık kimlik (aynı tasarım iki kez eklenirse ayrı satır) */
  n: string;
  marka: string;
  exp: number;
  baslik: string;
  /** Birim fiyat, KDV hariç (WooCommerce'te fiyatlar KDV hariç girili) */
  fiyat: number;
  kdv: number;
  adet: number;
  satirlar: { ad: string; deger: string }[];
  parcalar: { ad: string; fiyat: number }[];
  gorsel: string | null;
  cfg: unknown;
  /** Son adımda seçilen ek ürünler (teklif ürünleri): sepette ayrı satır; adet gazebo adedinden bağımsız */
  ekler?: { kod: string; baslik: string; fiyat: number; adet: number; gorsel: string | null; woo?: { urun: number; varyasyon: number } }[];
};

const publicUrl = (path: string) => (/^https?:\/\//.test(path) ? path : `${(process.env.PUBLIC_URL ?? "").replace(/\/+$/, "")}${path}`);

/** Markanın ek ürünleri: teklif ürünlerinde KONF_EK_KATEGORI kategorilerindeki, perakende fiyatı olan, renk seçimsiz ürünler + sitedeki WooCommerce ürünleri */
export async function konfExtras(markaId: number): Promise<KonfEk[]> {
  const [catalog, woo] = await Promise.all([getCatalog(markaId), wooExtras(markaId)]);
  const lower = (x: string) => x.toLocaleLowerCase("tr-TR");
  const list = KONF_EK_KATEGORI.flatMap((ad) =>
    catalog
      .filter((g) => lower(g.nav) === lower(ad))
      .flatMap((g) =>
        g.items.flatMap((it) => {
          const fiyat = val(it.p, KONF_MODE);
          if (it.hidden || it.renk || fiyat === null || fiyat <= 0) return [];
          return [{ kod: it.id, grup: g.nav, ad: it.n, aciklama: it.s, gorsel: it.img ? imgSrc(it.img) : null, uyari: it.warn, fiyat, olculer: ekSizes(`${it.n} ${it.s}`) } as KonfEk];
        }),
      ),
  );
  const rank = (grup: string) => KONF_EK_KATEGORI.findIndex((k) => lower(k) === lower(grup));
  return [...list, ...woo].sort((a, b) => rank(a.grup) - rank(b.grup));
}

/**
 * Sitede satılan ürünler (ör. taşıma çantası): sepete sitedeki asıl ürün (varyasyon) eklenir, fiyat ve stok sitenin.
 * Fiyat sipariş eşitlemesinin WooCommerce bağlantısından okunur (KDV dahil); 10 dakika bellekte tutulur.
 */
const WOO_EK: Record<string, { urun: number; grup: string }[]> = {
  sky: [{ urun: 16206, grup: "Taşıma Çantası" }],
};
const wooCache = new Map<number, { at: number; list: KonfEk[] }>();

async function wooExtras(markaId: number): Promise<KonfEk[]> {
  const hit = wooCache.get(markaId);
  if (hit && Date.now() - hit.at < 600_000) return hit.list;
  const sites = schema.siteBaglantilari;
  const [row] = await db()
    .select({ kod: schema.markalar.kod, site: sites })
    .from(schema.markalar)
    .innerJoin(sites, and(eq(sites.markaId, schema.markalar.id), eq(sites.tur, "woocommerce")))
    .where(eq(schema.markalar.id, markaId))
    .orderBy(sql`${sites.aktif} DESC`, sites.id)
    .limit(1);
  const urunler = row ? (WOO_EK[row.kod] ?? []) : [];
  if (!urunler.length) return [];
  try {
    const lists = await Promise.all(
      urunler.map(async ({ urun, grup }) => {
        const [parent, vars] = await Promise.all([
          wcRequest(row!.site, `/products/${urun}`) as Promise<{ name: string; images: { src: string }[] }>,
          wcVariations(row!.site, urun),
        ]);
        const ad = parent.name.replace(/&#\d+;/g, "").trim();
        return vars.flatMap((v) => {
          const olculer = ekSizes(v.ad);
          if (!olculer || !(v.fiyat && v.fiyat > 0)) return [];
          const fiyat = Math.round((v.fiyat / (1 + KONF_KDV / 100)) * 100) / 100;
          return [{ kod: `woo-${v.id}`, grup, ad, aciklama: `${olculer[0].replace(".", ",")} m gazeboya uygun`, gorsel: parent.images[0]?.src ?? null, fiyat, olculer, woo: { urun, varyasyon: v.id } } as KonfEk];
        });
      }),
    );
    const list = lists.flat();
    wooCache.set(markaId, { at: Date.now(), list });
    return list;
  } catch (e) {
    console.error("[konfigurator] site ürünleri okunamadı", e);
    return hit?.list ?? [];
  }
}

async function brandOf(kod: string) {
  const [brand] = await db().select({ id: schema.markalar.id }).from(schema.markalar).where(eq(schema.markalar.kod, kod));
  if (!brand) throw new Error("Marka bulunamadı.");
  return brand;
}

/** Tasarımı ve ek ürünleri doğrular, fiyatlar (sepet bileti ve kayıt aynı kontrolden geçer) */
async function priceDesign(markaId: number, g: unknown, rawExtras: unknown) {
  const [tables, colors, extras] = await Promise.all([gazeboTables([markaId]), listColors(), konfExtras(markaId)]);
  const active = colors.filter((c) => c.aktif);
  const r = withPriceTable(tables[markaId], () => {
    const c = cleanConfig(g, active.map((x) => x.hex));
    if (!c.ok) return c;
    const rows = gzRows(c.g, KONF_MODE);
    if (rows.some((x) => x.bad)) return { ok: false as const, hata: "Seçimde fiyatı olmayan bir parça var." };
    return {
      ok: true as const,
      g: c.g,
      fiyat: gzTotal(c.g, KONF_MODE),
      parcalar: rows.map((x) => ({ ad: x.c || x.t, fiyat: x.v })),
      satirlar: summaryLines(c.g, (hex) => active.find((x) => x.hex === hex)?.ad ?? ""),
    };
  });
  if (!r.ok) throw new Error(r.hata);
  const ex = cleanExtras(rawExtras, extras, r.g.size);
  if (!ex.ok) throw new Error(ex.hata);
  return { ...r, ekler: ex.list };
}

/* ───────────── hazır tasarım linki ───────────── */

/**
 * Linkte taşınan tasarım (?tasarim=…): kısa metin, base64url. Alanlar "~" ile: ölçü, iskelet, kumaş, tavan rengi, duvar rengi,
 * dört duvar (Ön, Arka, Sol, Sağ; tip.pencere.kapı: v PVC, s sineklik, p perde), ek ürünler (kod*adet, "," ile), adet.
 * Duvarların kumaşı tavanınkiyle aynıdır (konfigüratör kuralı), ayrıca taşınmaz.
 */
export type KonfTasarim = { g: Gazebo; e?: Record<string, number>; a?: number };

const wallCode = (w: Wall) =>
  [w.kind, w.p ? `${w.p.pvc ? "v" : ""}${w.p.sineklik ? "s" : ""}${w.p.perde ? "p" : ""}` : "", w.k ? (w.k.sineklik ? "s" : "-") : ""].join(".").replace(/\.+$/, "");

function wallOf(code: string, f: number): Wall {
  const [kind, p, k] = code.split(".");
  return {
    kind: kind as Wall["kind"],
    f,
    ...(p ? { p: { pvc: p.includes("v"), sineklik: p.includes("s"), perde: p.includes("p") } } : {}),
    ...(k ? { k: { sineklik: k === "s" } } : {}),
  };
}

export function encodeDesign(t: KonfTasarim) {
  const g = t.g;
  const ek = Object.entries(t.e ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${k}*${n}`).join(",");
  const parts = [g.size, g.frame ?? "", g.roofFab ?? 0, (g.color ?? "").replace("#", ""), (g.wallColor ?? "").replace("#", ""), ...g.sides.map((s) => wallCode(s.walls[0])), ek, t.a ?? 1];
  return b64(parts.join("~"));
}

/**
 * Linkteki tasarımı çözer ve konfigüratörün kurallarıyla doğrular (satılmayan seçim ya da stokta olmayan renk → yok sayılır,
 * konfigüratör boş açılır). Fiyat yine ekranda hesaplanır; link fiyat taşımaz.
 */
export async function decodeDesign(markaId: number, raw: unknown) {
  if (typeof raw !== "string" || !/^[A-Za-z0-9_-]{10,1000}$/.test(raw)) return null;
  const f = Buffer.from(raw, "base64url").toString("utf8").split("~");
  if (f.length !== 11) return null;
  const fab = Number(f[2]);
  const hex = (v: string) => (/^[0-9a-f]{6}$/i.test(v) ? `#${v.toLowerCase()}` : undefined);
  const g = { size: f[0], frame: f[1] || null, roofFab: fab, color: hex(f[3]), wallColor: hex(f[4]), sides: f.slice(5, 9).map((c) => ({ walls: [wallOf(c, fab)] })) };
  const e = Object.fromEntries(f[9].split(",").filter(Boolean).map((x) => x.split("*")).map(([k, n]) => [k, Number(n)]));
  try {
    const r = await priceDesign(markaId, g, e);
    return { g: r.g, ekler: Object.fromEntries(r.ekler.map((x) => [x.ek.kod, x.adet])), adet: Math.max(1, Math.min(99, Math.round(Number(f[10]) || 1))) };
  } catch {
    return null;
  }
}

/** 3D görüntüsü (webp, data URL) kaydedilir: sepette, siparişte ve talepte küçük resim */
async function saveSnapshot(raw: unknown) {
  const m = typeof raw === "string" ? raw.match(/^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/) : null;
  if (!m || m[1].length >= 600_000) return null;
  const yol = await saveWebp("konfigurator", Buffer.from(m[1], "base64")).catch(() => null);
  return yol ? publicUrl(yol) : null;
}

export async function signCart(input: { marka: string; g: unknown; adet: unknown; ekler?: unknown; gorsel?: unknown }) {
  const secret = process.env.KONFIGURATOR_SECRET;
  if (!secret) throw new Error("Konfigüratör sepeti yapılandırılmamış.");
  const brand = await brandOf(String(input.marka));
  const r = await priceDesign(brand.id, input.g, input.ekler);
  const gorsel = await saveSnapshot(input.gorsel);

  const payload: KonfPayload = {
    v: 1,
    n: randomBytes(9).toString("base64url"),
    marka: String(input.marka),
    exp: Math.floor(Date.now() / 1000) + TTL,
    baslik: `Gazebo Çadır ${SZ[r.g.size]} m (Kendin Tasarla)`,
    fiyat: Math.round(r.fiyat * 100) / 100,
    kdv: KONF_KDV,
    adet: Math.max(1, Math.min(99, Math.round(Number(input.adet) || 1))),
    satirlar: r.satirlar,
    parcalar: r.parcalar,
    gorsel,
    cfg: r.g,
    ekler: r.ekler.map((x) => ({ kod: x.ek.kod, baslik: x.ek.ad, fiyat: Math.round(x.ek.fiyat * 100) / 100, adet: x.adet, gorsel: x.ek.gorsel ? publicUrl(x.ek.gorsel) : null, ...(x.ek.woo ? { woo: x.ek.woo } : {}) })),
  };
  const body = b64(JSON.stringify(payload));
  const sig = b64(createHmac("sha256", secret).update(body).digest());
  return { token: `${body}.${sig}`, payload };
}

/* ───────────── kayıt (satın almayan ziyaretçi) ───────────── */

/** Kaba sınır: aynı IP'den 10 dakikada en çok 5 kayıt (süreç belleğinde) */
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 600_000);
  list.push(now);
  if (hits.size > 5000) hits.clear();
  hits.set(ip, list);
  return list.length > 5;
}

/** Türkiye numarası: 10 hane (başında 0 ya da +90 olabilir) → "0532 123 45 67"; geçersizse null */
export function cleanPhone(raw: unknown) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("90") && d.length === 12) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  if (!/^[2-5]\d{9}$/.test(d)) return null;
  return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
}

/**
 * Ödemeye geçerken bırakılan telefon (ödeme tamamlanmazsa aranır): tasarım ve fiyatıyla panelde Talepler'e düşer (tür "konfigurator"). Talep markanın
 * WooCommerce bağlantısına yazılır; o sitenin talep eşitlemesi olmadığı için kimlik (dis_id) panelde sıralanır.
 */
export async function saveLead(input: { marka: string; g: unknown; adet: unknown; ekler?: unknown; gorsel?: unknown; telefon: unknown; ad?: unknown; ip: string }) {
  const telefon = cleanPhone(input.telefon);
  if (!telefon) throw new Error("Telefon numarasını kontrol edin (ör. 0532 123 45 67).");
  if (limited(input.ip)) throw new Error("Çok fazla deneme yapıldı, biraz sonra tekrar deneyin.");
  const brand = await brandOf(String(input.marka));
  const sites = schema.siteBaglantilari;
  const [site] = await db()
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.markaId, brand.id), eq(sites.tur, "woocommerce")))
    .orderBy(sql`${sites.aktif} DESC`, sites.id)
    .limit(1);
  if (!site) throw new Error("Kayıt şu an alınamıyor.");
  const r = await priceDesign(brand.id, input.g, input.ekler);
  const adet = Math.max(1, Math.min(99, Math.round(Number(input.adet) || 1)));
  const gorsel = await saveSnapshot(input.gorsel);
  const tl = (n: number) => `${Math.round(n * (1 + KONF_KDV / 100)).toLocaleString("tr-TR")} ₺`;
  const ekToplam = r.ekler.reduce((t, x) => t + x.ek.fiyat * x.adet, 0);
  const mesaj = [
    `Gazebo Çadır ${SZ[r.g.size]} m (Kendin Tasarla) · ${adet} adet · adedi ${tl(r.fiyat)}`,
    ...r.satirlar.map((x) => `${x.ad}: ${x.deger}`),
    ...(r.ekler.length ? ["", "Ek ürünler:", ...r.ekler.map((x) => `${x.adet} × ${x.ek.ad} · ${tl(x.ek.fiyat * x.adet)}`)] : []),
    "",
    `Toplam (KDV dahil): ${tl(r.fiyat * adet + ekToplam)}`,
    ...(gorsel ? [`Görsel: ${gorsel}`] : []),
  ].join("\n");
  const ad = String(input.ad ?? "").trim().slice(0, 120) || "Konfigüratör ziyaretçisi";
  const t = schema.siteTalepleri;
  await ensureRequestTable();
  for (let i = 0; ; i++) {
    const [last] = await db().select({ m: sql<number>`COALESCE(MAX(${t.disId}), 0)`.mapWith(Number) }).from(t).where(eq(t.siteId, site.id));
    try {
      await db().insert(t).values({ siteId: site.id, markaId: brand.id, disId: (last?.m ?? 0) + 1, tur: "konfigurator", turAd: "Gazebo tasarımı (ödemeye geçerken)", ad, eposta: "", telefon, mesaj, disTarih: new Date() });
      void notify("talep", sellers(brand.id), {
        title: "Konfigüratörde ödemeye geçti",
        body: `${ad} · ${telefon} · Gazebo ${SZ[r.g.size]} m · ${tl(r.fiyat * adet + ekToplam)}`,
        url: "/panel/siparisler",
      });
      return;
    } catch (e) {
      // Aynı anda gelen iki kayıt aynı kimliği almışsa yeniden dene
      if (i >= 2 || !/dup/i.test(String((e as { cause?: unknown }).cause ?? e))) throw e;
    }
  }
}
