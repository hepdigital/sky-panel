// Fiyat terminali hesap çekirdeği: SKY fiyat terminalinin (js/app.js) mantığının birebir aktarımı.
// Tüm tutarlar ham (KDV hariç) tutulur; KDV yalnızca gösterimde ve PDF'te uygulanır.
// Modüler gazebo fiyatları: fiyatlar.json — her fiyat [toptan, perakende], null = "fiyat sorunuz".
// Katalog ürünleri (gazebo dışı) veritabanındadır (Ürünler ekranı); hesaplar onları parametre olarak alır.

import {
  emptyWall,
  normalizeWall,
  wallFromLegacy,
  wallImage,
  wallKey,
  wallName,
  wallPrice,
  type Wall,
  type WallKind,
} from "@/modules/gazebo/walls";
import data from "./fiyatlar.json";

export type Pair = [number, number] | null;
/**
 * renk: renk seçilebilir ürün; sepette her renk ayrı satırdır (anahtar "kod~#hex").
 * opt: ek seçenek (ör. "Kumaş baskı dahil"); katalogda ürünün görünmeyen eşi (hidden, kod+s, fiyat = ürün + seçenek) bulunur,
 * kartta anahtar açılınca adet o eşe yazılır. Fiyat terminalindeki yapıyla aynıdır.
 */
export type CatalogItem = { id: string; n: string; s: string; img: string | null; p: Pair; warn?: string; renk?: boolean; opt?: { n: string; p: Pair }; hidden?: boolean };
export const OPT_SUFFIX = "+s";

/** Sepet anahtarı: renksiz ürün "kod", renkli ürün "kod~#ffd400" */
export const prodKey = (id: string, hex?: string | null) => (hex ? `${id}~${hex}` : id);
export const splitKey = (key: string) => {
  const i = key.indexOf("~");
  return i < 0 ? { id: key, hex: null } : { id: key.slice(0, i), hex: key.slice(i + 1) };
};
/** Bir ürünün sepetteki satırları (renkliyse renk başına), ürün sırasıyla */
export function itemLines(q: QuoteState, it: CatalogItem) {
  return Object.keys(q.prod)
    .filter((k) => (q.prod[k] || 0) > 0 && splitKey(k).id === it.id)
    .sort()
    .map((key) => ({ key, hex: splitKey(key).hex, qty: q.prod[key] }));
}
export type CatalogGroup = { id: string; nav: string; title: string; lead: string; warn?: string; items: CatalogItem[] };
export type Catalog = CatalogGroup[];

export const WALL = data.WALL as unknown as Record<string, Record<string, Pair[]>>;
export const ROOF = data.ROOF as unknown as Record<string, Pair[]>;
export const FRAMES = data.FRAMES as unknown as Record<string, { desc: string; p: Record<string, Pair> }>;

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

/** Görsel adresi: terminalin görsel anahtarı ("w:duz-tam", "r:3x3") → /terminal/img/w-duz-tam.webp; adres ya da data: olduğu gibi */
export const imgSrc = (key: string) => (key.startsWith("/") || key.startsWith("data:") ? key : `/terminal/img/${key.replace(":", "-")}.webp`);

export type Mode = 0 | 1; // 0 toptan, 1 perakende
/**
 * Kenar: tek parça ya da bölmeli. 6 m ve 8 m kenarlar 2 × 3 m / 2 × 4 m duvar olarak da kurulabilir (split);
 * bölmeli kenarda her bölme ayrı duvardır ("Ön 1", "Ön 2"), kendi ölçü grubundan fiyatlanır.
 */
export type Side = { split?: boolean; walls: Wall[] };
/** color: kumaş rengi (hex); fiyatı etkilemez, ürünün parçasıdır (eski terminal kayıtlarında yoktur → beyaz) */
/** wallColor: duvarların rengi; yoksa tavanla (color) aynı */
export type Gazebo = { size: string; frame: string | null; roofFab: number | null; sides: Side[]; color?: string; wallColor?: string };

/** "Renk: Kırmızı" ya da tavan ve duvar farklıysa "Tavan: Kırmızı · Duvar: Beyaz" */
export function colorText(g: Gazebo) {
  const roof = colorName(g.color);
  const wall = colorName(g.wallColor ?? g.color);
  return roof === wall ? `Renk: ${roof}` : `Tavan: ${roof} · Duvar: ${wall}`;
}
export type Isk = { tip: "yuzde" | "tutar"; d: number };
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

