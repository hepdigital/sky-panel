import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { FABRICS, SIZES, SZ, gzRows, gzTotal, plan, val, type Gazebo } from "@/lib/terminal/calc";
import { FRAME_MAT, FRAME_NAME, KONF_KDV, KONF_MODE, SIDE_NAMES, cleanConfig, cleanExtras, framesOf } from "@/lib/konfigurator";
import { priceTable, withPriceTable } from "@/lib/terminal/price-table";
import { wallImage, wallName, wallPrice, type Wall } from "@/modules/gazebo/walls";
import { and, eq, isNotNull } from "drizzle-orm";
import { fold, type Kart } from "./cards";
import { getCatalog } from "../catalog";
import { db, schema } from "../db";
import { wcProductLinks } from "../marketplaces/woocommerce";
import { listColors } from "../colors";
import { saveWebp } from "../files";
import { gazeboTables } from "../gazebo-prices";
import { encodeDesign, konfExtras } from "../konfigurator";

// Asistanın gazebo araçları: sitedeki "Kendin Tasarla" konfigüratörüyle aynı kurallar ve fiyatlar (markanın modüler gazebo tablosu,
// perakende, tavan ve duvarlar aynı kumaştan, kenarlar bölünmez). Asistanın söylediği fiyat, müşterinin tasarım linkinde göreceği fiyattır.
// Panel kataloğu: teklif ürünleri (perakende, KDV dahil); toptan fiyat ve maliyet dönmez.

/** Duvar seçenekleri: asistanın kullandığı kısa adlar → modüler duvar */
const DUVARLAR: Record<string, Omit<Wall, "f">> = {
  yok: { kind: "yok" },
  tam: { kind: "tam" },
  yarim: { kind: "yarim" },
  tam_sineklik: { kind: "tam-sineklik" },
  tam_pvc: { kind: "tam-pvc" },
  tek_fermuarli_kapi: { kind: "tek-fermuar" },
  pvc_pencere: { kind: "pencere", p: { pvc: true, sineklik: false, perde: false } },
  pvc_perde_pencere: { kind: "pencere", p: { pvc: true, sineklik: false, perde: true } },
  pvc_sineklik_perde_pencere: { kind: "pencere", p: { pvc: true, sineklik: true, perde: true } },
  sineklik_pencere: { kind: "pencere", p: { pvc: false, sineklik: true, perde: false } },
  sineklik_perde_pencere: { kind: "pencere", p: { pvc: false, sineklik: true, perde: true } },
  kapi: { kind: "kapi", k: { sineklik: false } },
  sineklikli_kapi: { kind: "kapi", k: { sineklik: true } },
  pvc_pencere_kapi: { kind: "pencere-kapi", p: { pvc: true, sineklik: false, perde: true }, k: { sineklik: false } },
  pvc_sineklik_pencere_sineklikli_kapi: { kind: "pencere-kapi", p: { pvc: true, sineklik: true, perde: true }, k: { sineklik: true } },
};
export const DUVAR_SECENEKLERI = Object.keys(DUVARLAR);
const KUMASLAR = { "690D": 0, "200D": 1, baskili: 2 } as const;
export const KUMAS_SECENEKLERI = Object.keys(KUMASLAR);
type Kumas = keyof typeof KUMASLAR;

const kdv = (n: number) => Math.round(n * (1 + KONF_KDV / 100));
const kumasAd = (f: number) => (f === 2 ? "Dijital baskılı Oxford (tavan ve duvarlar baskılı)" : `${FABRICS[f].n} (${FABRICS[f].d.toLocaleLowerCase("tr")})`);
const sizeOf = (v: string | null) => {
  const s = String(v ?? "").toLowerCase().replace(/\s/g, "").replace(",", ".").replace("×", "x");
  return SIZES.find((x) => x === s) ?? null;
};
/** Kenarlar: ön ve arka aynı, sol ve sağ aynı ölçüde */
const kenarlar = (size: string) => {
  const p = plan(size);
  return [{ kenarlar: "Ön ve arka", grup: p[0].grup, m: p[0].cm / 100 }, { kenarlar: "Sol ve sağ", grup: p[2].grup, m: p[2].cm / 100 }];
};

async function table(markaId: number) {
  return (await gazeboTables([markaId]))[markaId];
}

