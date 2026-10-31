import "server-only";
import type { schema } from "../db";

// WooCommerce REST (wc/v3): sipariş eşitlemesi (sites.ts) ve ürün bağlantısı (listing.ts) aynı istekle çalışır.
// Ürün tarafı: siteden ürün/varyant arama ve fiyat okuma; fiyat yazma yalnızca kanal ayarında açıksa (fiyatYaz).
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
  images: { src: string }[]; variations: number[];
};
type WcVariation = { id: number; sku: string; price: string; regular_price: string; attributes: { name: string; option: string }[]; image?: { src: string } | null };

const decode = (s: string) =>
  s.replace(/&#(\d+);/g, (_, c: string) => String.fromCharCode(Number(c))).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const price = (v: string) => (v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const variationName = (v: WcVariation) => v.attributes.map((a) => a.option).join(" · ") || `#${v.id}`;

/** Fiyatlar KDV dahil mi girilmiş (WooCommerce vergi ayarı); okunamazsa dahil sayılır */
const taxCache = new Map<number, { dahil: boolean; t: number }>();
export async function wcPricesIncludeTax(site: Site) {
  const c = taxCache.get(site.id);
  if (c && Date.now() - c.t < 3600_000) return c.dahil;
  const r = (await wcRequest(site, "/settings/tax/woocommerce_prices_include_tax").catch(() => null)) as { value?: string } | null;
  const dahil = r?.value !== "no";
  taxCache.set(site.id, { dahil, t: Date.now() });
  return dahil;
}

export type WcSearchRow = { id: number; ad: string; sku: string; varyantli: boolean; fiyat: number | null; link: string; gorsel: string | null; durum: string };

/** Ürün arama (ad ya da stok kodu): her durumdaki ürünler, en çok 20 */
export async function wcSearch(site: Site, q: string): Promise<WcSearchRow[]> {
  const list = (await wcRequest(site, `/products?per_page=20&status=any&search=${encodeURIComponent(q)}`)) as WcProduct[];
  // Arama stok kodunu kapsamaz: tam stok kodu eşleşmesi ayrıca sorulur
  const bySku = /^\S{2,}$/.test(q) ? ((await wcRequest(site, `/products?per_page=5&status=any&sku=${encodeURIComponent(q)}`).catch(() => [])) as WcProduct[]) : [];
  const seen = new Set<number>();
  return [...bySku, ...list]
    .filter((p) => !seen.has(p.id) && seen.add(p.id))
    .map((p) => ({ id: p.id, ad: decode(p.name), sku: p.sku, varyantli: p.type === "variable", fiyat: price(p.price), link: p.permalink, gorsel: p.images[0]?.src ?? null, durum: p.status }));
}

export async function wcVariations(site: Site, productId: number) {
  const list = (await wcRequest(site, `/products/${productId}/variations?per_page=100`)) as WcVariation[];
  return list.map((v) => ({ id: v.id, ad: variationName(v), sku: v.sku, fiyat: price(v.price) }));
}

/** Bağlı ürün/varyantların sitedeki adı ve fiyatı; anahtar "ürün:varyant" (varyantsızda 0) */
export async function wcCurrent(site: Site, refs: { urunId: number; varyantId: number | null }[]) {
  const out = new Map<string, { ad: string; fiyat: number | null }>();
  const ids = [...new Set(refs.map((r) => r.urunId))];
  const names = new Map<number, string>();
  for (let i = 0; i < ids.length; i += 100) {
    const list = (await wcRequest(site, `/products?per_page=100&status=any&include=${ids.slice(i, i + 100).join(",")}`)) as WcProduct[];
    for (const p of list) {
      names.set(p.id, decode(p.name));
      out.set(`${p.id}:0`, { ad: decode(p.name), fiyat: price(p.price) });
    }
  }
  for (const pid of [...new Set(refs.filter((r) => r.varyantId).map((r) => r.urunId))]) {
    const want = refs.filter((r) => r.urunId === pid && r.varyantId).map((r) => r.varyantId!);
    const list = (await wcRequest(site, `/products/${pid}/variations?per_page=100&include=${want.join(",")}`)) as WcVariation[];
    for (const v of list) out.set(`${pid}:${v.id}`, { ad: `${names.get(pid) ?? ""} · ${variationName(v)}`, fiyat: price(v.price) });
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
