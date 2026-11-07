// Fiyat terminali hesap çekirdeği: SKY fiyat terminalinin (js/app.js) mantığının birebir aktarımı.
// Tüm tutarlar ham (KDV hariç) tutulur; KDV yalnızca gösterimde ve PDF'te uygulanır.
// Modüler gazebo fiyatları: etkin fiyat tablosu (price-table.ts; varsayılanı fiyatlar.json, düzeltmeler veritabanında)
// — her fiyat [toptan, perakende], null = "fiyat sorunuz".
// Katalog ürünleri (gazebo dışı) veritabanındadır (Ürünler ekranı); hesaplar onları parametre olarak alır.

import {
  emptyWall,
  normalizeWall,
  wallFromLegacy,
  kindImage,
  wallKey,
  wallName,
  wallPrice,
  type Wall,
  type WallKind,
} from "@/modules/gazebo/walls";
import { priceTable } from "./price-table";
import { recolored } from "./recolor";

export type Pair = [number, number] | null;
/**
 * renk: renk seçilebilir ürün; sepette her renk ayrı satırdır (anahtar "kod~#hex").
 * opt: ek seçenek (ör. "Kumaş baskı dahil"); katalogda ürünün görünmeyen eşi (hidden, kod+s, fiyat = ürün + seçenek) bulunur,
 * kartta anahtar açılınca adet o eşe yazılır. Fiyat terminalindeki yapıyla aynıdır.
 * m2: m² ile fiyatlanan ürün (ör. baskılı halı); p m² fiyatıdır, m2 basılabilen en büyük ölçü (cm). Her ölçü sepette ayrı satırdır
 * (anahtar "kod@200x500"), parça fiyatı alan × m² fiyatıdır.
 */
export type CatalogItem = { id: string; n: string; s: string; img: string | null; p: Pair; warn?: string; renk?: boolean; opt?: { n: string; p: Pair }; hidden?: boolean; m2?: Olcu };
export const OPT_SUFFIX = "+s";

/** m² ürününün ölçüsü (cm) */
export type Olcu = { en: number; boy: number };
/** Bundan küçük parça da bu kadar m² fiyatlanır */
export const M2_MIN = 1;
/** Fiyatlanan alan: m² (iki ondalık), en az M2_MIN */
export const areaOf = (o: Olcu) => Math.max(M2_MIN, Math.round((o.en * o.boy) / 100) / 100);
/** Parça fiyatı: m² ürününde alan × m² fiyatı (tam TL), diğerlerinde birim fiyat */
export const linePrice = (pr: number, o: Olcu | null) => (o ? Math.round(pr * areaOf(o)) : pr);
const m2Text = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
/** "200 × 500 cm · 10 m²" (en az 1 m²'nin altındaysa belirtilir) */
export const olcuText = (o: Olcu) =>
  `${o.en} × ${o.boy} cm · ${m2Text(areaOf(o))} m²${(o.en * o.boy) / 10_000 < M2_MIN ? ` (en az ${M2_MIN} m² fiyatlanır)` : ""}`;
/** Ölçü sınırı: kısa kenar en büyük eni, uzun kenar en büyük boyu geçemez (halı çevrilerek basılır) */
export function olcuHata(o: Olcu, max: Olcu) {
  if (!Number.isInteger(o.en) || !Number.isInteger(o.boy) || o.en < 1 || o.boy < 1) return "En ve boyu cm olarak yazın.";
  if (Math.min(o.en, o.boy) > max.en || Math.max(o.en, o.boy) > max.boy) return `En fazla ${max.en} × ${max.boy} cm basılabilir.`;
  return null;
}