/** Tasarım linki: sitedeki konfigüratör, ölçü ve baskı önceden seçili */
export function designLink(card: Kart | null, siteAdres: string, size: string | null, f: number | null, tasarim?: string) {
  const base = card?.url || `${siteAdres.replace(/\/+$/, "")}/gazebo-tasarla/`;
  const q = new URLSearchParams();
  if (tasarim) q.set("tasarim", tasarim);
  else if (size) q.set("olcu", size);
  if (f !== null && !tasarim) q.set("baski", f === 2 ? "baskili" : "baskisiz");
  return q.size ? `${base}${base.includes("?") ? "&" : "?"}${q}` : base;
}

/** Ölçüler (ölçü verilmezse) ya da bir ölçünün iskelet, kumaş ve duvar seçenekleri fiyatlarıyla */
export async function gazeboSecenekleri(markaId: number, card: Kart | null, siteAdres: string, olcuRaw: string | null, kumasRaw: string | null) {
  const t = await table(markaId);
  const f = kumasRaw && kumasRaw in KUMASLAR ? KUMASLAR[kumasRaw as Kumas] : null;
  const size = sizeOf(olcuRaw);
  if (olcuRaw && !size) return { hata: `Bu ölçü yok. Ölçüler: ${SIZES.join(", ")}. Farklı ölçü özel üretimdir: bilgileri topla ve ekibe devret.` };
  return withPriceTable(t, () => {
    if (!size) {
      return {
        olculer: SIZES.flatMap((s) => {
          const fr = framesOf(s);
          const roof = val(priceTable().ROOF[s]?.[f ?? 0] ?? null, KONF_MODE);
          if (!fr.length || roof === null) return [];
          const enUcuz = Math.min(...fr.map((id) => val(priceTable().FRAMES[id].p[s]!, KONF_MODE)!));
          return [{ olcu: s, ad: `${SZ[s]} m`, iskeletler: fr.map((id) => FRAME_NAME[id]), duvarsiz_baslangic_kdv_dahil: kdv(enUcuz + roof) }];
        }),
        kumas: f === null ? "690D (baskısız) üzerinden" : kumasAd(f),
        tasarim_linki: designLink(card, siteAdres, null, f),
        not: "Fiyatlar duvarsız (iskelet + tavan), KDV dahil başlangıç fiyatıdır; duvar eklendikçe artar. En çok tercih edilen ölçü 3x3. Ölçü belli olunca gazebo_secenekleri'ni o ölçüyle çağır.",
      };
    }
    const kumaslar = [0, 1, 2].flatMap((i) => {
      const p = val(priceTable().ROOF[size]?.[i] ?? null, KONF_MODE);
      return p === null ? [] : [{ kumas: KUMAS_SECENEKLERI[i], ad: kumasAd(i), tavan_fiyati_kdv_dahil: kdv(p) }];
    });
    const fab = f ?? 0;
    return {
      olcu: size,
      yukseklik_cm: plan(size)[0].h,
      iskeletler: framesOf(size).map((id) => ({ iskelet: id, ad: FRAME_NAME[id], malzeme: FRAME_MAT[id], fiyat_kdv_dahil: kdv(val(priceTable().FRAMES[id].p[size]!, KONF_MODE)!) })),
      kumaslar,
      duvar_kumasi: kumasAd(fab),
      duvarlar: kenarlar(size).map((k) => ({
        kenarlar: k.kenarlar,
        uzunluk_m: k.m,
        secenekler: DUVAR_SECENEKLERI.flatMap((key) => {
          if (key === "yok") return [];
          const w = { ...DUVARLAR[key], f: fab } as Wall;
          const p = wallPrice(k.grup, w, KONF_MODE);
          return p === null ? [] : [{ duvar: key, ad: wallName(w), fiyat_kdv_dahil: kdv(p) }];
        }),
      })),
      tasarim_linki: designLink(card, siteAdres, size, f),
      not: "Toplam = iskelet + tavan + seçilen duvarlar (her kenar ayrı). Kesin toplam için gazebo_fiyatla. Duvarlar tavanla aynı kumaştan yapılır.",
    };
  });
}

