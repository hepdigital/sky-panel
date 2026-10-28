// Modüler gazebo duvarları — satış ekranı ve (ileride) B2B portalı bu modülü kullanır.
//
// Duvar = tip + kumaş + açıklık ekleri. Gerçek ürün kuralları:
// - Pencere 137×137 cm: şeffaf PVC ve/veya sineklik; perde (kumaş kapak, yukarı toplanır) isteğe bağlı.
// - Kapı 90 cm genişlik, duvar boyunca: perde her zaman var, yalnızca sineklik eklenebilir (PVC olmaz).
// - Tam PVC duvarda kenarlarda ~12 cm kumaş pay kalır; tam sineklikli duvarda pay yoktur.
//
// Fiyat duvar ölçüsüne (grubuna) göredir, gazebo ölçüsüne göre değil: 2x3, 3x3 ve 3x4.5'in 3 m'lik duvarları aynı
// "200x300" grubundan fiyatlanır. Seçim fiyat listesindeki bir ürüne birebir denk gelirse liste fiyatı kullanılır;
// denk gelmezse o grubun düz tam duvarı + modül fiyatlarıyla hesaplanır (modüller her ölçüde aynı; bkz. modulePrices).

import { priceTable } from "@/lib/terminal/price-table";

/** Etkin fiyat tablosunun duvar listesi (markaya göre değişebilir) */
const list = () => priceTable().WALL;

export type WallKind = "yok" | "tam" | "yarim" | "tam-pvc" | "tam-sineklik" | "tek-fermuar" | "pencere" | "kapi" | "pencere-kapi";
export type WindowOpts = { pvc: boolean; sineklik: boolean; perde: boolean };
export type DoorOpts = { sineklik: boolean };
/** f: kumaş (0 690D, 1 200D, 2 baskılı) */
export type Wall = { kind: WallKind; f: number; p?: WindowOpts; k?: DoorOpts };

export const WALL_KINDS: { kind: WallKind; label: string; short: string }[] = [
  { kind: "yok", label: "Duvar yok", short: "Yok" },
  { kind: "tam", label: "Düz tam duvar", short: "Tam" },
  { kind: "yarim", label: "Düz yarım duvar", short: "Yarım" },
  { kind: "pencere", label: "Pencereli duvar", short: "Pencereli" },
  { kind: "kapi", label: "Kapılı duvar", short: "Kapılı" },
  { kind: "pencere-kapi", label: "Pencere + kapı", short: "Pencere + kapı" },
  { kind: "tam-pvc", label: "Tam PVC duvar", short: "Tam PVC" },
  { kind: "tam-sineklik", label: "Tam sineklikli duvar", short: "Tam sineklik" },
  { kind: "tek-fermuar", label: "Tek fermuarlı kapı", short: "Tek fermuar" },
];
export const hasWindow = (k: WallKind) => k === "pencere" || k === "pencere-kapi";
export const hasDoor = (k: WallKind) => k === "kapi" || k === "pencere-kapi";

/** Kurallara uygun hale getirir: pencerede en az PVC ya da sineklik, kapıda yalnızca sineklik seçeneği */
export function normalizeWall(w: Wall): Wall {
  const out: Wall = { kind: w.kind, f: w.f };
  if (hasWindow(w.kind)) {
    const p = w.p ?? { pvc: true, sineklik: false, perde: false };
    out.p = { pvc: p.pvc || !p.sineklik, sineklik: p.sineklik, perde: p.perde };
  }
  if (hasDoor(w.kind)) out.k = { sineklik: !!w.k?.sineklik };
  return out;
}
export const emptyWall = (): Wall => ({ kind: "yok", f: 0 });
export const wallKey = (w: Wall) =>
  `${w.kind}:${w.f}:${w.p ? `${+w.p.pvc}${+w.p.sineklik}${+w.p.perde}` : "-"}:${w.k ? +w.k.sineklik : "-"}`;

