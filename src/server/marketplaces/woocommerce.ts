import "server-only";
import type { schema } from "../db";

// WooCommerce REST (wc/v3): sipariş eşitlemesi (sites.ts) ve ürün bağlantısı (listing.ts) aynı istekle çalışır.
// Ürün tarafı: siteden ürün/varyant arama ve fiyat okuma (fiyatlar her zaman KDV dahil döner); fiyat yazma yalnızca kanal ayarında açıksa (fiyatYaz).
// Başlık, görsel, açıklama ve stok siteye yazılmaz.

type Site = typeof schema.siteBaglantilari.$inferSelect;

const TIMEOUT = 20_000;
const base = (site: Site) => site.adres.replace(/\/+$/, "");

export async function wcRequest(site: Site, path: string, init?: RequestInit) {
  const res = await fetch(`${base(site)}/wp-json/wc/v3${path}`, {
    ...init,
    headers: { Authorization: `Basic ${Buffer.from(site.anahtar ?? "").toString("base64")}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`WooCommerce: ${(data as { message?: string } | null)?.message ?? `HTTP ${res.status}`}`);
  return data;
}

type WcProduct = {
  id: number; name: string; sku: string; type: string; status: string; permalink: string; price: string; regular_price: string;
  tax_status: string; tax_class: string; images: { src: string }[]; variations: number[];
};
type WcVariation = {
  id: number; sku: string; price: string; regular_price: string; tax_status: string; tax_class: string;
  attributes: { name: string; option: string }[]; image?: { src: string } | null;
};

const decode = (s: string) =>
  s.replace(/&#(\d+);/g, (_, c: string) => String.fromCharCode(Number(c))).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const price = (v: string) => (v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const variationName = (v: WcVariation) => v.attributes.map((a) => a.option).join(" · ") || `#${v.id}`;

/** Sitenin vergi ayarı: fiyatlar KDV dahil mi girilmiş (okunamazsa dahil sayılır) ve vergi sınıfı → oran */
type Tax = { dahil: boolean; oran: Map<string, number> };
const taxCache = new Map<number, Tax & { t: number }>();
async function siteTax(site: Site): Promise<Tax> {
  const c = taxCache.get(site.id);
  if (c && Date.now() - c.t < 3600_000) return c;
  const r = (await wcRequest(site, "/settings/tax/woocommerce_prices_include_tax").catch(() => null)) as { value?: string } | null;
  const dahil = r?.value !== "no";
  const oran = new Map<string, number>();
  if (!dahil) {
    const rates = ((await wcRequest(site, "/taxes?per_page=100").catch(() => [])) as { rate: string; class: string; country: string }[]) ?? [];
    for (const x of [...rates].sort((a, b) => Number(b.country === "TR") - Number(a.country === "TR"))) if (!oran.has(x.class)) oran.set(x.class, Number(x.rate) || 0);
  }
  taxCache.set(site.id, { dahil, oran, t: Date.now() });
  return { dahil, oran };
}

export async function wcPricesIncludeTax(site: Site) {
  return (await siteTax(site)).dahil;
}

/** Sitede kayıtlı fiyatı KDV dahil verir (müşterinin gördüğü); sınıfın oranı bilinmiyorsa %20 */
function gross(tax: Tax, v: string, p: { tax_status: string; tax_class: string }, parentClass = "") {
  const n = price(v);
  if (n === null || tax.dahil || p.tax_status === "none") return n;
  const cls = (p.tax_class === "parent" ? parentClass : p.tax_class) || "standard";
  return Math.round(n * (1 + (tax.oran.get(cls) ?? 20) / 100) * 100) / 100;
}

export type WcSearchRow = { id: number; ad: string; sku: string; varyantli: boolean; fiyat: number | null; link: string; gorsel: string | null; durum: string };

/** Ürün arama (ad ya da stok kodu): her durumdaki ürünler, en çok 20 */
export async function wcSearch(site: Site, q: string): Promise<WcSearchRow[]> {
  const tax = await siteTax(site);
  const list = (await wcRequest(site, `/products?per_page=20&status=any&search=${encodeURIComponent(q)}`)) as WcProduct[];
  // Arama stok kodunu kapsamaz: tam stok kodu eşleşmesi ayrıca sorulur
  const bySku = /^\S{2,}$/.test(q) ? ((await wcRequest(site, `/products?per_page=5&status=any&sku=${encodeURIComponent(q)}`).catch(() => [])) as WcProduct[]) : [];
  const seen = new Set<number>();
  return [...bySku, ...list]
    .filter((p) => !seen.has(p.id) && seen.add(p.id))
    .map((p) => ({ id: p.id, ad: decode(p.name), sku: p.sku, varyantli: p.type === "variable", fiyat: gross(tax, p.price, p), link: p.permalink, gorsel: p.images[0]?.src ?? null, durum: p.status }));
}

export async function wcVariations(site: Site, productId: number) {
  const tax = await siteTax(site);
  const list = (await wcRequest(site, `/products/${productId}/variations?per_page=100`)) as WcVariation[];
  const parent = !tax.dahil && list.some((v) => v.tax_class === "parent") ? ((await wcRequest(site, `/products/${productId}`)) as WcProduct).tax_class : "";
  return list.map((v) => ({ id: v.id, ad: variationName(v), sku: v.sku, fiyat: gross(tax, v.price, v, parent) }));
}

/** Bağlı ürün/varyantların sitedeki adı ve fiyatı; anahtar "ürün:varyant" (varyantsızda 0) */
export async function wcCurrent(site: Site, refs: { urunId: number; varyantId: number | null }[]) {
  const tax = await siteTax(site);
  const out = new Map<string, { ad: string; fiyat: number | null }>();
  const ids = [...new Set(refs.map((r) => r.urunId))];
  const names = new Map<number, string>();
  const classes = new Map<number, string>();
  for (let i = 0; i < ids.length; i += 100) {
    const list = (await wcRequest(site, `/products?per_page=100&status=any&include=${ids.slice(i, i + 100).join(",")}`)) as WcProduct[];
    for (const p of list) {
      names.set(p.id, decode(p.name));
      classes.set(p.id, p.tax_class);
      out.set(`${p.id}:0`, { ad: decode(p.name), fiyat: gross(tax, p.price, p) });
    }
  }
  for (const pid of [...new Set(refs.filter((r) => r.varyantId).map((r) => r.urunId))]) {
    const want = refs.filter((r) => r.urunId === pid && r.varyantId).map((r) => r.varyantId!);
    const list = (await wcRequest(site, `/products/${pid}/variations?per_page=100&include=${want.join(",")}`)) as WcVariation[];
    for (const v of list) out.set(`${pid}:${v.id}`, { ad: `${names.get(pid) ?? ""} · ${variationName(v)}`, fiyat: gross(tax, v.price, v, classes.get(pid)) });
  }
  return out;
}

/**
 * Fiyat yazar (indirimli fiyat temizlenir: paneldeki fiyat geçerli olur). Basit ürünler tek toplu istekte,
 * varyantlar ana ürün başına toplu istekte. fiyat KDV dahildir; site KDV hariç fiyat bekliyorsa çevrilir.
 */
export async function wcSetPrices(site: Site, updates: { urunId: number; varyantId: number | null; fiyat: number; kdv: number }[]) {
  const dahil = await wcPricesIncludeTax(site);
  const value = (u: (typeof updates)[number]) => String(dahil ? u.fiyat : Math.round((u.fiyat / (1 + u.kdv / 100)) * 100) / 100);
  // Toplu istek 200 döner, hatalı kalem kendi içinde "error" taşır
  const check = (r: unknown) => {
    const bad = ((r as { update?: { id: number; error?: { message: string } }[] } | null)?.update ?? []).filter((x) => x.error);
    if (bad.length) throw new Error(`WooCommerce: ${bad.map((x) => `#${x.id} ${x.error!.message}`).join("; ")}`);
  };
  const simple = updates.filter((u) => !u.varyantId);
  for (let i = 0; i < simple.length; i += 100) {
    check(await wcRequest(site, "/products/batch", {
      method: "POST",
      body: JSON.stringify({ update: simple.slice(i, i + 100).map((u) => ({ id: u.urunId, regular_price: value(u), sale_price: "" })) }),
    }));
  }
  for (const pid of [...new Set(updates.filter((u) => u.varyantId).map((u) => u.urunId))]) {
    const vs = updates.filter((u) => u.urunId === pid && u.varyantId);
    check(await wcRequest(site, `/products/${pid}/variations/batch`, {
      method: "POST",
      body: JSON.stringify({ update: vs.map((u) => ({ id: u.varyantId, regular_price: value(u), sale_price: "" })) }),
    }));
  }
}

export type WcDetail = {
  id: number; ad: string; sku: string; varyantli: boolean; aciklama: string; gorseller: string[]; fiyat: number | null;
  varyantlar: { id: number; ad: string; sku: string; fiyat: number | null; nitelikler: { ad: string; deger: string }[]; gorsel: string | null }[];
};

/** HTML açıklamayı düz metne çevirir (paragraflar boş satırla) */
const plain = (html: string) =>
  decode(
    html
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/\s*(p|div|li|h\d)\s*>/gi, "\n\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Siteden karta aktarım için ürün ayrıntısı: açıklama, görseller ve varyantlar (yalnızca okuma) */
export async function wcProduct(site: Site, id: number): Promise<WcDetail> {
  const tax = await siteTax(site);
  const p = (await wcRequest(site, `/products/${id}`)) as WcProduct & { description: string; short_description: string };
  const list = p.type === "variable" ? ((await wcRequest(site, `/products/${id}/variations?per_page=100`)) as WcVariation[]) : [];
  return {
    id: p.id, ad: decode(p.name), sku: p.sku, varyantli: p.type === "variable", aciklama: plain(p.description || p.short_description || ""),
    gorseller: p.images.map((g) => g.src).filter((g) => g.startsWith("https://")).slice(0, 8), fiyat: gross(tax, p.price, p),
    varyantlar: list.map((v) => ({
      id: v.id, ad: variationName(v), sku: v.sku, fiyat: gross(tax, v.price, v, p.tax_class),
      nitelikler: v.attributes.map((a) => ({ ad: a.name, deger: a.option })), gorsel: v.image?.src?.startsWith("https://") ? v.image.src : null,
    })),
  };
}