/** Ayak sayısı: sabitleme ürünlerinde önerilen adet (ayak başına bir) */
const AYAK: Record<string, number> = { "2x2": 4, "2x3": 4, "3x3": 4, "3x4.5": 4, "4x4": 4, "3x6": 6, "4x8": 6, "4x6": 8 };

/** Konfigüratörün son adımındaki ek ürünler (taşıma çantası sitenin fiyatıyla, sabitleme panelden), o ölçüye uyanlar */
async function ekUrunler(markaId: number, size: string) {
  const list = (await konfExtras(markaId).catch(() => [])).filter((e) => !e.olculer || e.olculer.includes(size));
  return list.map((e) => ({
    kod: e.kod, grup: e.grup, ad: e.ad, aciklama: e.aciklama || null, fiyat_kdv_dahil: kdv(e.fiyat),
    ...(fold(e.grup) === "sabitleme" ? { onerilen_adet: AYAK[size] ?? 4 } : {}),
  }));
}

export type GazeboInput = { olcu: string; iskelet: string | null; kumas: string; on: string; arka: string; sol: string; sag: string; adet: number | null };

/** Bir gazebo tasarımının konfigüratördeki fiyatı; iskelet verilmezse (ya da görselden anlaşılamadıysa) her iskelet için */
export async function gazeboFiyatla(markaId: number, card: Kart | null, siteAdres: string, i: GazeboInput) {
  const size = sizeOf(i.olcu);
  if (!size) return { hata: `Bu ölçü yok. Ölçüler: ${SIZES.join(", ")}.` };
  if (!(i.kumas in KUMASLAR)) return { hata: `Kumaş şunlardan biri olmalı: ${KUMAS_SECENEKLERI.join(", ")}` };
  const f = KUMASLAR[i.kumas as Kumas];
  const keys = [i.on, i.arka, i.sol, i.sag];
  const bad = keys.find((k) => !(k in DUVARLAR));
  if (bad) return { hata: `Bilinmeyen duvar: ${bad}. Seçenekler: ${DUVAR_SECENEKLERI.join(", ")}` };
  const [t, colors] = await Promise.all([table(markaId), listColors()]);
  const active = colors.filter((c) => c.aktif).map((c) => c.hex);
  // Renk fiyatı etkilemez; doğrulama için stokta olan ilk renk kullanılır
  const color = f === 2 ? undefined : active[0];
  const adet = Math.max(1, Math.min(99, Math.round(Number(i.adet) || 1)));
  const r = withPriceTable(t, () => {
    const frames = i.iskelet ? [i.iskelet] : framesOf(size);
    const sonuclar = [];
    for (const frame of frames) {
      const c = cleanConfig({ size, frame, roofFab: f, color, sides: keys.map((k) => ({ walls: [{ ...DUVARLAR[k], f }] })) }, active);
      if (!c.ok) return { hata: `${c.hata} gazebo_secenekleri ile bu ölçüdeki iskelet ve duvarlara bak.` };
      const g: Gazebo = c.g;
      const rows = gzRows(g, KONF_MODE);
      if (rows.some((r) => r.bad)) return { hata: "Seçimde fiyatı olmayan bir parça var; o duvar bu ölçüde satılmıyor." };
      const birim = kdv(gzTotal(g, KONF_MODE));
      sonuclar.push({ iskelet: frame, iskelet_ad: FRAME_NAME[frame], birim_fiyat_kdv_dahil: birim, toplam_kdv_dahil: birim * adet, parcalar: rows.map((r) => ({ ad: r.c || r.t, fiyat_kdv_dahil: kdv(r.v) })) });
    }
    return {
      olcu: `${SZ[size]} m`,
      kumas: kumasAd(f),
      duvarlar: keys.map((k, n) => `${SIDE_NAMES[n]}: ${k === "yok" ? "yok" : wallName({ ...DUVARLAR[k], f } as Wall)}`).join(" · "),
      adet,
      sonuclar,
      tasarim_linki: designLink(card, siteAdres, size, f),
      not: `${sonuclar.length > 1 ? "İskelet belli olmadığı için her iskeletin fiyatı verildi; müşteriye seçenek olarak sun. " : ""}Fiyat sitedeki Kendin Tasarla ekranındaki fiyattır (KDV dahil). Müşteri tasarım linkinden aynı seçimle sepete ekleyip ödeyebilir. Ek ürünleri (taşıma çantası, sabitleme: ayak sayısı kadar önerilir) ek_urunler'den öner.`,
    };
  });
  return r.hata ? r : { ...r, ayak_sayisi: AYAK[size], ek_urunler: await ekUrunler(markaId, size) };
}

