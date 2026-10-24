import "server-only";
import { and, asc, eq, ne } from "drizzle-orm";
import { OPT_SUFFIX, type Catalog, type Pair } from "@/lib/terminal/calc";
import type { Costs } from "@/lib/terminal/cost";
import { isAdmin, type Me } from "./auth";
import { db, schema } from "./db";

const { urunler, urunKategorileri, kullanicilar, urunMarkalari } = schema;

/** [toptan, perakende]; biri boşsa diğeri kullanılır, ikisi de boşsa "fiyat sorunuz" (null) */
function pair(toptan: number | null, perakende: number | null): Pair {
  if (toptan === null && perakende === null) return null;
  return [toptan ?? perakende!, perakende ?? toptan!];
}

/**
 * Terminalin ürün menüsü: aktif kategoriler ve aktif ürünleri, sırasıyla. markaId verilirse markaya özel fiyat ve görsel
 * (urun_markalari) uygulanır, o markada gizli ürünler çıkarılır; boş alan ürünün ortak değerini kullanır.
 */
export async function getCatalog(markaId: number | null = null): Promise<Catalog> {
  const rows = await db()
    .select({ k: urunKategorileri, u: urunler, o: urunMarkalari })
    .from(urunKategorileri)
    .innerJoin(urunler, and(eq(urunler.kategoriId, urunKategorileri.id), eq(urunler.aktif, true)))
    .leftJoin(urunMarkalari, and(eq(urunMarkalari.urunId, urunler.id), eq(urunMarkalari.markaId, markaId ?? 0)))
    .where(eq(urunKategorileri.aktif, true))
    .orderBy(asc(urunKategorileri.sira), asc(urunKategorileri.id), asc(urunler.sira), asc(urunler.id));
  const groups = new Map<number, Catalog[number]>();
  for (const { k, u, o } of rows) {
    if (o?.gizli) continue;
    let g = groups.get(k.id);
    if (!g) groups.set(k.id, (g = { id: `k${k.id}`, nav: k.ad, title: k.aciklama || k.ad, lead: "", warn: k.uyari ?? undefined, items: [] }));
    const p = pair(o?.toptan ?? u.toptan, o?.perakende ?? u.perakende);
    const op = u.secenekAd ? pair(u.secenekToptan, u.secenekPerakende) : null;
    const opt = u.secenekAd && op ? { n: u.secenekAd, p: op } : undefined;
    const item = { id: u.kod, n: u.ad, s: u.aciklama ?? "", img: o?.gorsel ?? u.gorsel, p, warn: u.uyari ?? undefined, renk: u.renkSecimi || undefined };
    g.items.push({ ...item, opt });
    // Seçenekli ürünün görünmeyen eşi: fiyatı ürün + seçenek; sepette ayrı satır, kartta anahtarla seçilir
    if (opt && p) g.items.push({ ...item, id: u.kod + OPT_SUFFIX, n: `${u.ad} · ${opt.n}`, p: [p[0] + op![0], p[1] + op![1]], hidden: true });
  }
  return [...groups.values()];
}

/** Markaların katalogları (teklif ekranı marka değişince kataloğu değiştirir) */
export async function getCatalogs(markaIds: number[]): Promise<Record<number, Catalog>> {
  return Object.fromEntries(await Promise.all(markaIds.map(async (id) => [id, await getCatalog(id)] as const)));
}

/** Ürün maliyetleri (yalnızca yönetici ekranlarına ve sunucu kontrolüne). Maliyeti girilmemiş ürün listede yoktur. */
export async function getCosts(): Promise<Costs> {
  const rows = await db().select({ kod: urunler.kod, maliyet: urunler.maliyet, secenekMaliyet: urunler.secenekMaliyet, secenekAd: urunler.secenekAd }).from(urunler);
  const costs: Costs = {};
  for (const r of rows) {
    if (r.maliyet === null) continue;
    costs[r.kod] = r.maliyet;
    if (r.secenekAd) costs[r.kod + OPT_SUFFIX] = r.maliyet + (r.secenekMaliyet ?? 0);
  }
  return costs;
}

export type BrandOverride = { markaId: number; toptan: number | null; perakende: number | null; gorsel: string | null; gizli: boolean };