/* ---------------- fiyat listesindeki ürünlerle eşleşme ---------------- */

/** Fiyat listesindeki (terminaldeki) duvar ürünleri ve modüler karşılıkları */
export const LIST_PRODUCTS: { id: string; name: string; wall: Omit<Wall, "f"> }[] = [
  { id: "duz-tam", name: "Düz Tam Duvar", wall: { kind: "tam" } },
  { id: "duz-yarim", name: "Düz Yarım Duvar", wall: { kind: "yarim" } },
  { id: "duz-sineklikli", name: "Düz Sineklikli Duvar", wall: { kind: "tam-sineklik" } },
  { id: "tek-fermuar", name: "Tek Fermuarlı Kapı", wall: { kind: "tek-fermuar" } },
  { id: "pvc", name: "Şeffaf PVC Duvar", wall: { kind: "pencere", p: { pvc: true, sineklik: false, perde: false } } },
  { id: "pvc-perde", name: "Şeffaf PVC + Perde", wall: { kind: "pencere", p: { pvc: true, sineklik: false, perde: true } } },
  { id: "pvc-sineklik-perde", name: "Şeffaf PVC + Sineklik + Perde", wall: { kind: "pencere", p: { pvc: true, sineklik: true, perde: true } } },
  { id: "cift-fermuar", name: "Çift Fermuarlı Kapı", wall: { kind: "kapi", k: { sineklik: false } } },
  { id: "sineklikli-kapi", name: "Sineklikli Kapı", wall: { kind: "kapi", k: { sineklik: true } } },
  { id: "pvc-kapi", name: "Şeffaf PVC + Kapı", wall: { kind: "pencere-kapi", p: { pvc: true, sineklik: false, perde: true }, k: { sineklik: false } } },
  {
    id: "pvc-sinperde-sinkapi",
    name: "Şeffaf PVC + Sineklikli Perde + Sineklikli Kapı",
    wall: { kind: "pencere-kapi", p: { pvc: true, sineklik: true, perde: true }, k: { sineklik: true } },
  },
];

/** Seçim listedeki bir ürüne birebir denk geliyorsa o ürün */
export function listProduct(w: Wall) {
  const key = wallKey({ ...normalizeWall(w), f: 0 });
  return LIST_PRODUCTS.find((p) => wallKey({ ...normalizeWall({ ...p.wall, f: 0 }), f: 0 }) === key);
}

/**
 * Eski kayıtlar (terminalin 12 duvar ürünü {t, f}) → modüler duvar.
 * "Şeffaf PVC + Perde + Kapı" kapıya PVC'li düşünülmüştü; kapıya PVC takılmadığı için "PVC + Kapı" olarak açılır.
 */
export function wallFromLegacy(t: string | null, f: number): Wall {
  if (!t) return emptyWall();
  if (t === "pvc-perde-kapi") return normalizeWall({ kind: "pencere-kapi", f, p: { pvc: true, sineklik: false, perde: true }, k: { sineklik: false } });
  const p = LIST_PRODUCTS.find((x) => x.id === t);
  return p ? normalizeWall({ ...p.wall, f }) : emptyWall();
}

/* ---------------- modül fiyatları ---------------- */

/** Modüller (taban duvar = düz tam duvar): pencereye PVC, pencere perdesi, pencereye sineklik, kapı (perdeli), kapıya sineklik */
const MODULES = ["pencerePvc", "pencerePerde", "pencereSineklik", "kapi", "kapiSineklik"] as const;
type ModuleName = (typeof MODULES)[number];
/**
 * Modül = listedeki tek özellikli ürünün düz tam duvardan farkı (ör. kapı = çift fermuarlı kapı − düz tam duvar).
 * Pencere (137×137) ve kapı (90 cm) her duvar ölçüsünde aynı olduğundan modül fiyatları ölçüden bağımsızdır:
 * her grupta 3 m duvarın (200x300) farkları kullanılır (2026-10-28 kararı). Kumaşa ve fiyat tipine göre değişir.
 * Listede birebir karşılığı olan ürünler yine liste (broşür) fiyatından gelir; modüller yalnızca listede olmayan seçimler içindir.
 */