/** Sepet anahtarı: renksiz ürün "kod", renkli ürün "kod~#ffd400", m² ürünü "kod@200x500" */
export const prodKey = (id: string, hex?: string | null) => (hex ? `${id}~${hex}` : id);
export const areaKey = (id: string, o: Olcu) => `${id}@${o.en}x${o.boy}`;
export const splitKey = (key: string) => {
  const i = key.indexOf("~");
  const head = i < 0 ? key : key.slice(0, i);
  const m = /^(.+)@(\d+)x(\d+)$/.exec(head);
  return { id: m ? m[1] : head, hex: i < 0 ? null : key.slice(i + 1), olcu: m ? { en: Number(m[2]), boy: Number(m[3]) } : null };
};
/** Bir ürünün sepetteki satırları (renkliyse renk, m² ürünüyse ölçü başına), ürün sırasıyla */
export function itemLines(q: QuoteState, it: CatalogItem) {
  return Object.keys(q.prod)
    .filter((k) => (q.prod[k] || 0) > 0 && splitKey(k).id === it.id)
    .sort()
    .map((key) => ({ key, ...splitKey(key), qty: q.prod[key] }));
}
export type CatalogGroup = { id: string; nav: string; title: string; lead: string; warn?: string; items: CatalogItem[] };
export type Catalog = CatalogGroup[];


export const FABRICS = [
  { n: "690D Impertex", d: "Su geçirmez" },
  { n: "200D Oxford", d: "Su itici" },
  { n: "Dijital baskılı Oxford", d: "Su itici · baskılı" },
];
export const FAB_SHORT = ["690D", "200D", "BASKILI"];
export const SIZES = ["2x2", "2x3", "3x3", "3x4.5", "3x6", "4x4", "4x6", "4x8"];
export const SZ: Record<string, string> = { "2x2": "2 × 2", "2x3": "2 × 3", "3x3": "3 × 3", "3x4.5": "3 × 4,5", "3x6": "3 × 6", "4x4": "4 × 4", "4x6": "4 × 6", "4x8": "4 × 8" };
export const FRAME_IDS = ["SQ3", "SH4", "AH4", "SQ4", "AH5"];
/** Kumaş renkleri (GazeboTente ile aynı liste) */
export const COLORS = [
  { name: "Beyaz", hex: "#ffffff" }, { name: "Siyah", hex: "#1b1b1b" }, { name: "Açık Gri", hex: "#c9cbcd" }, { name: "Gri", hex: "#7d8084" },
  { name: "Krem", hex: "#efe6cf" }, { name: "Kırmızı", hex: "#c8102e" }, { name: "Bordo", hex: "#6e1423" }, { name: "Portakal", hex: "#f07d1a" },
  { name: "Sarı", hex: "#f6c915" }, { name: "Fıstık Yeşili", hex: "#8cc63f" }, { name: "Benetton", hex: "#00843d" }, { name: "Haki", hex: "#6b6b3a" },
  { name: "Mavi", hex: "#1f6fd1" }, { name: "Saks Mavi", hex: "#0f4c9e" }, { name: "Lacivert", hex: "#14213d" }, { name: "Lila", hex: "#b49bd6" },
  { name: "Mor", hex: "#5b2a86" }, { name: "Pembe", hex: "#ec7fb0" },
];
export const colorName = (hex?: string) => COLORS.find((c) => c.hex === (hex ?? "#ffffff"))?.name ?? hex ?? "Beyaz";
/** Hazır duvar düzenleri — sıra: Ön, Arka, Sol, Sağ */
export const PRESETS: { n: string; v: WallKind[] }[] = [
  { n: "Arkası tam, yanlar yarım", v: ["yok", "tam", "yarim", "yarim"] },
  { n: "Sadece arka duvar", v: ["yok", "tam", "yok", "yok"] },
  { n: "Arka ve yanlar tam, ön açık", v: ["yok", "tam", "tam", "tam"] },
  { n: "Önde kapı, diğerleri tam", v: ["kapi", "tam", "tam", "tam"] },
  { n: "Duvarsız", v: ["yok", "yok", "yok", "yok"] },
];

/** Görsel adresi: terminalin görsel anahtarı ("w:duz-tam", "r:3x3") → /terminal/img/w-duz-tam.webp; adres, site görseli (https://) ya da data: olduğu gibi */
export const imgSrc = (key: string) => (/^(\/|data:|https?:\/\/)/.test(key) ? key : `/terminal/img/${key.replace(":", "-")}.webp`);