/** Onaya ve ödeme linkine giden tek tasarım: iskelet ve renk belli (baskılıda renk yok), ek ürünler kodla */
export type GazeboSecim = GazeboInput & { iskelet: string; renk: string; ekler: { kod: string; adet: number }[] };

/** Tasarımı doğrular ve fiyatlar (onay görseli ve ödeme linki aynı hesaptan geçer) */
export async function priceGazebo(markaId: number, i: GazeboSecim) {
  const size = sizeOf(i.olcu);
  if (!size) return { ok: false as const, hata: `Bu ölçü yok. Ölçüler: ${SIZES.join(", ")}.` };
  if (!(i.kumas in KUMASLAR)) return { ok: false as const, hata: `Kumaş şunlardan biri olmalı: ${KUMAS_SECENEKLERI.join(", ")}` };
  const f = KUMASLAR[i.kumas as Kumas];
  const keys = [i.on, i.arka, i.sol, i.sag];
  if (keys.some((k) => !(k in DUVARLAR))) return { ok: false as const, hata: `Duvar seçenekleri: ${DUVAR_SECENEKLERI.join(", ")}` };
  const [t, colors, extras] = await Promise.all([table(markaId), listColors(), konfExtras(markaId).catch(() => [])]);
  const active = colors.filter((c) => c.aktif);
  const renk = f === 2 ? null : active.find((c) => fold(c.ad) === fold(i.renk ?? ""));
  if (f !== 2 && !renk) return { ok: false as const, hata: `Renk gerekli; üretebildiğimiz renkler: ${active.map((c) => c.ad).join(", ")}.` };
  const adet = Math.max(1, Math.min(99, Math.round(Number(i.adet) || 1)));
  const r = withPriceTable(t, () => {
    const c = cleanConfig({ size, frame: i.iskelet, roofFab: f, color: renk?.hex, sides: keys.map((k) => ({ walls: [{ ...DUVARLAR[k], f }] })) }, active.map((x) => x.hex));
    if (!c.ok) return c;
    const rows = gzRows(c.g, KONF_MODE);
    if (rows.some((x) => x.bad)) return { ok: false as const, hata: "Seçimde fiyatı olmayan bir parça var." };
    return { ok: true as const, g: c.g, birim: kdv(gzTotal(c.g, KONF_MODE)) };
  });
  if (!r.ok) return r;
  const ex = cleanExtras(Object.fromEntries((i.ekler ?? []).map((e) => [e.kod, e.adet])), extras, size);
  if (!ex.ok) return ex;
  const ekler = ex.list.map((x) => ({ ad: x.ek.ad, adet: x.adet, tutar: kdv(x.ek.fiyat) * x.adet }));
  const duvarlar = keys.map((k, n) => `${SIDE_NAMES[n]}: ${k === "yok" ? "açık" : wallName({ ...DUVARLAR[k], f } as Wall)}`);
  const ozet = [
    `Gazebo Çadır ${SZ[size]} m${adet > 1 ? ` × ${adet}` : ""}`,
    `İskelet: ${FRAME_NAME[i.iskelet] ?? i.iskelet}`,
    `Kumaş: ${f === 2 ? "Dijital baskılı (baskı tasarımı ekibimizle)" : `${FABRICS[f].n} · Renk: ${renk!.ad}`}`,
    ...duvarlar,
    ...ekler.map((e) => `Ek: ${e.ad} × ${e.adet}`),
  ];
  const toplam = r.birim * adet + ekler.reduce((a, e) => a + e.tutar, 0);
  const tasarim = encodeDesign({ g: r.g, e: Object.fromEntries(ex.list.map((x) => [x.ek.kod, x.adet])), a: adet });
  return { ok: true as const, g: r.g, size, f, renk: renk?.ad ?? null, hex: renk?.hex ?? null, adet, birim: r.birim, ekler, duvarlar, ozet, toplam, tasarim };
}