const MODULE_GROUP = "200x300";
const MODULE_SOURCE: Record<ModuleName, [product: string, minus: string]> = {
  pencerePvc: ["pvc", "duz-tam"],
  pencerePerde: ["pvc-perde", "pvc"],
  pencereSineklik: ["pvc-sineklik-perde", "pvc-perde"],
  kapi: ["cift-fermuar", "duz-tam"],
  kapiSineklik: ["sineklikli-kapi", "cift-fermuar"],
};

const moduleCache = new Map<string, Partial<Record<ModuleName, number>>>();
/** Kumaş ve fiyat tipi için modül fiyatları; listede verisi olmayan modül tanımsız kalır (o seçim "fiyat alınız" olur) */
export function modulePrices(f: number, mode: 0 | 1) {
  const key = `${priceTable().id}|${f}|${mode}`;
  const hit = moduleCache.get(key);
  if (hit) return hit;
  const g = list()[MODULE_GROUP];
  const at = (id: string) => g?.[id]?.[f]?.[mode] ?? null;
  const out: Partial<Record<ModuleName, number>> = {};
  for (const m of MODULES) {
    const [a, b] = MODULE_SOURCE[m];
    const pa = at(a);
    const pb = at(b);
    if (pa !== null && pb !== null) out[m] = pa - pb;
  }
  moduleCache.set(key, out);
  return out;
}

/** Duvar fiyatı (KDV hariç); null = fiyat alınız / bu kumaşta yok */
export function wallPrice(group: string, w: Wall, mode: 0 | 1): number | null {
  if (w.kind === "yok") return null;
  const lp = listProduct(w);
  if (lp) {
    const v = list()[group]?.[lp.id]?.[w.f]?.[mode];
    if (v != null) return v;
  }
  if (w.kind === "tam-pvc") return null; // fiyatı henüz girilmedi
  if (!hasWindow(w.kind) && !hasDoor(w.kind)) return null;
  const base = list()[group]?.["duz-tam"]?.[w.f]?.[mode];
  if (base == null) return null;
  const m = modulePrices(w.f, mode);
  const parts: (number | undefined)[] = [];
  const n = normalizeWall(w);
  if (n.p) {
    if (n.p.pvc) parts.push(m.pencerePvc);
    // Yalnızca sineklikli pencerede açıklık bedeli sineklik modülüne dahildir
    if (n.p.sineklik) parts.push(m.pencereSineklik);
    if (n.p.perde) parts.push(m.pencerePerde);
  }
  if (n.k) {
    parts.push(m.kapi);
    if (n.k.sineklik) parts.push(m.kapiSineklik);
  }
  return parts.some((v) => v == null) ? null : base + parts.reduce<number>((a, v) => a + (v ?? 0), 0);
}

/* ---------------- uygunluk ----------------
   Bir duvar, o ölçü grubunda ve kumaşta fiyatı varsa satılabilir (ör. baskılı kumaşta yalnızca düz tam, yarım,
   çift fermuarlı kapı ve PVC + perde). Tam PVC'nin fiyatı henüz girilmediği için baskılı dışındaki kumaşlarda açıktır. */

/** Bir tipin tüm seçenek bileşimleri (pencerede en az PVC ya da sineklik) */
function variants(kind: WallKind, f: number): Wall[] {
  const wins: WindowOpts[] = [];
  for (const pvc of [true, false]) for (const sineklik of [false, true]) for (const perde of [false, true]) if (pvc || sineklik) wins.push({ pvc, sineklik, perde });
  const doors: DoorOpts[] = [{ sineklik: false }, { sineklik: true }];
  if (kind === "pencere") return wins.map((p) => ({ kind, f, p }));
  if (kind === "kapi") return doors.map((k) => ({ kind, f, k }));
  if (kind === "pencere-kapi") return wins.flatMap((p) => doors.map((k) => ({ kind, f, p, k })));
  return [{ kind, f }];
}