/** İskelet ölçüsü → kenarlar. 2 ve 3 m serisi 200 cm, 4 m serisi 230 cm yükseklik; 6 ve 8 m kenar bölünebilir. */
export function plan(size: string) {
  const [a, b] = size.split("x").map(Number);
  const h = a <= 3 ? 200 : 230;
  const side = (label: string, m: number) => {
    const cm = Math.round(m * 100);
    return { label, h, cm, grup: `${h}x${cm}`, splittable: cm === 600 || cm === 800 };
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
export const slotPrice = (s: Slot, mode: Mode) => wallPrice(s.grup, s.wall, mode);

export const framePrice = (g: Gazebo, mode: Mode) => (g.frame && FRAMES[g.frame]?.p[g.size] ? val(FRAMES[g.frame].p[g.size], mode) : null);
export const roofPrice = (g: Gazebo, mode: Mode) => (g.roofFab === null ? null : val(ROOF[g.size][g.roofFab], mode));
export const unpricedWalls = (g: Gazebo, mode: Mode) => usedSlots(g).filter((s) => slotPrice(s, mode) === null).length;

/** "SQ3 iskelet · 690D Impertex tavan · 4 duvar" */
export function partsOf(g: Gazebo, mode: Mode) {
  const p: string[] = [];
  if (framePrice(g, mode) !== null) p.push(`${g.frame} iskelet`);
  if (roofPrice(g, mode) !== null) p.push(`${FABRICS[g.roofFab!].n} tavan`);
  const w = usedSlots(g).length;
  if (w) p.push(`${w} duvar`);
  return p;
}

/** "Ön: Çift Fermuarlı Kapı · Arka 1: Düz Tam Duvar" */
export function wallDetail(g: Gazebo) {
  return usedSlots(g).map((s) => `${s.label}: ${wallName(s.wall)}`).join(" · ") || "Duvarsız";
}

export type GzRow = { t: string; s: string; v: number; c: string; img: string | null; bad?: boolean };

/** Gazebo dökümü: iskelet, tavan ve (aynı duvar/ölçü/kumaş birleştirilerek) duvarlar */
export function gzRows(g: Gazebo, mode: Mode): GzRow[] {
  const rows: GzRow[] = [];
  const fp = framePrice(g, mode);
  if (fp !== null) {
    const f = FRAMES[g.frame!];
    rows.push({ t: `${g.frame} iskelet`, s: `${SZ[g.size]} m · ${f.desc}`, v: fp, c: `${g.frame} iskelet (${f.desc})`, img: `f:${g.frame}` });
  }
  const rp = roofPrice(g, mode);
  if (rp !== null) rows.push({ t: "Tavan kumaşı", s: `${SZ[g.size]} m · ${FABRICS[g.roofFab!].n}`, v: rp, c: `Tavan kumaşı · ${FABRICS[g.roofFab!].n}`, img: null });
  const agg = new Map<string, { t: string; s: string; v: number; n: number; bad: boolean; img: string }>();
  for (const sl of usedSlots(g)) {
    const name = wallName(sl.wall);
    const dim = sl.wall.kind === "yarim" ? `100 × ${sl.cm}` : `${sl.h} × ${sl.cm}`;
    const pr = slotPrice(sl, mode);
    const key = `${wallKey(sl.wall)}|${dim}`;
    const c = agg.get(key) ?? { t: name, s: `${dim} cm · ${FABRICS[sl.wall.f].n}`, v: 0, n: 0, bad: false, img: wallImage(sl.wall) };
    c.n++;
    if (pr === null) c.bad = true;
    else c.v += pr;
    agg.set(key, c);
  }
  for (const c of agg.values()) {
    const nm = c.t + (c.n > 1 ? ` × ${c.n}` : "");
    rows.push({ t: nm, s: c.s, v: c.v, bad: c.bad, c: `${nm} · ${c.s}`, img: c.img });
  }
  return rows;
}
export const gzTotal = (g: Gazebo, mode: Mode) => gzRows(g, mode).reduce((a, r) => a + (r.bad ? 0 : r.v), 0);
export const cfgKey = (g: Gazebo) =>
  [g.size, g.frame, g.roofFab, g.sides.map((s) => `${s.split ? "b" : "t"}${s.walls.map(wallKey).join("+")}`).join(","), g.color ?? "#ffffff", g.wallColor ?? ""].join("|");

/** Eski kayıtlardaki kenar ({t, f}: terminalin 12 duvar ürünü) ya da yeni kenar → yeni kenar */
export function sideFrom(raw: unknown): Side {
  const r = raw as { t?: string | null; f?: number; split?: boolean; walls?: Wall[] } | null;
  if (r && Array.isArray(r.walls) && r.walls.length) return { split: !!r.split, walls: r.walls.map((w) => normalizeWall({ kind: w.kind ?? "yok", f: w.f ?? 0, p: w.p, k: w.k })) };
  return { walls: [wallFromLegacy(r?.t ?? null, r?.f ?? 0)] };
}

/* ---------------- iskonto ----------------
   İki kademe: (1) satır — her gazebo ve ürün kendi indirimini taşır, (2) genel — satır indirimlerinden sonraki ara toplama.
   tip "yuzde" = %, "tutar" = adet başına TL. d pozitifse indirim, negatifse ilave (zam). Birim tam TL'ye yuvarlanır. */
export const iskYok = (i?: Isk) => !i || !i.d;
export function netBirim(liste: number, i?: Isk) {
  if (iskYok(i)) return liste;
  const v = i!.tip === "yuzde" ? liste * (1 - i!.d / 100) : liste - i!.d;
  return Math.max(0, Math.round(v));
}
export const TL = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} TL`;
/** "%10 ind." / "1.500 TL ilave" */
export function iskEtiket(i?: Isk) {
  if (iskYok(i)) return "";
  const art = i!.d < 0;
  const d = Math.abs(i!.d);
  return (i!.tip === "yuzde" ? `%${String(d).replace(".", ",")}` : TL(d)) + (art ? " ilave" : " ind.");
}

export type Row = { key: string; t: string; s: string; birim: number; net: number; adet: number; isk?: Isk; liste: number; v: number; bad?: boolean };

/** Teklifin tüm satırları (gazeboler + katalog ürünleri + ek kalemler) */
export function allRows(q: QuoteState, catalog: Catalog): Row[] {
  const rows: Row[] = [];
  for (const c of q.cart) {
    const liste = gzTotal(c, q.mode);
    const net = netBirim(liste, c.isk);
    rows.push({
      key: c.id,
      t: `Gazebo ${SZ[c.size]} m${c.qty > 1 ? ` × ${c.qty}` : ""}`,
      s: partsOf(c, q.mode).join(" · ") || "bileşen yok",
      birim: liste, net, adet: c.qty, isk: c.isk, liste: liste * c.qty, v: net * c.qty,
      bad: unpricedWalls(c, q.mode) > 0,
    });
  }
  for (const g of catalog)
    for (const it of g.items) {
      const pr = val(it.p, q.mode);
      if (pr === null) continue;
      for (const { key, hex, qty } of itemLines(q, it)) {
        const i = q.prodIsk[key];
        const net = netBirim(pr, i);
        const ad = hex ? `${it.n} · ${colorName(hex)}` : it.n;
        rows.push({ key, t: ad + (qty > 1 ? ` × ${qty}` : ""), s: it.s, birim: pr, net, adet: qty, isk: i, liste: pr * qty, v: net * qty });
      }
    }
  for (const x of q.extra ?? []) {
    const net = netBirim(x.birim, x.isk);
    rows.push({ key: x.id, t: x.ad + (x.adet > 1 ? ` × ${x.adet}` : ""), s: x.aciklama, birim: x.birim, net, adet: x.adet, isk: x.isk, liste: x.birim * x.adet, v: net * x.adet });
  }
  return rows;
}

/** Tutar kırılımı — tek yerden, herkes bunu kullanır */
export function hesap(q: QuoteState, catalog: Catalog, rows = allRows(q, catalog)) {
  const araListe = rows.reduce((a, r) => a + r.liste, 0);
  const araNet = rows.reduce((a, r) => a + r.v, 0);
  const satirIsk = araListe - araNet;
  let genelIsk = iskYok(q.isk) ? 0 : Math.round(q.isk.tip === "yuzde" ? (araNet * q.isk.d) / 100 : q.isk.d);
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
      const net = netBirim(liste, c.isk);
      const wd = wallDetail(c);
      return {
        ad: `Gazebo çadır ${SZ[c.size]} m`,
        alt: [...partsOf(c, q.mode), colorText(c)].join(" · ") + (wd !== "Duvarsız" ? `\n${wd}` : ""),
        adet: c.qty,
        birim: adj(liste),
        isk: iskEtiket(c.isk),
        tutar: adj(net * c.qty),
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
        return itemLines(q, it).map(({ key, hex, qty }) => {
          const i = q.prodIsk[key];
          return {
            ad: it.n,
            alt: hex ? [it.s, `Renk: ${colorName(hex)}`].filter(Boolean).join(" · ") : it.s,
            adet: qty, birim: adj(pr), isk: iskEtiket(i), tutar: adj(netBirim(pr, i) * qty), img: it.img, parcalar: [],
          };
        });
      }),
    ),
    ...(q.extra ?? []).map((x) => ({
      ad: x.ad, alt: x.aciklama, adet: x.adet, birim: adj(x.birim), isk: iskEtiket(x.isk), tutar: adj(netBirim(x.birim, x.isk) * x.adet), img: null as string | null, parcalar: [],
    })),
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
    genelIskEtiket: q.iskGrup && !iskYok(q.isk) ? `${q.iskGrup} · ${iskEtiket(q.isk)}` : iskEtiket(q.isk),
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
export type PdfData = ReturnType<typeof quoteData>;

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