/** Ürünler ekranı: tüm kategoriler ve ürünler (pasifler dahil) */
export async function listProducts() {
  const [kategoriler, liste] = await Promise.all([
    db().select().from(urunKategorileri).orderBy(asc(urunKategorileri.sira), asc(urunKategorileri.id)),
    db()
      .select({ u: urunler, ekleyen: kullanicilar.adSoyad })
      .from(urunler)
      .leftJoin(kullanicilar, eq(kullanicilar.id, urunler.olusturanId))
      .orderBy(asc(urunler.sira), asc(urunler.id)),
  ]);
  const ozel = await db().select().from(urunMarkalari);
  const byProduct = new Map<number, BrandOverride[]>();
  for (const o of ozel) byProduct.set(o.urunId, [...(byProduct.get(o.urunId) ?? []), { markaId: o.markaId, toptan: o.toptan, perakende: o.perakende, gorsel: o.gorsel, gizli: o.gizli }]);
  return { kategoriler, urunler: liste.map((r) => ({ ...r.u, ekleyen: r.ekleyen, markalar: byProduct.get(r.u.id) ?? [] })) };
}

/** Yönetici her ürünü, satışçı yalnızca kendi eklediği ürünü düzenler */
export const canEditProduct = (me: Me, olusturanId: number | null) => isAdmin(me) || (olusturanId !== null && olusturanId === me.id);

export type ProductInput = {
  id: number | null;
  kategoriId: number;
  ad: string;
  aciklama: string;
  gorsel: string | null;
  toptan: number | null;
  perakende: number | null;
  uyari: string;
  aktif: boolean;
  /** Renk seçilebilir (gazebo renkleri) */
  renkSecimi: boolean;
  /** Ek seçenek: ad boşsa seçenek yok */
  secenekAd: string;
  secenekToptan: number | null;
  secenekPerakende: number | null;
  /** Yalnızca yönetici: maliyetler ve markaya özel fiyat/görsel (satışçının kaydında yok sayılır) */
  maliyet?: number | null;
  secenekMaliyet?: number | null;
  markalar?: BrandOverride[];
};

const clip = (v: string | null | undefined, max: number) => (v?.trim() ? v.trim().slice(0, max) : null);
const price = (n: number | null) => (n === null || !Number.isFinite(n) || n < 0 ? null : Math.round(n * 100) / 100);

/** Türkçe karakterleri sadeleştirip kod üretir: "Dikey A-Pano" → "dikey-a-pano" */
function slug(s: string) {
  const tr: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };
  return (
    s
      .toLocaleLowerCase("tr-TR")
      .replace(/[çğıöşü]/g, (c) => tr[c])
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "urun"
  );
}

const validImage = (g: string | null | undefined) => (g && (/^p:[a-z0-9-]+$/.test(g) || /^\/dosya\/urun\/[a-z0-9]+\.webp$/.test(g)) ? g : null);

/** Markaya özel değerler: tamamen boş (fiyat, görsel yok, gizli değil) satır silinir */
async function saveOverrides(urunId: number, list: BrandOverride[]) {
  const ids = new Set((await db().select({ id: schema.markalar.id }).from(schema.markalar)).map((m) => m.id));
  for (const o of list) {
    if (!ids.has(o.markaId)) continue;
    const v = { toptan: price(o.toptan), perakende: price(o.perakende), gorsel: validImage(o.gorsel), gizli: !!o.gizli };
    const where = and(eq(urunMarkalari.urunId, urunId), eq(urunMarkalari.markaId, o.markaId));
    if (v.toptan === null && v.perakende === null && !v.gorsel && !v.gizli) await db().delete(urunMarkalari).where(where);
    else await db().insert(urunMarkalari).values({ urunId, markaId: o.markaId, ...v }).onDuplicateKeyUpdate({ set: v });
  }
}

