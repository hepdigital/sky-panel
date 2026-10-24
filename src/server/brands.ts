import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
import type { BrandCard } from "@/lib/terminal/calc";
import { isAdmin, type Me } from "./auth";
import { db, schema } from "./db";

const { markalar, kullaniciMarkalar, teklifler } = schema;
type Row = typeof markalar.$inferSelect;

/** Teklif ekranı ve PDF için markanın kimlik kartı (müşteriye giden bilgiler) */
export function brandCard(m: Row): BrandCard {
  return {
    id: m.id, kod: m.kod, ad: m.ad, renk: m.renk, logo: m.logo, onEk: m.teklifOnEki,
    unvan: m.unvan ?? "", adres: m.adres ?? "", telefon: m.telefon ?? "", eposta: m.eposta ?? "", web: m.web ?? "",
    vergi: m.vergi ?? "", ticSicil: m.ticSicil ?? "", mersis: m.mersis ?? "",
    banka: { banka: m.banka ?? "", hesapAdi: m.hesapAdi ?? "", musteriNo: m.musteriNo ?? "", iban: m.iban ?? "" },
    notlar: (m.notlar ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
  };
}

/** Şirket kartında eksik olan zorunlu bilgiler (yönetici uyarısı) */
export function missingInfo(m: Row) {
  return ([["unvan", "unvan"], ["adres", "adres"], ["telefon", "telefon"], ["vergi", "vergi bilgisi"], ["iban", "IBAN"]] as const)
    .filter(([k]) => !m[k]?.trim())
    .map(([, l]) => l);
}

export async function listBrands() {
  return db().select().from(markalar).orderBy(asc(markalar.sira), asc(markalar.id));
}

/** Kullanıcının satış yapabileceği aktif markalar: yönetici hepsi; satışçı atananlar, ataması yoksa hepsi */
export async function brandsFor(me: Me) {
  const all = await db().select().from(markalar).where(eq(markalar.aktif, true)).orderBy(asc(markalar.sira), asc(markalar.id));
  if (isAdmin(me)) return all;
  const mine = await db().select({ id: kullaniciMarkalar.markaId }).from(kullaniciMarkalar).where(eq(kullaniciMarkalar.kullaniciId, me.id));
  if (!mine.length) return all;
  const ids = new Set(mine.map((r) => r.id));
  return all.filter((m) => ids.has(m.id));
}

export async function canUseBrand(me: Me, markaId: number) {
  return (await brandsFor(me)).find((m) => m.id === markaId) ?? null;
}

/** Kullanıcı → atanmış marka kimlikleri (Kullanıcılar ekranı) */
export async function userBrandMap() {
  const rows = await db().select().from(kullaniciMarkalar);
  const map = new Map<number, number[]>();
  for (const r of rows) map.set(r.kullaniciId, [...(map.get(r.kullaniciId) ?? []), r.markaId]);
  return map;
}

/** Satışçının markaları (yalnızca yönetici çağırır); boş liste = tüm markalar */
export async function setUserBrands(userId: number, markaIds: number[]) {
  await db().transaction(async (tx) => {
    await tx.delete(kullaniciMarkalar).where(eq(kullaniciMarkalar.kullaniciId, userId));
    const ids = markaIds.length ? (await tx.select({ id: markalar.id }).from(markalar).where(inArray(markalar.id, markaIds))).map((r) => r.id) : [];
    if (ids.length) await tx.insert(kullaniciMarkalar).values(ids.map((markaId) => ({ kullaniciId: userId, markaId })));
  });
}

export type BrandInput = {
  id: number | null;
  ad: string;
  unvan: string;
  adres: string;
  telefon: string;
  eposta: string;
  web: string;
  vergi: string;
  ticSicil: string;
  mersis: string;
  banka: string;
  hesapAdi: string;
  musteriNo: string;
  iban: string;
  logo: string | null;
  renk: string;
  teklifOnEki: string;
  notlar: string;
  aktif: boolean;
};

const clip = (v: string | null | undefined, max: number) => (v?.trim() ? v.trim().slice(0, max) : null);
const slug = (s: string) =>
  s
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c]!)
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20) || "marka";

/** Marka ekle / düzenle (yalnızca yönetici; çağıran kontrol eder). Öneki teklif verilmiş markada değiştirilemez. */
export async function saveBrand(b: BrandInput): Promise<{ ok: true; id: number } | { ok: false; hata: string }> {
  const ad = clip(b.ad, 120);
  if (!ad) return { ok: false, hata: "Marka adı gerekli." };
  const onEk = (b.teklifOnEki ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  if (!onEk) return { ok: false, hata: "Teklif numarası öneki gerekli (ör. GT)." };
  const renk = /^#[0-9a-f]{6}$/i.test(b.renk) ? b.renk.toLowerCase() : "#008355";
  const logo = b.logo && (/^\/brand\/[a-z0-9.-]+$/i.test(b.logo) || /^\/dosya\/marka\/[a-z0-9]+\.webp$/.test(b.logo)) ? b.logo : null;
  const values = {
    ad, unvan: clip(b.unvan, 200), adres: clip(b.adres, 300), telefon: clip(b.telefon, 40), eposta: clip(b.eposta, 160), web: clip(b.web, 160),
    vergi: clip(b.vergi, 160), ticSicil: clip(b.ticSicil, 40), mersis: clip(b.mersis, 40),
    banka: clip(b.banka, 160), hesapAdi: clip(b.hesapAdi, 200), musteriNo: clip(b.musteriNo, 40), iban: clip(b.iban, 40),
    logo, renk, teklifOnEki: onEk, notlar: clip(b.notlar, 4000), aktif: !!b.aktif,
  };
  try {
    if (b.id) {
      const [old] = await db().select({ onEk: markalar.teklifOnEki }).from(markalar).where(eq(markalar.id, b.id));
      if (!old) return { ok: false, hata: "Marka bulunamadı." };
      if (old.onEk !== onEk) {
        const [{ n }] = await db().select({ n: sql<number>`COUNT(*)` }).from(teklifler).where(eq(teklifler.markaId, b.id));
        if (Number(n)) return { ok: false, hata: "Bu markayla teklif verilmiş; numara öneki artık değiştirilemez." };
      }
      await db().update(markalar).set(values).where(eq(markalar.id, b.id));
      return { ok: true, id: b.id };
    }
    const [{ max }] = await db().select({ max: sql<number>`COALESCE(MAX(${markalar.sira}), 0)` }).from(markalar);
    const [r] = await db().insert(markalar).values({ ...values, kod: slug(ad), sira: Number(max) + 10 }).$returningId();
    return { ok: true, id: r.id };
  } catch {
    return { ok: false, hata: "Bu ad ya da önek başka bir markada kullanılıyor." };
  }
}

/** Liste süzgeci: kullanıcının markaları ve adresteki ?marka=kod'un karşılığı */
export async function brandFilter(me: Me, raw: string | string[] | undefined) {
  const list = await brandsFor(me);
  const kod = typeof raw === "string" ? raw : null;
  const active = list.find((b) => b.kod === kod) ?? null;
  return { options: list.map((b) => ({ kod: b.kod, ad: b.ad, renk: b.renk })), active };
}
