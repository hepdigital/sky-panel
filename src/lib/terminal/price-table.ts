// Modüler gazebo fiyat tablosu: iskelet (FRAMES), tavan (ROOF) ve duvar listesi (WALL). Varsayılan değerler
// fiyatlar.json'dadır; Ürünler → Modüler gazebo fiyatları ekranında yapılan değişiklikler (ortak + markaya özel)
// veritabanında "düzeltme" olarak saklanır ve bu varsayılanların üstüne uygulanır.
//
// Hesaplar (calc.ts, walls.ts) etkin tabloyu priceTable() ile okur. Teklif ekranı seçili markanın tablosunu
// setPriceTable ile etkinleştirir; sunucu hesapları withPriceTable ile (eşzamanlı, araya başka iş girmeden) çalışır.

import data from "./fiyatlar.json";

export type Pair = [number, number] | null;
export type PriceTable = {
  /** Önbellek anahtarı: aynı içerikli tablolar aynı kimliği taşır */
  id: string;
  WALL: Record<string, Record<string, Pair[]>>;
  ROOF: Record<string, Pair[]>;
  FRAMES: Record<string, { desc: string; p: Record<string, Pair> }>;
};

/**
 * Düzeltmeler: hücre anahtarı → [toptan, perakende] (null = fiyat sorunuz).
 * Anahtarlar: "f|SQ3|3x3" (iskelet), "r|3x3|0" (tavan, kumaş sırası), "w|200x300|duz-tam|0" (duvar, kumaş sırası).
 */
export type PriceEdits = Record<string, Pair>;
/** Maliyet: aynı anahtarlar → birim maliyet (KDV hariç) */
export type CostEdits = Record<string, number>;

export const DEFAULT_TABLE: PriceTable = { id: "varsayilan", ...(data as unknown as Omit<PriceTable, "id">) };

/** Varsayılan tablodaki tüm hücre anahtarları (düzenleme ekranı ve doğrulama için) */
export function cellKeys(t: PriceTable = DEFAULT_TABLE) {
  const keys: string[] = [];
  for (const [id, f] of Object.entries(t.FRAMES)) for (const size of Object.keys(f.p)) keys.push(`f|${id}|${size}`);
  for (const [size, list] of Object.entries(t.ROOF)) list.forEach((_, i) => keys.push(`r|${size}|${i}`));
  for (const [group, rows] of Object.entries(t.WALL)) for (const [kind, list] of Object.entries(rows)) list.forEach((_, i) => keys.push(`w|${group}|${kind}|${i}`));
  return keys;
}

/** Hücrenin tablodaki değeri */
export function cellOf(t: PriceTable, key: string): Pair | undefined {
  const [k, a, b, c] = key.split("|");
  if (k === "f") return t.FRAMES[a]?.p[b];
  if (k === "r") return t.ROOF[a]?.[Number(b)];
  if (k === "w") return t.WALL[a]?.[b]?.[Number(c)];
  return undefined;
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Düzeltmeleri sırayla uygular (önce ortak, sonra marka); varsayılanda olmayan hücreler yok sayılır */
export function applyEdits(base: PriceTable, ...layers: (PriceEdits | null | undefined)[]): PriceTable {
  const t: PriceTable = structuredClone(base);
  let changed = false;
  for (const edits of layers)
    for (const [key, v] of Object.entries(edits ?? {})) {
      if (cellOf(t, key) === undefined) continue;
      const [k, a, b, c] = key.split("|");
      if (k === "f") t.FRAMES[a].p[b] = v;
      else if (k === "r") t.ROOF[a][Number(b)] = v;
      else t.WALL[a][b][Number(c)] = v;
      changed = true;
    }
  t.id = changed ? `t${hash(JSON.stringify(layers))}` : base.id;
  return t;
}

/** Maliyet tablosu: maliyeti girilmiş hücreler [m, m], diğerleri null (fiyat tablosuyla aynı hesaplarla toplanır) */
export function costTable(costs: CostEdits): PriceTable {
  const t: PriceTable = structuredClone(DEFAULT_TABLE);
  for (const key of cellKeys()) {
    const m = costs[key];
    const v: Pair = typeof m === "number" && Number.isFinite(m) ? [m, m] : null;
    const [k, a, b, c] = key.split("|");
    if (k === "f") t.FRAMES[a].p[b] = v;
    else if (k === "r") t.ROOF[a][Number(b)] = v;
    else t.WALL[a][b][Number(c)] = v;
  }
  t.id = `m${hash(JSON.stringify(costs))}`;
  return t;
}

let active = DEFAULT_TABLE;
/** Etkin fiyat tablosu */
export const priceTable = () => active;
/** Teklif ekranı: seçili markanın tablosunu etkinleştirir */
export function setPriceTable(t: PriceTable) {
  active = t;
}
/** fn çalışırken t etkin; bitince önceki tabloya döner (fn eşzamanlı olmalı) */
export function withPriceTable<T>(t: PriceTable, fn: () => T): T {
  const prev = active;
  active = t;
  try {
    return fn();
  } finally {
    active = prev;
  }
}
