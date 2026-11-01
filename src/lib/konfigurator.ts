// Site konfigüratörü (sitelere gömülen gazebo tasarımı) için ortak kurallar: hem tarayıcıdaki ekran hem fiyatı imzalayan
// sunucu aynı sadeleştirmeyi uygular. Tavan ve duvarlar aynı kumaştan (roofFab), kenarlar bölünmez, fiyat perakende;
// fiyatı olmayan duvar seçilemez. Hesaplar etkin fiyat tablosunu okur (priceTable / withPriceTable).

import { FABRICS, SIZES, SZ, plan, val, type Gazebo } from "@/lib/terminal/calc";
import { priceTable } from "@/lib/terminal/price-table";
import { WALL_KINDS, closestAvailable, normalizeWall, wallKey, wallName, wallPrice, type Wall } from "@/modules/gazebo/walls";

export const KONF_MODE = 1 as const; // perakende
export const KONF_KDV = 20;

/** İskelet serileri ve malzemesi (3D'deki iskelet rengiyle aynı) */
export const KONF_FRAMES = ["SQ3", "SH4", "AH4", "SQ4", "AH5"];
export const FRAME_MAT: Record<string, string> = { SQ3: "Beyaz boyalı çelik", SH4: "Siyah boyalı çelik", SQ4: "Siyah boyalı çelik", AH4: "Alüminyum", AH5: "Alüminyum" };
export const SIDE_NAMES = ["Ön", "Arka", "Sol", "Sağ"];
/** Müşterinin bildiği iskelet adları (tablodaki açıklama alt yazıda kalır) */
export const FRAME_NAME: Record<string, string> = {
  SQ3: "30'luk Çelik İskelet",
  SH4: "40'lık Çelik İskelet",
  SQ4: "40'lık Çelik İskelet",
  AH4: "40'lık Alüminyum İskelet",
  AH5: "52'lik Alüminyum İskelet",
};

/** Ölçüde satılan iskelet serileri */
export const framesOf = (size: string) => KONF_FRAMES.filter((id) => val(priceTable().FRAMES[id]?.p[size] ?? null, KONF_MODE) !== null);

/** Duvarı o kenarın ölçü grubunda satılabilir hale getirir; satılamıyorsa duvar kalkar */
export function fitWall(grup: string, w: Wall): Wall {
  if (w.kind === "yok") return { kind: "yok", f: w.f };
  const c = closestAvailable(grup, normalizeWall(w), KONF_MODE);
  return wallPrice(grup, c, KONF_MODE) === null ? { kind: "yok", f: w.f } : c;
}

/** Kumaş adı (baskılı için müşteriye anlaşılır ad) */
export const fabricName = (f: number) => (f === 2 ? "Dijital baskılı kumaş" : FABRICS[f]?.n ?? "");

/**
 * Dışarıdan gelen (tarayıcı) yapılandırmayı doğrular ve sadeleştirilmiş kurala çeker. Seçim artık satılmıyorsa
 * (ör. fiyat kaldırıldı) hata döner; sessizce başka bir ürüne çevrilmez.
 */
export function cleanConfig(raw: unknown, colors: string[]): { ok: true; g: Gazebo } | { ok: false; hata: string } {
  const r = (raw ?? {}) as Partial<Gazebo> & { sides?: { walls?: Partial<Wall>[] }[] };
  if (!SIZES.includes(String(r.size))) return { ok: false, hata: "Geçersiz ölçü." };
  const size = String(r.size);
  if (!r.frame || !framesOf(size).includes(r.frame)) return { ok: false, hata: "Bu ölçüde seçilen iskelet satılmıyor." };
  const f = Number(r.roofFab);
  if (![0, 1, 2].includes(f) || val(priceTable().ROOF[size]?.[f] ?? null, KONF_MODE) === null) return { ok: false, hata: "Seçilen kumaş bu ölçüde satılmıyor." };
  const color = f === 2 ? undefined : String(r.color ?? "");
  if (color !== undefined && !colors.includes(color)) return { ok: false, hata: "Seçilen renk şu an stokta yok." };
  // Duvar rengi tavandan farklı olabilir (dört duvar aynı renk)
  const wallColor = f === 2 || !r.wallColor || r.wallColor === color ? undefined : String(r.wallColor);
  if (wallColor !== undefined && !colors.includes(wallColor)) return { ok: false, hata: "Seçilen duvar rengi şu an stokta yok." };
  if (!Array.isArray(r.sides) || r.sides.length !== 4) return { ok: false, hata: "Duvar bilgisi eksik." };
  const p = plan(size);
  const sides: Gazebo["sides"] = [];
  for (let i = 0; i < 4; i++) {
    const w0 = r.sides[i]?.walls?.[0] ?? {};
    const kind = WALL_KINDS.find((k) => k.kind === w0.kind)?.kind ?? "yok";
    const want = normalizeWall({ kind, f, p: w0.p, k: w0.k } as Wall);
    const got = fitWall(p[i].grup, want);
    if (wallKey(got) !== wallKey(want)) return { ok: false, hata: `${SIDE_NAMES[i]} duvar seçimi bu ölçüde satılmıyor.` };
    sides.push({ walls: [got] });
  }
  return { ok: true, g: { size, frame: r.frame, roofFab: f, sides, ...(color ? { color } : {}), ...(wallColor ? { wallColor } : {}) } };
}