/**
 * Ölçü görsellerindeki kırmızı kumaş seçilen renge boyanır; gölge ve kıvrımlar korunur, direk ve beyaz zemin kalır
 * (lib/terminal/recolor.ts'nin sunucu karşılığı; o sarı kaynak görseller içindir).
 */
async function recolorRed(sharp: (typeof import("sharp"))["default"], input: Buffer, hex: string) {
  const { data, info } = await sharp(input).flatten({ background: "#ffffff" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const T = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const red = (r: number, g: number, b: number) => {
    const mx = Math.max(r, g, b);
    const c = mx - Math.min(r, g, b);
    if (mx !== r || c < 15) return 0;
    const h = (((g - b) / c) * 60 + 360) % 360;
    return h < 25 || h > 335 ? Math.min(1, (c - 15) / 45) : 0;
  };
  let ref = 0;
  for (let i = 0; i < data.length; i += 3) if (red(data[i], data[i + 1], data[i + 2]) > 0.9) ref = Math.max(ref, data[i]);
  if (!ref) return input;
  for (let i = 0; i < data.length; i += 3) {
    const w = red(data[i], data[i + 1], data[i + 2]);
    if (!w) continue;
    const k = Math.min(1.15, data[i] / ref);
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] * (1 - w) + Math.min(255, T[c] * k) * w);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
const IMG_DIR = () => path.join(/* turbopackIgnore: true */ process.cwd(), "public", "terminal", "img");

/** Onay görseli: ölçü görseli, dört kenarın duvar görselleri (Ön, Arka, Sol, Sağ), özet ve toplam. Panelde /dosya/gazebo/… olarak saklanır. */
export async function gazeboOnayGorseli(p: Extract<Awaited<ReturnType<typeof priceGazebo>>, { ok: true }>) {
  const { default: sharp } = await import("sharp");
  const W = 1200;
  const tile = 270;
  const gap = 30;
  const top = 120;
  const roofH = 470;
  const tilesY = top + roofH + 40;
  const textY = tilesY + tile + 110;
  const H = textY + p.ozet.length * 44 + 110;
  const layers: { input: Buffer; left: number; top: number }[] = [];
  const read = (key: string) => readFile(path.join(/* turbopackIgnore: true */ IMG_DIR(), `${key.replace(":", "-")}.webp`)).catch(() => null);
  const roofRaw = await read(`r:${p.size}`);
  const roof = roofRaw && p.hex ? await recolorRed(sharp, roofRaw, p.hex).catch(() => roofRaw) : roofRaw;
  if (roof) layers.push({ input: await sharp(roof).resize(W - 120, roofH, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).png().toBuffer(), left: 60, top });
  const startX = (W - (4 * tile + 3 * gap)) / 2;
  for (let n = 0; n < 4; n++) {
    const w = p.g.sides[n].walls[0];
    const img = w.kind === "yok" ? null : await read(wallImage(w));
    if (img) layers.push({ input: await sharp(img).resize(tile, tile, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).png().toBuffer(), left: startX + n * (tile + gap), top: tilesY });
  }
  const lines = p.ozet.map((l, n) => `<text x="60" y="${textY + n * 44}" font-size="${n ? 26 : 32}" font-weight="${n ? 400 : 700}" fill="#111a26">${esc(l)}</text>`).join("");
  const labels = SIDE_NAMES.map((s, n) => {
    const x = startX + n * (tile + gap);
    const w = p.g.sides[n].walls[0];
    const box = w.kind === "yok" ? `<rect x="${x}" y="${tilesY}" width="${tile}" height="${tile}" rx="16" fill="#f3f4f6" stroke="#d1d5db" stroke-dasharray="10 8"/><text x="${x + tile / 2}" y="${tilesY + tile / 2 + 9}" font-size="26" text-anchor="middle" fill="#6b7280">Açık</text>` : "";
    return `${box}<text x="${x + tile / 2}" y="${tilesY + tile + 40}" font-size="26" font-weight="700" text-anchor="middle" fill="#111a26">${s}</text>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif">
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="60" y="78" font-size="40" font-weight="700" fill="#111a26">Gazebo tasarımınız</text>
<text x="${W - 60}" y="78" font-size="22" text-anchor="end" fill="#6b7280">${p.f === 2 ? "Görsel temsilidir, baskı tasarımı ekibimizle" : "Görsel temsilidir"}</text>
${labels}${lines}
<text x="60" y="${H - 50}" font-size="34" font-weight="700" fill="#128c4a">Toplam: ${p.toplam.toLocaleString("tr-TR")} TL (KDV dahil, kargo ücretsiz)</text>
</svg>`;
  const out = await sharp(Buffer.from(svg)).composite(layers).webp({ quality: 85 }).toBuffer();
  return saveWebp("gazebo", out);
}

/** Panel kataloğu (teklif ürünleri): ad, açıklama ya da kategoride arama; perakende KDV dahil */
export async function panelUrunAra(markaId: number, sorgu: string) {
  const q = fold(sorgu);
  const words = q.split(" ").filter((w) => w.length > 1);
  if (!words.length) return { hata: "Arama ifadesi çok kısa." };
  const catalog = await getCatalog(markaId);
  const rows = catalog
    .flatMap((g) => g.items.filter((it) => !it.hidden).map((it) => ({ g, it, text: fold(`${it.n} ${it.s} ${g.nav} ${g.title}`) })))
    .map((x) => ({ ...x, puan: words.filter((w) => x.text.includes(w)).length + (fold(x.it.n).includes(q) ? 3 : 0) }))
    .filter((x) => x.puan > 0)
    .sort((a, b) => b.puan - a.puan)
    .slice(0, 10);
  if (!rows.length) return { sonuclar: [], not: "Panel kataloğunda eşleşme yok." };
  return {
    sonuclar: rows.map(({ g, it }) => {
      const p = val(it.p, KONF_MODE);
      const op = it.opt ? val(it.opt.p, KONF_MODE) : null;
      return {
        ad: it.n,
        kategori: g.nav,
        aciklama: it.s || null,
        fiyat_kdv_dahil: p === null ? null : kdv(p),
        ...(it.opt ? { secenek: { ad: it.opt.n, ek_fiyat_kdv_dahil: op === null ? null : kdv(op) } } : {}),
        renk_secilebilir: !!it.renk,
        uyari: [g.warn, it.warn].filter(Boolean).join(" ") || null,
      };
    }),
    not: "Panel teklif listesi (perakende, KDV dahil). Ürün sitede de satılıyorsa sitedeki fiyatı (site_urun_ara) esas al; sitede olup olmadığından emin değilsen \"sitede yok\" deme. fiyat_kdv_dahil boşsa fiyatı ekip verir. Uyarıyı müşteriye uygun dille ilet.",
  };
}

/** Panel kataloğu ürün kodu → sitedeki ürün numarası ve linki (yayındaki listelemeler; 5 dakika önbellek) */
const linkCache = new Map<number, { t: number; v: Map<string, { id: number; link: string }> }>();
async function siteLinks(site: { id: number } & Parameters<typeof wcProductLinks>[0]) {
  const c = linkCache.get(site.id);
  if (c && Date.now() - c.t < 5 * 60_000) return c.v;
  const pu = schema.pazaryeriUrunleri;
  const pl = schema.pazaryeriListelemeleri;
  const rows = await db()
    .select({ kod: schema.urunler.kod, disUrunId: pl.disUrunId })
    .from(pl)
    .innerJoin(pu, eq(pu.id, pl.urunId))
    .innerJoin(schema.urunler, eq(schema.urunler.id, pu.urunId))
    .where(and(eq(pl.siteId, site.id), eq(pl.aktif, true), eq(pu.aktif, true), eq(pl.durum, "yayinda"), isNotNull(pl.disUrunId)));
  const links = await wcProductLinks(site, rows.map((r) => r.disUrunId!)).catch(() => new Map<number, string>());
  const v = new Map<string, { id: number; link: string }>();
  for (const r of rows) {
    const link = links.get(r.disUrunId!);
    if (link && !v.has(r.kod)) v.set(r.kod, { id: r.disUrunId!, link });
  }
  linkCache.set(site.id, { t: Date.now(), v });
  return v;
}

/** Panel kategorisindeki tek ürünün KDV dahil birim fiyatı (ödeme linki; seçenek dahil istenirse ürün + seçenek) */
export async function panelKalem(markaId: number, kategoriId: number, kod: string, secenek: boolean) {
  const g = (await getCatalog(markaId)).find((x) => x.id === `k${kategoriId}`);
  const it = g?.items.find((x) => !x.hidden && x.id === kod);
  if (!it) return { ok: false as const, hata: "Bu ürün kartın kategorisinde yok; urun_bilgisi'ndeki kalem_kodu'nu kullan." };
  const p = val(it.p, KONF_MODE);
  if (p === null) return { ok: false as const, hata: "Bu ürünün fiyatını ekip verir; bilgileri kaydet ve ekibe devret." };
  if (secenek && !it.opt) return { ok: false as const, hata: "Bu ürünün ek seçeneği yok; secenek_dahil false olmalı." };
  const op = secenek && it.opt ? val(it.opt.p, KONF_MODE) : 0;
  if (op === null) return { ok: false as const, hata: "Seçeneğin fiyatını ekip verir; bilgileri kaydet ve ekibe devret." };
  return {
    ok: true as const,
    ad: `${it.n}${it.s ? ` ${it.s}` : ""}${secenek && it.opt ? ` · ${it.opt.n}` : ""}`.slice(0, 150),
    birim: kdv(p + op),
    renk: !!it.renk,
  };
}

/**
 * Panel kategorisi kartının ürünleri: ad, ölçü, KDV dahil perakende fiyat (sitedeki fiyat da panelden gider), ek seçenek ve
 * seçenek dahil tam fiyat, satış uyarısı; ürün sitede yayındaysa ürün numarası ve linki.
 */
export async function panelCategoryInfo(card: Kart, site: { id: number; markaId: number } & Parameters<typeof wcProductLinks>[0]) {
  const base = { kod: card.kod, ad: card.ad, seviye: card.asistanSeviyesi, kategori_linki: card.url };
  const g = (await getCatalog(site.markaId)).find((x) => x.id === `k${card.panelKategoriId}`);
  if (!g) return { ...base, urunler: [], not: "Bu kategori panelde şu an yok; fiyat söyleme, bilgileri topla ve ekibe devret." };
  const links = await siteLinks(site).catch(() => new Map<string, { id: number; link: string }>());
  const urunler = g.items
    .filter((it) => !it.hidden)
    .map((it) => {
      const p = val(it.p, KONF_MODE);
      const op = it.opt ? val(it.opt.p, KONF_MODE) : null;
      const s = links.get(it.id);
      return {
        kalem_kodu: it.id,
        ad: it.n,
        aciklama: it.s || null,
        fiyat_kdv_dahil: p === null ? null : kdv(p),
        ...(it.opt ? { secenek: it.opt.n, secenek_dahil_fiyat_kdv_dahil: p === null || op === null ? null : kdv(p + op) } : {}),
        uyari: it.warn ?? null,
        renk_secilebilir: !!it.renk,
        ...(s ? { urun_id: s.id, link: s.link } : {}),
      };
    });
  return {
    ...base,
    kategori_uyarisi: g.warn ?? null,
    urunler,
    not: `Fiyatlar panel kataloğundan (perakende, KDV dahil); sitedeki fiyatla aynıdır. Seçenekli üründe (ör. "kumaş baskı dahil") müşterinin istediği komple ürünün fiyatını söyle (secenek_dahil_fiyat), seçeneksiz fiyatı ayrıca belirt. Uyarıları müşteriye uygun dille ilet. fiyat_kdv_dahil boşsa fiyatı ekip verir. Genel soruda seçenekleri kısaca özetle; link olarak kategori_linki varsa onu, yoksa ürünün linkini ver. Görmek isterse urun_gorseli_gonder (urun_id).${
      card.asistanSeviyesi === "bilgi_verir" ? " Sonra ölçü, adet, baskı, il ve ad bilgisini topla, bilgi_kaydet ve ekibe_devret. Satışı kapatma: sipariş, ödeme linki, IBAN ya da teslim süresi sözü verme." : ""
    }${
      card.asistanSeviyesi === "cevaplar"
        ? " Satışı sen kapatırsın: ürün, ölçü, adet (renk_secilebilir ise renk) ve baskılı üründe logo/tasarım bilgisini netleştir; kartla ödemede odeme_linki_olustur'a kalem_kodu ve secenek_dahil ver. Baskı tasarımı ödemeden sonra ekibimizle netleşir (ücretsiz); logoyu bu sohbete gönderebilirler."
        : ""
    }`,
  };
}