export type Mode = 0 | 1; // 0 toptan, 1 perakende
/**
 * Kenar: tek parça ya da bölmeli. 6 m ve 8 m kenarlar 2 × 3 m / 2 × 4 m duvar olarak da kurulabilir (split);
 * bölmeli kenarda her bölme ayrı duvardır ("Ön 1", "Ön 2"), kendi ölçü grubundan fiyatlanır.
 */
export type Side = { split?: boolean; walls: Wall[] };
/** color: kumaş rengi (hex); fiyatı etkilemez, ürünün parçasıdır (eski terminal kayıtlarında yoktur → beyaz) */
/** wallColor: duvarların rengi; yoksa tavanla (color) aynı */
/** zemin: pilsa zemin eklendi mi (yalnız panel teklif ekranı) */
export type Gazebo = { size: string; frame: string | null; roofFab: number | null; sides: Side[]; color?: string; wallColor?: string; zemin?: boolean };

/** "Renk: Kırmızı" ya da tavan ve duvar farklıysa "Tavan: Kırmızı · Duvar: Beyaz"; dijital baskılı parçanın kumaş rengi olmaz */
export function colorText(g: Gazebo) {
  const need = colorNeeds(g);
  const roof = need.roof ? colorName(g.color) : "dijital baskı";
  const wall = !need.anyWall ? null : need.walls ? colorName(g.wallColor ?? g.color) : "dijital baskı";
  return !wall || roof === wall ? `Renk: ${roof}` : `Tavan: ${roof} · Duvar: ${wall}`;
}
/**
 * İskonto (tutarlar KDV hariç):
 * "yuzde" %, "tutar" adet başına TL (genel iskontoda toplamdan TL), "satir" satır toplamından TL,
 * "fiyat" satırda net birim fiyat, genel iskontoda hedef ara toplam.
 */
export type Isk = { tip: "yuzde" | "tutar" | "satir" | "fiyat"; d: number };
/** views: teklife eklenirken 3D'den alınan iki çapraz açı görüntüsü (sol-ön, sağ-arka); PDF'e basılır */
export type CartGazebo = Gazebo & { id: string; qty: number; isk: Isk; views?: string[] };
/**
 * Ek kalem: katalogdan bağımsız, adı ve fiyatı elle yazılan satır (nakliye, montaj, baskı ücreti…).
 * birim KDV hariç saklanır ve fiyat listesinden (toptan/perakende) etkilenmez.
 */
export type ExtraLine = { id: string; ad: string; aciklama: string; adet: number; birim: number; isk: Isk };
/** Ek kalem hazır adları */
export const EXTRA_PRESETS = ["Nakliye bedeli", "Montaj bedeli", "Baskı ücreti", "Tasarım ücreti", "Kurulum ve söküm"];
/** Teklifin tamamı (terminalin localStorage durumuyla aynı alanlar: eski teklifler aynen açılır) */
export type QuoteState = {
  mode: Mode;
  vat: 0 | 1;
  cart: CartGazebo[];
  prod: Record<string, number>;
  prodIsk: Record<string, Isk>;
  isk: Isk;
  /** Genel iskonto müşterinin iskonto grubundan geldiyse grubun adı (elle değişince silinir) */
  iskGrup?: string;
  /** Ek kalemler (eski kayıtlarda yoktur) */
  extra?: ExtraLine[];
  /** Teklifi veren marka (eski kayıtlarda yoktur → varsayılan marka) */
  markaId?: number;
};

/**
 * Markanın teklifte görünen kimliği: PDF başlığı, alt bilgi, banka bloğu, müşteri linki ve mesaj metni.
 * Teklif kaydedilirken veriye kopyalanır; marka bilgileri sonradan değişse de eski PDF aynen kalır.
 */
export type BrandCard = {
  id: number;
  kod: string;
  ad: string;
  renk: string;
  /** İkinci (koyu) renk ve PDF şablonu */
  renk2: string;
  sablon: "klasik" | "modern";
  logo: string | null;
  onEk: string;
  unvan: string;
  adres: string;
  telefon: string;
  eposta: string;
  web: string;
  vergi: string;
  ticSicil: string;
  mersis: string;
  banka: { banka: string; hesapAdi: string; musteriNo: string; iban: string };
  notlar: string[];
};