/** Sepette ve siparişte görünen özet satırları (colorOf: renk kodu → adı) */
export function summaryLines(g: Gazebo, colorOf: (hex?: string) => string) {
  const f = g.roofFab ?? 0;
  const walls = g.sides.map((s, i) => (s.walls[0].kind === "yok" ? null : `${SIDE_NAMES[i]}: ${wallName(s.walls[0])}`)).filter(Boolean);
  return [
    { ad: "Ölçü", deger: `${SZ[g.size]} m` },
    { ad: "İskelet", deger: FRAME_NAME[g.frame!] ?? priceTable().FRAMES[g.frame!]?.desc ?? g.frame ?? "" },
    { ad: "Kumaş", deger: fabricName(f) },
    ...(f === 2
      ? []
      : g.wallColor
        ? [
            { ad: "Tavan rengi", deger: colorOf(g.color) },
            { ad: "Duvar rengi", deger: colorOf(g.wallColor) },
          ]
        : [{ ad: "Renk", deger: colorOf(g.color) }]),
    { ad: "Duvarlar", deger: walls.join(" · ") || "Duvarsız" },
    { ad: "Duvar yüksekliği", deger: `${plan(g.size)[0].h} cm` },
  ];
}

/* ───────────── ek ürünler ───────────── */

/** Son adımda önerilen ek ürünler: teklif ürünlerinde bu kategorilerdeki ürünler (fiyat ve görsel markanınki) */
export const KONF_EK_KATEGORI = ["Sabitleme", "Taşıma Çantası", "Gazebo Aksesuarları"];

export type KonfEk = { kod: string; grup: string; ad: string; aciklama: string; gorsel: string | null; uyari?: string; fiyat: number; olculer: string[] | null;
  /** Sitedeki asıl ürün: sepete bu varyasyon eklenir (fiyatı sitenin) */
  woo?: { urun: number; varyasyon: number } };

/**
 * Ürünün uyduğu gazebo ölçüleri: adında ya da açıklamasında ölçü geçiyorsa (ör. taşıma çantası "2x2, 2x3, 3x3")
 * yalnızca o ölçülerde önerilir; ölçü geçmiyorsa her ölçüde. "3x4,5" ve "300x450" de tanınır.
 */
export function ekSizes(text: string): string[] | null {
  const found = new Set<string>();
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/g)) {
    const n = (v: string) => {
      const x = Number(v.replace(",", "."));
      return x >= 100 ? x / 100 : x;
    };
    const key = `${n(m[1])}x${n(m[2])}`;
    if (SIZES.includes(key)) found.add(key);
  }
  return found.size ? [...found] : null;
}

/** Sepete giden ek ürün seçimi: kod → adet; ölçüye uymayan, fiyatı olmayan ya da bilinmeyen ürün hata verir */
export function cleanExtras(raw: unknown, ekler: KonfEk[], size: string): { ok: true; list: { ek: KonfEk; adet: number }[] } | { ok: false; hata: string } {
  const list: { ek: KonfEk; adet: number }[] = [];
  for (const [kod, n] of Object.entries((raw ?? {}) as Record<string, unknown>)) {
    const adet = Math.round(Number(n));
    if (!adet) continue;
    const ek = ekler.find((e) => e.kod === kod);
    if (!ek || adet < 0 || adet > 999 || (ek.olculer && !ek.olculer.includes(size))) return { ok: false, hata: "Ek ürün seçimi geçersiz; sayfayı yenileyip tekrar deneyin." };
    list.push({ ek, adet });
  }
  return { ok: true, list };
}