export function wallAvailable(group: string, w: Wall, mode: 0 | 1) {
  if (w.kind === "yok") return true;
  if (w.kind === "tam-pvc") return w.f !== 2; // PVC yüzeye baskı yapılmaz
  return wallPrice(group, w, mode) !== null;
}

/** Tip bu kumaşta (herhangi bir seçenek bileşimiyle) satılıyor mu */
export const kindAvailable = (group: string, kind: WallKind, f: number, mode: 0 | 1) => variants(kind, f).some((v) => wallAvailable(group, v, mode));

/** Seçim uygun değilse en yakın uygun bileşim (önce mevcut seçenekleri koruyarak) */
export function closestAvailable(group: string, w: Wall, mode: 0 | 1): Wall {
  const n = normalizeWall(w);
  if (wallAvailable(group, n, mode)) return n;
  return variants(n.kind, n.f).find((v) => wallAvailable(group, v, mode)) ?? n;
}

/* ---------------- adlandırma ve görsel ---------------- */

const join = (xs: string[]) => xs.join(", ");
/** Duvarın adı: listedeki ürünse liste adı, değilse modüllerden ("Pencereli duvar (PVC, sineklik, perde)") */
export function wallName(w: Wall) {
  const lp = listProduct(w);
  if (lp) return lp.name;
  const n = normalizeWall(w);
  const pw = n.p ? join([n.p.pvc && "PVC", n.p.sineklik && "sineklik", n.p.perde && "perde"].filter(Boolean) as string[]) : "";
  const kd = n.k?.sineklik ? "sineklikli" : "";
  switch (n.kind) {
    case "pencere":
      return `Pencereli duvar (${pw})`;
    case "kapi":
      return kd ? "Sineklikli kapı" : "Kapılı duvar";
    case "pencere-kapi":
      return `Pencere (${pw}) + ${kd ? "sineklikli " : ""}kapı`;
    default:
      return WALL_KINDS.find((k) => k.kind === n.kind)!.label;
  }
}

/** Duvar tipinin 3D'den üretilmiş görseli (tek renk; public/terminal/img/wk-*.webp); "yok" için yok */
export const kindImage = (kind: WallKind) => (kind === "yok" ? null : `wk:${kind}`);

/** Fiyat listesi görseli: ürünün kendisi ya da en yakın tip */
export function wallImage(w: Wall) {
  const lp = listProduct(w);
  if (lp) return `w:${lp.id}`;
  return {
    yok: "w:duz-tam",
    tam: "w:duz-tam",
    yarim: "w:duz-yarim",
    "tam-pvc": "w:pvc",
    "tam-sineklik": "w:duz-sineklikli",
    "tek-fermuar": "w:tek-fermuar",
    pencere: "w:pvc-perde",
    kapi: w.k?.sineklik ? "w:sineklikli-kapi" : "w:cift-fermuar",
    "pencere-kapi": "w:pvc-kapi",
  }[w.kind];
}

/** 3D görüntüleyici: hazır modelli duvar stili ya da çizilmiş duvar tasarımı (bkz. gazebo3d/mastertent/wall-paint.ts) */
export function wallDesign(w: Wall): { style: "kapali" | "yarim"; design?: string } | null {
  const n = normalizeWall(w);
  switch (n.kind) {
    case "yok":
      return null;
    case "tam":
      return { style: "kapali" };
    case "yarim":
      return { style: "yarim" };
    case "tam-pvc":
    case "tam-sineklik":
    case "tek-fermuar":
      return { style: "kapali", design: n.kind };
    default: {
      const p = n.p ? `${+n.p.pvc}${+n.p.sineklik}${+n.p.perde}` : "x";
      const k = n.k ? `${+n.k.sineklik}` : "x";
      return { style: "kapali", design: `p${p}-k${k}` };
    }
  }
}