export const newIsk = (): Isk => ({ tip: "yuzde", d: 0 });
export const emptySides = (): Side[] => [0, 1, 2, 3].map(() => ({ walls: [emptyWall()] }));
export const val = (pair: Pair | undefined, mode: Mode) => (pair ? pair[mode] : null);
export const modeName = (mode: Mode) => (mode ? "Perakende" : "Toptan");

/**
 * İskelet ölçüsü → kenarlar. 2 ve 3 m serisi 200 cm, 4 m serisi 230 cm yükseklik.
 * Tek ara ayaklı uzun kenar (3x6'nın 6 m'si, 4x8'in 8 m'si) iki duvara bölünebilir; 4x6'nın 6 m kenarında iki ara ayak
 * (2 m'lik üç bölme) vardır, ikiye bölünmez (fiyat listesinde 230x300 duvar da yoktur).
 */
export function plan(size: string) {
  const [a, b] = size.split("x").map(Number);
  const h = a <= 3 ? 200 : 230;
  const side = (label: string, m: number) => {
    const cm = Math.round(m * 100);
    return { label, h, cm, grup: `${h}x${cm}`, splittable: (cm === 600 && h === 200) || cm === 800 };
  };
  return [side("Ön Duvar", b), side("Arka Duvar", b), side("Sol Duvar", a), side("Sağ Duvar", a)];
}

/** Duvar yuvası: kenar (ve bölme) başına bir duvar, kendi ölçü grubuyla */
export type Slot = { side: number; part: number; label: string; h: number; cm: number; grup: string; wall: Wall };
export function slots(g: Gazebo): Slot[] {
  return plan(g.size).flatMap((pl, i) => {
    const s = g.sides[i];
    if (pl.splittable && s.split) {
      const cm = pl.cm / 2;
      return s.walls.slice(0, 2).map((wall, part) => ({ side: i, part, label: `${pl.label} ${part + 1}`, h: pl.h, cm, grup: `${pl.h}x${cm}`, wall }));
    }
    return [{ side: i, part: 0, label: pl.label, h: pl.h, cm: pl.cm, grup: pl.grup, wall: s.walls[0] ?? emptyWall() }];
  });
}
const usedSlots = (g: Gazebo) => slots(g).filter((s) => s.wall.kind !== "yok");
/** FABRICS içinde dijital baskılı kumaşın sırası */
export const PRINTED_FAB = 2;
/** Hangi parça için kumaş rengi seçilir: baskılı tavan ve baskılı duvarların rengi olmaz */
export function colorNeeds(g: Gazebo) {
  const walls = usedSlots(g);
  return { roof: g.roofFab !== PRINTED_FAB, walls: walls.some((s) => s.wall.f !== PRINTED_FAB), anyWall: walls.length > 0 };
}
export const slotPrice = (s: Slot, mode: Mode) => wallPrice(s.grup, s.wall, mode);

export const framePrice = (g: Gazebo, mode: Mode) => {
  const p = g.frame ? priceTable().FRAMES[g.frame]?.p[g.size] : null;
  return p ? val(p, mode) : null;
};
export const roofPrice = (g: Gazebo, mode: Mode) => (g.roofFab === null ? null : val(priceTable().ROOF[g.size]?.[g.roofFab] ?? null, mode));
/** Ölçünün pilsa zemin fiyatı (seçili olmasa da; fiyatı girilmemişse null) */
export const floorPriceOf = (size: string, mode: Mode) => val(priceTable().FLOOR?.[size] ?? null, mode);
/** "300 × 450 cm" */
export const floorSize = (size: string) => size.split("x").map((m) => `${Math.round(Number(m) * 100)}`).join(" × ") + " cm";
export const unpricedWalls = (g: Gazebo, mode: Mode) => usedSlots(g).filter((s) => slotPrice(s, mode) === null).length;

/** "SQ3 iskelet · 690D Impertex tavan · 4 duvar" */
export function partsOf(g: Gazebo, mode: Mode) {
  const p: string[] = [];
  if (framePrice(g, mode) !== null) p.push(`${g.frame} iskelet`);
  if (roofPrice(g, mode) !== null) p.push(`${FABRICS[g.roofFab!].n} tavan`);
  const w = usedSlots(g).length;
  if (w) p.push(`${w} duvar`);
  if (g.zemin) p.push("pilsa zemin");
  return p;
}

