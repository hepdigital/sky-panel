import "server-only";
import { FABRICS, SIZES, SZ, gzRows, gzTotal, plan, val, type Gazebo } from "@/lib/terminal/calc";
import { FRAME_MAT, FRAME_NAME, KONF_KDV, KONF_MODE, SIDE_NAMES, cleanConfig, framesOf } from "@/lib/konfigurator";
import { priceTable, withPriceTable } from "@/lib/terminal/price-table";
import { wallName, wallPrice, type Wall } from "@/modules/gazebo/walls";
import { fold, type Kart } from "./cards";
import { getCatalog } from "../catalog";
import { listColors } from "../colors";
import { gazeboTables } from "../gazebo-prices";

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
export function designLink(card: Kart | null, siteAdres: string, size: string | null, f: number | null) {
  const base = card?.url || `${siteAdres.replace(/\/+$/, "")}/gazebo-tasarla/`;
  const q = new URLSearchParams();
  if (size) q.set("olcu", size);
  if (f !== null) q.set("baski", f === 2 ? "baskili" : "baskisiz");
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
  return withPriceTable(t, () => {
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
      not: `${sonuclar.length > 1 ? "İskelet belli olmadığı için her iskeletin fiyatı verildi; müşteriye seçenek olarak sun. " : ""}Fiyat sitedeki Kendin Tasarla ekranındaki fiyattır (KDV dahil). Müşteri tasarım linkinden aynı seçimle sepete ekleyip ödeyebilir.`,
    };
  });
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