export async function saveProduct(me: Me, p: ProductInput): Promise<{ ok: true; id: number } | { ok: false; hata: string }> {
  const ad = clip(p.ad, 160);
  if (!ad) return { ok: false, hata: "Ürün adı gerekli." };
  const [kat] = await db().select({ id: urunKategorileri.id }).from(urunKategorileri).where(eq(urunKategorileri.id, p.kategoriId));
  if (!kat) return { ok: false, hata: "Kategori seçin." };
  const gorsel = validImage(p.gorsel);
  const values = {
    kategoriId: kat.id, ad, aciklama: clip(p.aciklama, 255), gorsel,
    toptan: price(p.toptan), perakende: price(p.perakende), uyari: clip(p.uyari, 500), aktif: !!p.aktif, renkSecimi: !!p.renkSecimi,
    secenekAd: clip(p.secenekAd, 120), secenekToptan: clip(p.secenekAd, 120) ? price(p.secenekToptan) : null, secenekPerakende: clip(p.secenekAd, 120) ? price(p.secenekPerakende) : null,
    // Maliyet yalnızca yöneticinin kaydında yazılır
    ...(isAdmin(me) ? { maliyet: price(p.maliyet ?? null), secenekMaliyet: clip(p.secenekAd, 120) ? price(p.secenekMaliyet ?? null) : null } : {}),
  };
  if (p.id) {
    const [u] = await db().select({ olusturanId: urunler.olusturanId }).from(urunler).where(eq(urunler.id, p.id));
    if (!u) return { ok: false, hata: "Ürün bulunamadı." };
    if (!canEditProduct(me, u.olusturanId)) return { ok: false, hata: "Bu ürünü yalnızca yönetici ya da ekleyen satışçı düzenleyebilir." };
    await db().update(urunler).set(values).where(eq(urunler.id, p.id));
    if (isAdmin(me) && p.markalar) await saveOverrides(p.id, p.markalar);
    return { ok: true, id: p.id };
  }
  // Kod benzersiz ve kalıcıdır (teklif sepetindeki anahtar)
  const base = slug(ad);
  let kod = base;
  for (let i = 2; (await db().select({ id: urunler.id }).from(urunler).where(eq(urunler.kod, kod))).length; i++) kod = `${base}-${i}`;
  const [r] = await db().insert(urunler).values({ ...values, kod, sira: 1000, olusturanId: me.id }).$returningId();
  if (isAdmin(me) && p.markalar) await saveOverrides(r.id, p.markalar);
  return { ok: true, id: r.id };
}

/** Yalnızca fiyat (listede satır içi düzenleme) */
export async function setProductPrice(me: Me, id: number, toptan: number | null, perakende: number | null) {
  const [u] = await db().select({ olusturanId: urunler.olusturanId }).from(urunler).where(eq(urunler.id, id));
  if (!u || !canEditProduct(me, u.olusturanId)) return false;
  await db().update(urunler).set({ toptan: price(toptan), perakende: price(perakende) }).where(eq(urunler.id, id));
  return true;
}

export type CategoryInput = { id: number | null; ad: string; aciklama: string; uyari: string; aktif: boolean };

/** Kategoriler yalnızca yöneticinindir (çağıran kontrol eder) */
export async function saveCategory(c: CategoryInput): Promise<{ ok: true } | { ok: false; hata: string }> {
  const ad = clip(c.ad, 80);
  if (!ad) return { ok: false, hata: "Kategori adı gerekli." };
  const values = { ad, aciklama: clip(c.aciklama, 255), uyari: clip(c.uyari, 500), aktif: !!c.aktif };
  if (c.id) await db().update(urunKategorileri).set(values).where(eq(urunKategorileri.id, c.id));
  else {
    const all = await db().select({ sira: urunKategorileri.sira }).from(urunKategorileri);
    await db().insert(urunKategorileri).values({ ...values, sira: Math.max(0, ...all.map((x) => x.sira)) + 10 });
  }
  return { ok: true };
}

/** Kategoriyi menüde bir üste / alta taşır (komşusuyla sıra değiştirir) */
export async function moveCategory(id: number, dir: -1 | 1) {
  const all = await db().select({ id: urunKategorileri.id }).from(urunKategorileri).orderBy(asc(urunKategorileri.sira), asc(urunKategorileri.id));
  const i = all.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await db().transaction(async (tx) => {
    for (const [n, x] of all.entries()) await tx.update(urunKategorileri).set({ sira: (n + 1) * 10 }).where(eq(urunKategorileri.id, x.id));
  });
}

/** Ürünü kategorisi içinde bir üste / alta taşır */
export async function moveProduct(me: Me, id: number, dir: -1 | 1) {
  if (!isAdmin(me)) return;
  const [u] = await db().select({ kategoriId: urunler.kategoriId }).from(urunler).where(eq(urunler.id, id));
  if (!u?.kategoriId) return;
  const all = await db()
    .select({ id: urunler.id })
    .from(urunler)
    .where(and(eq(urunler.kategoriId, u.kategoriId), ne(urunler.id, 0)))
    .orderBy(asc(urunler.sira), asc(urunler.id));
  const i = all.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await db().transaction(async (tx) => {
    for (const [n, x] of all.entries()) await tx.update(urunler).set({ sira: (n + 1) * 10 }).where(eq(urunler.id, x.id));
  });
}