/** "Ön: Çift Fermuarlı Kapı · Arka 1: Düz Tam Duvar" */
export function wallDetail(g: Gazebo) {
  return usedSlots(g).map((s) => `${s.label}: ${wallName(s.wall)}`).join(" · ") || "Duvarsız";
}

export type GzRow = { t: string; s: string; v: number; c: string; img: string | null; bad?: boolean };

/**
 * Gazebo dökümü: iskelet, tavan ve (aynı duvar/ölçü/kumaş birleştirilerek) duvarlar. Görseller 3D yapılandırıcınınkiler
 * (duvar tipi wk:*, tavan t:tavan); pencere/kapı ekleri (PVC, sineklik, perde) duvarın adında ve fiyatındadır.
 */
export function gzRows(g: Gazebo, mode: Mode): GzRow[] {
  const rows: GzRow[] = [];
  const fp = framePrice(g, mode);
  if (fp !== null) {
    const f = priceTable().FRAMES[g.frame!];
    rows.push({ t: `${g.frame} iskelet`, s: `${SZ[g.size]} m · ${f.desc}`, v: fp, c: `${g.frame} iskelet (${f.desc})`, img: `f:${g.frame}` });
  }
  const rp = roofPrice(g, mode);
  if (rp !== null) rows.push({ t: "Tavan kumaşı", s: `${SZ[g.size]} m · ${FABRICS[g.roofFab!].n}`, v: rp, c: `Tavan kumaşı · ${FABRICS[g.roofFab!].n}`, img: "t:tavan" });
  const agg = new Map<string, { t: string; s: string; v: number; n: number; bad: boolean; img: string }>();
  for (const sl of usedSlots(g)) {
    const name = wallName(sl.wall);
    const dim = sl.wall.kind === "yarim" ? `100 × ${sl.cm}` : `${sl.h} × ${sl.cm}`;
    const pr = slotPrice(sl, mode);
    const key = `${wallKey(sl.wall)}|${dim}`;
    const c = agg.get(key) ?? { t: name, s: `${dim} cm · ${FABRICS[sl.wall.f].n}`, v: 0, n: 0, bad: false, img: kindImage(sl.wall.kind)! };
    c.n++;
    if (pr === null) c.bad = true;
    else c.v += pr;
    agg.set(key, c);
  }
  for (const c of agg.values()) {
    const nm = c.t + (c.n > 1 ? ` × ${c.n}` : "");
    rows.push({ t: nm, s: c.s, v: c.v, bad: c.bad, c: `${nm} · ${c.s}`, img: c.img });
  }
  if (g.zemin) {
    const zp = floorPriceOf(g.size, mode);
    rows.push({ t: "Pilsa zemin", s: floorSize(g.size), v: zp ?? 0, bad: zp === null, c: `Pilsa zemin · ${floorSize(g.size)}`, img: null });
  }
  return rows;
}
export const gzTotal = (g: Gazebo, mode: Mode) => gzRows(g, mode).reduce((a, r) => a + (r.bad ? 0 : r.v), 0);
export const cfgKey = (g: Gazebo) =>
  [g.size, g.frame, g.roofFab, g.sides.map((s) => `${s.split ? "b" : "t"}${s.walls.map(wallKey).join("+")}`).join(","), g.color ?? "#ffffff", g.wallColor ?? "", g.zemin ? "z" : ""].join("|");

/** Eski kayıtlardaki kenar ({t, f}: terminalin 12 duvar ürünü) ya da yeni kenar → yeni kenar */
export function sideFrom(raw: unknown): Side {
  const r = raw as { t?: string | null; f?: number; split?: boolean; walls?: Wall[] } | null;
  if (r && Array.isArray(r.walls) && r.walls.length) return { split: !!r.split, walls: r.walls.map((w) => normalizeWall({ kind: w.kind ?? "yok", f: w.f ?? 0, p: w.p, k: w.k, y: w.y })) };
  return { walls: [wallFromLegacy(r?.t ?? null, r?.f ?? 0)] };
}

