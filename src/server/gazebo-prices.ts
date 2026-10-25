import "server-only";
import { eq } from "drizzle-orm";
import { DEFAULT_TABLE, applyEdits, cellKeys, cellOf, costTable, type CostEdits, type Pair, type PriceEdits, type PriceTable } from "@/lib/terminal/price-table";
import { db, schema } from "./db";

const { gazeboFiyatlari } = schema;

export type GazeboEdits = { ortak: PriceEdits; markalar: Record<number, PriceEdits>; maliyet: CostEdits };

/** Tüm düzeltmeler: ortak, markaya özel ve maliyet */
export async function gazeboEdits(): Promise<GazeboEdits> {
  const rows = await db().select().from(gazeboFiyatlari);
  const out: GazeboEdits = { ortak: {}, markalar: {}, maliyet: {} };
  for (const r of rows) {
    const v = JSON.parse(r.veri);
    if (r.kapsam === "ortak") out.ortak = v;
    else if (r.kapsam === "maliyet") out.maliyet = v;
    else if (r.kapsam.startsWith("marka-")) out.markalar[Number(r.kapsam.slice(6))] = v;
  }
  return out;
}

/** Markaların fiyat tabloları: varsayılan + ortak + marka düzeltmeleri */
export async function gazeboTables(markaIds: number[]): Promise<Record<number, PriceTable>> {
  const e = await gazeboEdits();
  const ortak = applyEdits(DEFAULT_TABLE, e.ortak);
  return Object.fromEntries(markaIds.map((id) => [id, applyEdits(ortak, e.markalar[id])]));
}

/** Gazebo maliyet tablosu (yalnızca yönetici ve sunucu kontrolü); hiç maliyet girilmemişse null */
export async function gazeboCostTable(): Promise<PriceTable | null> {
  const { maliyet } = await gazeboEdits();
  return Object.keys(maliyet).length ? costTable(maliyet) : null;
}

const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null);
const KEYS = new Set(cellKeys());

/**
 * Bir kapsamın düzeltmelerini kaydeder (çağıran yönetici yetkisini denetler). Gelen liste o kapsamın tamamıdır.
 * Ortakta varsayılanla aynı hücre saklanmaz; markada boş hücre ortak fiyatı kullanır; maliyette boş hücre maliyetsizdir.
 */
export async function saveGazeboEdits(kapsam: "ortak" | "maliyet" | number, edits: Record<string, unknown>) {
  const veri: Record<string, Pair | number> = {};
  for (const [key, raw] of Object.entries(edits ?? {})) {
    if (!KEYS.has(key)) continue;
    if (kapsam === "maliyet") {
      const m = num(raw);
      if (m !== null) veri[key] = m;
      continue;
    }
    const pair: Pair = Array.isArray(raw) && raw.length === 2 && num(raw[0]) !== null && num(raw[1]) !== null ? [num(raw[0])!, num(raw[1])!] : null;
    if (kapsam === "ortak") {
      if (JSON.stringify(pair) !== JSON.stringify(cellOf(DEFAULT_TABLE, key) ?? null)) veri[key] = pair;
    } else if (pair) veri[key] = pair;
  }
  const k = typeof kapsam === "number" ? `marka-${kapsam}` : kapsam;
  const value = JSON.stringify(veri);
  if (!Object.keys(veri).length) await db().delete(gazeboFiyatlari).where(eq(gazeboFiyatlari.kapsam, k));
  else await db().insert(gazeboFiyatlari).values({ kapsam: k, veri: value }).onDuplicateKeyUpdate({ set: { veri: value } });
}
