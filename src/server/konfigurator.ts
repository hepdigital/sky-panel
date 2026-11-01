import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { SZ, gzRows, gzTotal, imgSrc, val } from "@/lib/terminal/calc";
import { withPriceTable } from "@/lib/terminal/price-table";
import { KONF_EK_KATEGORI, KONF_KDV, KONF_MODE, cleanConfig, cleanExtras, ekSizes, summaryLines, type KonfEk } from "@/lib/konfigurator";
import { getCatalog } from "./catalog";
import { listColors } from "./colors";
import { db, schema } from "./db";
import { saveWebp } from "./files";
import { gazeboTables } from "./gazebo-prices";
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
  ekler?: { kod: string; baslik: string; fiyat: number; adet: number; gorsel: string | null }[];
};

const publicUrl = (path: string) => (/^https?:\/\//.test(path) ? path : `${(process.env.PUBLIC_URL ?? "").replace(/\/+$/, "")}${path}`);

/** Markanın ek ürünleri: teklif ürünlerinde KONF_EK_KATEGORI kategorilerindeki, perakende fiyatı olan, renk seçimsiz ürünler */
export async function konfExtras(markaId: number): Promise<KonfEk[]> {
  const catalog = await getCatalog(markaId);
  const lower = (x: string) => x.toLocaleLowerCase("tr-TR");
  return KONF_EK_KATEGORI.flatMap((ad) =>
    catalog
      .filter((g) => lower(g.nav) === lower(ad))
      .flatMap((g) =>
        g.items.flatMap((it) => {
          const fiyat = val(it.p, KONF_MODE);
          if (it.hidden || it.renk || fiyat === null || fiyat <= 0) return [];
          return [{ kod: it.id, grup: g.nav, ad: it.n, aciklama: it.s, gorsel: it.img ? imgSrc(it.img) : null, uyari: it.warn, fiyat, olculer: ekSizes(`${it.n} ${it.s}`) }];
        }),
      ),
  );
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
    ekler: r.ekler.map((x) => ({ kod: x.ek.kod, baslik: x.ek.ad, fiyat: Math.round(x.ek.fiyat * 100) / 100, adet: x.adet, gorsel: x.ek.gorsel ? publicUrl(x.ek.gorsel) : null })),
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
      return;
    } catch (e) {
      // Aynı anda gelen iki kayıt aynı kimliği almışsa yeniden dene
      if (i >= 2 || !/dup/i.test(String((e as { cause?: unknown }).cause ?? e))) throw e;
    }
  }
}