/* ---------------- iskonto ----------------
   İki kademe: (1) satır — her gazebo ve ürün kendi indirimini taşır, (2) genel — satır indirimlerinden sonraki ara toplama.
   tip "yuzde" = %, "tutar" = adet başına TL, "satir" = satır toplamından TL, "fiyat" = net birim fiyat.
   d pozitifse indirim, negatifse ilave (zam). Yüzdede birim tam TL'ye yuvarlanır (eski kayıtlarla aynı sonuç);
   TL ve birim fiyatta girilen tutar yuvarlanmaz (KDV dahil yazılan 10.000 TL, KDV dahil 10.000 TL kalsın). */
export const iskYok = (i?: Isk) => !i || !i.d;
export function netBirim(liste: number, i?: Isk) {
  if (iskYok(i)) return liste;
  if (i!.tip === "fiyat") return Math.max(0, i!.d);
  if (i!.tip === "yuzde") return Math.max(0, Math.round(liste * (1 - i!.d / 100)));
  return Math.max(0, liste - i!.d);
}
/** Satırın net birimi ve net tutarı (liste birim fiyattan, adet ve satır iskontosuyla) */
export function satirNet(liste: number, adet: number, i?: Isk) {
  if (!iskYok(i) && i!.tip === "satir") {
    const v = Math.max(0, liste * adet - i!.d);
    return { net: adet ? v / adet : 0, v };
  }
  const net = netBirim(liste, i);
  return { net, v: net * adet };
}
/** Kullanıcının yazdığı tutar (ekrandaki KDV tercihine göre) → KDV hariç saklanan değer */
export const haricOf = (n: number, vat: 0 | 1) => Math.round((vat ? n / 1.2 : n) * 10_000) / 10_000;
export const TL = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} TL`;
const yuzde = (n: number) => `%${n.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;
/**
 * "%10 ind." / "500 TL/adet ind." / "2.000 TL ilave" / "Birim 10.000 TL" — tutarlar ekrandaki KDV tercihiyle.
 * genel: genel iskonto ("tutar" toplamdan TL, "fiyat" hedef toplam).
 */
export function iskEtiket(i?: Isk, vat: 0 | 1 = 0, genel = false) {
  if (iskYok(i)) return "";
  const k = (n: number) => TL(vat ? n * 1.2 : n);
  const ek = i!.d < 0 ? " ilave" : " ind.";
  const d = Math.abs(i!.d);
  if (i!.tip === "yuzde") return yuzde(d) + ek;
  if (i!.tip === "fiyat") return `${genel ? "Toplam" : "Birim"} ${k(i!.d)}`;
  return k(d) + (i!.tip === "tutar" && !genel ? "/adet" : "") + ek;
}
/** Liste fiyatına göre oran: "%15,19 ind." / "%5 ilave"; fark yoksa boş. PDF ve müşteri sayfası da kayıttaki tutarlardan bunu hesaplar */
export function oranEtiket(liste: number, net: number) {
  if (liste <= 0 || Math.abs(liste - net) < 0.005) return "";
  const p = Math.round((1 - net / liste) * 10_000) / 100;
  return p === 0 ? "" : yuzde(Math.abs(p)) + (p > 0 ? " ind." : " ilave");
}
/** Belgedeki (PDF, döküm, müşteri linki) iskonto yazısı: türü ne olursa olsun müşteri liste fiyatına göre oranı görür */
export const belgeEtiket = (i: Isk | undefined, liste: number, net: number) => (iskYok(i) ? "" : oranEtiket(liste, net));

export type Row = { key: string; t: string; s: string; birim: number; net: number; adet: number; isk?: Isk; liste: number; v: number; bad?: boolean };

/** Teklifin tüm satırları (gazeboler + katalog ürünleri + ek kalemler) */
export function allRows(q: QuoteState, catalog: Catalog): Row[] {
  const rows: Row[] = [];
  for (const c of q.cart) {
    const liste = gzTotal(c, q.mode);
    const { net, v } = satirNet(liste, c.qty, c.isk);
    rows.push({
      key: c.id,
      t: `Gazebo ${SZ[c.size]} m${c.qty > 1 ? ` × ${c.qty}` : ""}`,
      s: partsOf(c, q.mode).join(" · ") || "bileşen yok",
      birim: liste, net, adet: c.qty, isk: c.isk, liste: liste * c.qty, v,
      bad: unpricedWalls(c, q.mode) > 0,
    });
  }
  for (const g of catalog)
    for (const it of g.items) {
      const pr = val(it.p, q.mode);
      if (pr === null) continue;
      for (const { key, hex, olcu, qty } of itemLines(q, it)) {
        const i = q.prodIsk[key];
        const birim = linePrice(pr, olcu);
        const { net, v } = satirNet(birim, qty, i);
        const ad = hex ? `${it.n} · ${colorName(hex)}` : it.n;
        const s = olcu ? [olcuText(olcu), it.s].filter(Boolean).join(" · ") : it.s;
        rows.push({ key, t: ad + (qty > 1 ? ` × ${qty}` : ""), s, birim, net, adet: qty, isk: i, liste: birim * qty, v });
      }
    }
  for (const x of q.extra ?? []) {
    const { net, v } = satirNet(x.birim, x.adet, x.isk);
    rows.push({ key: x.id, t: x.ad + (x.adet > 1 ? ` × ${x.adet}` : ""), s: x.aciklama, birim: x.birim, net, adet: x.adet, isk: x.isk, liste: x.birim * x.adet, v });
  }
  return rows;
}

/** Tutar kırılımı — tek yerden, herkes bunu kullanır */
export function hesap(q: QuoteState, catalog: Catalog, rows = allRows(q, catalog)) {
  const araListe = rows.reduce((a, r) => a + r.liste, 0);
  const araNet = rows.reduce((a, r) => a + r.v, 0);
  const satirIsk = araListe - araNet;
  // Yüzde tam TL'ye yuvarlanır (eski kayıtlar); TL ve hedef toplam kuruşuyla (KDV dahil yazılan tutar aynen çıksın)
  const g = q.isk;
  let genelIsk = iskYok(g) ? 0 : g.tip === "yuzde" ? Math.round((araNet * g.d) / 100) : Math.round((g.tip === "fiyat" ? araNet - g.d : g.d) * 100) / 100;
  if (genelIsk > araNet) genelIsk = araNet; // toplam eksiye düşmesin
  return { rows, araListe, araNet, satirIsk, genelIsk, net: araNet - genelIsk };
}

export const cartUnpriced = (q: QuoteState) => q.cart.reduce((a, c) => a + unpricedWalls(c, q.mode), 0);


export type PdfForm = {
  musteri: string;
  yetkili: string;
  telefon: string;
  eposta: string;
  gun: number;
  hazirlayan: string;
  not: string;
  gorsel: boolean;
};

/** PDF'in ihtiyaç duyduğu her şey (terminalin js/pdf.js biçimi); numara ve dosya adını kayıt sırasında sunucu verir */
export function quoteData(q: QuoteState, f: PdfForm, catalog: Catalog, brand: BrandCard) {
  const adj = (n: number) => (q.vat ? n * 1.2 : n);
  const kalemler = [
    ...q.cart.map((c) => {
      const liste = gzTotal(c, q.mode);
      const { net, v } = satirNet(liste, c.qty, c.isk);
      const wd = wallDetail(c);
      return {
        ad: `Gazebo çadır ${SZ[c.size]} m`,
        alt: [...partsOf(c, q.mode), colorText(c)].join(" · ") + (wd !== "Duvarsız" ? `\n${wd}` : ""),
        adet: c.qty,
        birim: adj(liste),
        isk: belgeEtiket(c.isk, liste, net),
        tutar: adj(v),
        // 3D görüntüsü varsa satır görseli odur; iki açı tablonun altında büyük basılır
        img: c.views?.[0] ?? `r:${c.size}`,
        gorseller: c.views ?? [],
        parcalar: gzRows(c, q.mode).map((r) => ({ ad: r.c || r.t, fiyat: r.bad ? null : adj(r.v), img: r.img })),
      };
    }),
    ...catalog.flatMap((g) =>
      g.items.flatMap((it) => {
        const pr = val(it.p, q.mode);
        if (pr === null) return [];
        return itemLines(q, it).map(({ key, hex, olcu, qty }) => {
          const i = q.prodIsk[key];
          const birim = linePrice(pr, olcu);
          const { net, v } = satirNet(birim, qty, i);
          return {
            ad: it.n,
            alt: hex
              ? [it.s, `Renk: ${colorName(hex)}`].filter(Boolean).join(" · ")
              : olcu
                ? [olcuText(olcu), `m² ${TL(adj(pr))}`, it.s].filter(Boolean).join(" · ")
                : it.s,
            adet: qty, birim: adj(birim), isk: belgeEtiket(i, birim, net), tutar: adj(v),
            // Renkli ürün: PDF'te o rengin boyanmış görseli (hazırsa)
            img: hex && it.img ? (recolored(imgSrc(it.img), hex) ?? it.img) : it.img,
            parcalar: [],
          };
        });
      }),
    ),
    ...(q.extra ?? []).map((x) => {
      const { net, v } = satirNet(x.birim, x.adet, x.isk);
      return { ad: x.ad, alt: x.aciklama, adet: x.adet, birim: adj(x.birim), isk: belgeEtiket(x.isk, x.birim, net), tutar: adj(v), img: null as string | null, parcalar: [] };
    }),
  ];
  const H = hesap(q, catalog);
  const ham = H.net;
  const uyarilar: string[] = [];
  const unpriced = cartUnpriced(q);
  if (unpriced) uyarilar.push(`${unpriced} duvar için broşürde fiyat verilmemiştir (“fiyat alınız”). Bu kalemler toplama dahil değildir.`);
  if (!q.mode) uyarilar.push("Bu belge TOPTAN (bayi) fiyatlarıyla hazırlanmıştır.");
  let gecerlilik = "";
  const gun = Math.max(0, Math.min(365, Math.round(f.gun) || 0));
  if (gun > 0) {
    const d = new Date();
    d.setDate(d.getDate() + gun);
    gecerlilik = `${d.toLocaleDateString("tr-TR")} (${gun} gün)`;
  }
  return {
    no: "",
    tarih: new Date().toLocaleDateString("tr-TR"),
    gecerlilik,
    hazirlayan: f.hazirlayan.trim(),
    musteri: f.musteri.trim(),
    yetkili: f.yetkili.trim(),
    iletisim: [f.telefon.trim(), f.eposta.trim()].filter(Boolean).join(" · "),
    modeAd: modeName(q.mode),
    toptan: !q.mode,
    vatOn: !!q.vat,
    gorsel: f.gorsel,
    kalemler,
    araListe: H.araListe,
    satirIsk: H.satirIsk,
    genelIsk: H.genelIsk,
    genelIskEtiket: q.iskGrup && !iskYok(q.isk) ? `${q.iskGrup} · ${iskEtiket(q.isk, q.vat, true)}` : belgeEtiket(q.isk, H.araNet, H.net),
    araToplam: ham,
    kdv: ham * 0.2,
    genelToplam: ham * 1.2,
    uyarilar,
    notlar: [...brand.notlar, ...f.not.split("\n")].map((s) => s.trim()).filter(Boolean),
    dosyaAdi: "",
    /** Markanın kimliği (PDF ve müşteri linki); eski kayıtlarda yoktur → SKY */
    firma: brand as BrandCard | undefined,
  };
}
/**
 * link: müşterinin teklifi görüp onaylayacağı adres (/t/<kod>); kayıtta saklanmaz, PDF basılırken verilir — siparişe dönmüş
 * ya da müşteri sayfasından indirilen PDF'te "online onaylayın" kutusu çıkmasın. qr: link'in QR kodu (pdf.ts üretir).
 */
export type PdfData = ReturnType<typeof quoteData> & { link?: string | null; qr?: string };

/** PDF dosya adı (terminaldeki kuralın aynısı) */
export function pdfFileName(no: string, musteri: string) {
  return (
    `Teklif-${no}${musteri ? `-${musteri}` : ""}`
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "_")
      .slice(0, 90)
      .replace(/[.\-_]+$/, "") + ".pdf"
  );
}
