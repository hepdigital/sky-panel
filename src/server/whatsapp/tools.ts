import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { takipLinki, kargoAd } from "@/lib/cargo";
import { listColors } from "../colors";
import { phoneKey, phoneMatch } from "../customers";
import { db, schema } from "../db";
import { mailReady, sendMail } from "../mail";
import { wcCategoryProducts, wcProductDetail, wcProductInfo, wcSearch, wcVariations } from "../marketplaces/woocommerce";
import { panelPriceOf, sitePanelPrices, type PanelFiyat } from "../marketplaces/panel-prices";
import { orderCargo } from "../orders";
import { siteInstallments, siteTransferRate } from "../payment-links";
import { notify, sellers } from "../push";
import { fold, getCard, listCards, type Kart } from "./cards";
import type { WaConfig } from "./config";
import {
  DUVAR_SECENEKLERI, KUMAS_SECENEKLERI, designLink, gazeboFiyatla, gazeboOnayGorseli, gazeboSecenekleri, panelCategoryInfo, panelKalem, panelUrunAra, priceGazebo, type GazeboInput,
  type GazeboSecim,
} from "./gazebo";
import { sendMedia, sendText } from "./graph";
import { createChatPaymentLink, paymentMessage, type PaymentDraft } from "./payment";
import type { WaAyarlar } from "./settings";
import { ARAC, insertMessage, MAX_TEXT } from "./store";

// Kartı olmayan ürünler sitede aranır (site_urun_ara / site_urun_detay): fiyat, açıklama, seçenekler ve görsel sitedeki yayındaki üründen;
// panelden yalnızca eşleşen pazaryeri ürününün ölçü/paket bilgisi ve satış uyarısı gelir (toptan fiyat ve maliyet asla).
// Asistanın araçları (şartname §6.3). Araçlar yalnızca o anki sohbetin verisine erişir: telefon numarası parametre değildir,
// sunucu sohbetten alır. Maliyet, toptan fiyat, iskonto, başka müşterinin bilgisi ve kullanıcı tabloları hiçbir araçtan dönmez.

const { waSohbetler: sohbetler, waTalepler: talepler } = schema;

/** Bir asistan turunun bağlamı */
export type Ctx = {
  sohbetId: number;
  /** Müşterinin WhatsApp numarası (deneme alanında: müşteri eşleştirmesi için girilen numara ya da boş) */
  telefon: string | null;
  urunKodu: string | null;
  ayar: WaAyarlar;
  /** null: deneme alanı (WhatsApp'a hiçbir şey gitmez, talep yazılmaz, e-posta atılmaz) */
  cfg: WaConfig | null;
  /** Gönderimden hemen önce sohbet hâlâ asistanda mı (ekip araya girdiyse false) */
  canSend: () => Promise<boolean>;
  devredildi: boolean;
  gonderilen: number;
};

const NULLABLE_STR = { anyOf: [{ type: "string" }, { type: "null" }] };

const GEVSEK = new Set(["gazebo_secenekleri", "gazebo_fiyatla", "gazebo_onay_gonder", "panel_urun_ara"]);
const DUVAR = { type: "string", enum: DUVAR_SECENEKLERI };
const KUMAS = { type: "string", enum: KUMAS_SECENEKLERI };
/** Baskılı duvarların baskı yüzü (tüm baskılı duvarlar için) */
const BASKI_YUZU = {
  anyOf: [{ type: "string", enum: ["dis", "ic", "cift"] }, { type: "null" }],
  description: "Baskılı duvarlarda baskı yüzü: dis (dışa bakan yüz, varsayılan), ic (içe bakan yüz), cift (iki yüz: duvar iki kez basılıp dikilir, kumaşı iki kez fiyatlanır). Baskısızda boş",
};

/** Tek gazebo tasarımı (onaya gönderilir; ödeme linki sohbete kaydedilen onaylı tasarımdan) */
const GAZEBO_SECIM = {
  type: "object" as const,
  properties: {
    olcu: { type: "string" },
    iskelet: { type: "string", description: "İskelet kodu (ör. SH4)" },
    kumas: KUMAS,
    renk: { type: "string", description: "Kumaş rengi (renkleri_listele); baskılıda boş metin" },
    on: DUVAR,
    arka: DUVAR,
    sol: DUVAR,
    sag: DUVAR,
    baski_yuzu: BASKI_YUZU,
    adet: { type: "integer" },
    ekler: {
      type: "array",
      description: "Ek ürünler (gazebo_fiyatla'daki ek_urunler kodları): taşıma çantası, sabitleme",
      items: { type: "object", properties: { kod: { type: "string" }, adet: { type: "integer" } }, required: ["kod", "adet"], additionalProperties: false },
    },
  },
  required: ["olcu", "iskelet", "kumas", "renk", "on", "arka", "sol", "sag", "baski_yuzu", "adet", "ekler"],
  additionalProperties: false,
};

/** Araç tanımları sabit sırada (önbellek). odeme_bilgisi_gonder yalnızca ayar açıksa eklenir. */
export function toolDefs(ayar: WaAyarlar): Anthropic.Beta.BetaTool[] {
  const defs: Anthropic.Beta.BetaTool[] = [
    {
      name: "urun_bilgisi",
      description:
        "Ürün kartının canlı bilgisi: güncel fiyat (KDV dahil, indirimliyse liste fiyatıyla), havale/EFT indirimi ve fiyatı, ürün linki. Kategori kartında kategorideki ürünler (ad, ölçü, fiyat, seçenek dahil fiyat, uyarı, ürün numarası, link) ve kategori linki. Fiyat soran her müşteride bunu çağır; fiyatı ezberden söyleme.",
      input_schema: { type: "object", properties: { kod: { type: "string", description: "Ürün kartı kodu, ör. kis-bahcesi-3x3" } }, required: ["kod"], additionalProperties: false },
    },
    {
      name: "urun_bul",
      description: "Müşterinin ifadesine (ör. 'kamelya', 'bayrak') uyan ürün kartlarını bulur: kod, ad ve senin bu üründeki görevin (seviye: cevaplar / bilgi_verir / devreder).",
      input_schema: { type: "object", properties: { sorgu: { type: "string" } }, required: ["sorgu"], additionalProperties: false },
    },
    {
      name: "gazebo_secenekleri",
      description:
        "Gazebo çadır (Kendin Tasarla) seçenekleri ve fiyatları: olcu boşsa tüm ölçüler ve duvarsız başlangıç fiyatları; olcu verilirse o ölçüdeki iskeletler, kumaşlar ve her kenar için duvar seçenekleri fiyatlarıyla, ayrıca ölçüsü seçili tasarım linki. Gazebo sorularında site_urun_ara yerine bunu kullan.",
      input_schema: {
        type: "object",
        properties: {
          olcu: { ...NULLABLE_STR, description: "2x2, 2x3, 3x3, 3x4.5, 3x6, 4x4, 4x6, 4x8 ya da boş" },
          kumas: { anyOf: [KUMAS, { type: "null" }], description: "Baskısız: 690D (su geçirmez) ya da 200D (su itici); baskılı: baskili. Bilinmiyorsa boş" },
        },
        required: ["olcu", "kumas"],
        additionalProperties: false,
      },
    },
    {
      name: "gazebo_fiyatla",
      description:
        "Bir gazebo tasarımının kesin fiyatı (sitedeki Kendin Tasarla ekranıyla aynı, KDV dahil) ve parça dökümü. iskelet boşsa o ölçüdeki her iskelet için ayrı fiyat döner (müşteri bilmiyorsa ya da görselden anlaşılamadıysa). Duvarlar: Ön, Arka, Sol, Sağ.",
      input_schema: {
        type: "object",
        properties: {
          olcu: { type: "string" },
          iskelet: { ...NULLABLE_STR, description: "gazebo_secenekleri'ndeki iskelet kodu (ör. SH4) ya da boş" },
          kumas: KUMAS,
          on: DUVAR,
          arka: DUVAR,
          sol: DUVAR,
          sag: DUVAR,
          baski_yuzu: BASKI_YUZU,
          adet: { type: "integer" },
        },
        required: ["olcu", "iskelet", "kumas", "on", "arka", "sol", "sag", "baski_yuzu", "adet"],
        additionalProperties: false,
      },
    },
    {
      name: "gazebo_onay_gonder",
      description:
        "Müşterinin seçtiği gazebo tasarımının görselini (ölçü, dört kenarın duvarları), özetini ve toplam fiyatını müşteriye gönderir. Ödeme bilgilerini istemeden önce müşteriye tasarımı bununla onaylat.",
      input_schema: GAZEBO_SECIM,
    },
    {
      name: "panel_urun_ara",
      description:
        "Paneldeki teklif kataloğunda (sitede olmayan aksesuar, sabitleme, yedek parça vb. dahil) ürün arar: ad, kategori, açıklama, KDV dahil perakende fiyat, uyarı. Sitede bulamadığın ya da ek bilgi gereken ürünlerde kullan.",
      input_schema: { type: "object", properties: { sorgu: { type: "string" } }, required: ["sorgu"], additionalProperties: false },
    },
    {
      name: "site_urun_ara",
      description:
        "Kartı olmayanlar dahil sitedeki tüm yayındaki ürünlerde arar: ürün numarası, ad, KDV dahil fiyat (varyantlıda başlangıç), link. Önce urun_bul; kart yoksa ya da müşteri karttakinden farklı bir ürün soruyorsa bunu kullan.",
      input_schema: { type: "object", properties: { sorgu: { type: "string", description: "Kısa arama ifadesi, ör. 'gazebo 3x3', 'kum torbası', 'tente'" } }, required: ["sorgu"], additionalProperties: false },
    },
    {
      name: "site_urun_detay",
      description:
        "Sitedeki bir ürünün ayrıntısı: güncel fiyat, açıklama, ölçü/seçenek fiyatları, link; panelde eşleşen ürün varsa ölçü, paket ölçüsü/ağırlığı ve satış uyarısı. urun_id site_urun_ara ya da urun_bilgisi'nden.",
      input_schema: { type: "object", properties: { urun_id: { type: "integer" } }, required: ["urun_id"], additionalProperties: false },
    },
    {
      name: "renkleri_listele",
      description: "Üretebildiğimiz kumaş renkleri (ad ve renk kodu). Ürünler stokta tutulmaz, seçilen renkte siparişe özel üretilir. Yalnızca bu renkleri öner.",
      input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
    {
      name: "renk_kartelasi_gonder",
      description: "Renk seçeneklerimizin görselini müşteriye WhatsApp'tan gönderir. Müşteri renk konusunda kararsızsa kullan. Müşteriye \"renk seçeneklerimiz\" diye sun; \"kartela\" deme.",
      input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
    {
      name: "taksit_hesapla",
      description: "Kredi kartıyla ödemede banka bazında taksit tablosu (vade farkı dahil aylık ve toplam tutar). Tutar KDV dahil TL.",
      input_schema: { type: "object", properties: { tutar: { type: "number" } }, required: ["tutar"], additionalProperties: false },
    },
    {
      name: "musteri_durumu",
      description: "Bu sohbetteki telefon numarasıyla eşleşen müşteri kaydı ve son siparişleri: sipariş numarası, durumu, kargo firması ve takip linki.",
      input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
    {
      name: "siparis_sorgula",
      description:
        "Sipariş numarasıyla (sitedeki ya da paneldeki) siparişin durumunu, tarihini, ürünlerini ve kargo takibini getirir. Bilgi yalnızca siparişteki telefon bu sohbetin numarasıyla eşleşirse döner (başkasının siparişi paylaşılmaz).",
      input_schema: { type: "object", properties: { siparis_no: { type: "string" } }, required: ["siparis_no"], additionalProperties: false },
    },
    {
      name: "medya_gonder",
      description: "Ürün kartındaki izinli bir görseli ya da videoyu (ör. kurulum videosu) müşteriye gönderir. Yalnızca kartın medya listesindeki kimlikler.",
      input_schema: { type: "object", properties: { kod: { type: "string", description: "Ürün kartı kodu" }, id: { type: "string", description: "Medya kimliği" } }, required: ["kod", "id"], additionalProperties: false },
    },
    {
      name: "urun_gorseli_gonder",
      description:
        "Sitedeki yayındaki bir ürünün ana görselini müşteriye WhatsApp'tan gönderir (açıklaması ürün adı). urun_id: urun_bilgisi, site_urun_ara ya da site_urun_detay'daki ürün numarası; boşsa kodu verilen kartın ürünü. Müşteri görmek isterse ya da ürünü tanıtırken bir kez kullan; aynı görseli tekrar gönderme.",
      input_schema: {
        type: "object",
        properties: { kod: { ...NULLABLE_STR, description: "Ürün kartı kodu (urun_id verildiyse boş olabilir)" }, urun_id: { anyOf: [{ type: "integer" }, { type: "null" }], description: "Sitedeki ürün numarası" } },
        required: ["kod", "urun_id"],
        additionalProperties: false,
      },
    },
    {
      name: "bilgi_kaydet",
      description:
        "Müşteriden öğrendiğin bilgileri talep olarak kaydeder ya da günceller (ekip buradan arar). Bilmediğin alanı null bırak; daha önce kaydedilen alan null ile silinmez.",
      input_schema: {
        type: "object",
        properties: {
          ad: NULLABLE_STR,
          il: NULLABLE_STR,
          urun: NULLABLE_STR,
          adet: { anyOf: [{ type: "integer" }, { type: "null" }] },
          renk: NULLABLE_STR,
          not: NULLABLE_STR,
          aranma_zamani: { ...NULLABLE_STR, description: "Müşterinin aranmak istediği zaman, ör. 'yarın 10:00 sonrası'" },
        },
        required: ["ad", "il", "urun", "adet", "renk", "not", "aranma_zamani"],
        additionalProperties: false,
      },
    },
    {
      name: "sohbeti_etiketle",
      description: "Sohbetin ilgili olduğu ürünü işaretler (ürün belli olunca bir kez çağır).",
      input_schema: { type: "object", properties: { urun_kodu: { type: "string" } }, required: ["urun_kodu"], additionalProperties: false },
    },
    {
      name: "ekibe_devret",
      description:
        "Sohbeti satış ekibine devreder: asistan bu sohbette susar, ekip bildirim alır. Özet ekibin müşteriyi yeniden sorgulamadan devam edebileceği kadar net olmalı. Devrettikten sonra müşteriye yalnızca kısa bir bilgi ver.",
      input_schema: {
        type: "object",
        properties: { sebep: { type: "string" }, ozet: { type: "string" }, oncelik: { type: "string", enum: ["normal", "yuksek"] } },
        required: ["sebep", "ozet", "oncelik"],
        additionalProperties: false,
      },
    },
  ];
  if (ayar.odeme_linki !== "kapali")
    defs.push({
      name: "odeme_linki_olustur",
      description:
        "Kartla ödeme için sitede sipariş ve ödeme linki hazırlar. Tutarı sunucu hesaplar (fiyat × adet; panel kategorisi kartında panel fiyatı). YALNIZCA müşteri sipariş özetini (ad soyad, adres, ürün, renk, adet, tutar, fatura) tek mesajda gördükten sonra açıkça onayladıysa çağır. Yalnız senin baştan sona sattığın ürünler için.",
      input_schema: {
        type: "object",
        properties: {
          urun_kodu: { type: "string" },
          renk: { type: "string", description: "Renk; renk seçilmeyen üründe boş metin" },
          kalem_kodu: { ...NULLABLE_STR, description: "Panel kategorisi kartında urun_bilgisi'ndeki kalem_kodu; diğer kartlarda boş" },
          secenek_dahil: { type: "boolean", description: "Panel ürününün ek seçeneği (ör. kumaş baskı) dahil mi; seçeneksizde false" },
          adet: { type: "integer" },
          ad_soyad: { type: "string" },
          adres: { type: "string", description: "Açık adres: mahalle, sokak, no, ilçe" },
          il: { type: "string" },
          eposta: NULLABLE_STR,
          fatura: { ...NULLABLE_STR, description: "Kurumsal faturada unvan, vergi dairesi ve vergi no (adres farklıysa fatura adresi); bireysel faturada boş" },
        },
        required: ["urun_kodu", "renk", "kalem_kodu", "secenek_dahil", "adet", "ad_soyad", "adres", "il", "eposta", "fatura"],
        additionalProperties: false,
      },
    });
  if (ayar.iban_gonderebilir)
    defs.push({
      name: "odeme_bilgisi_gonder",
      description: "Havale/EFT ile ödemek isteyen müşteriye şirketin kayıtlı banka ve IBAN bilgisini ayrı bir mesaj olarak gönderir. IBAN'ı asla kendin yazma, bu aracı kullan.",
      input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    });
  // Gazebo araçları katı değil: dört kenarlı tasarım şeması katı dilbilgisini API sınırının üstüne çıkarıyor; girdiyi sunucu doğrular
  return defs.map((d) => (GEVSEK.has(d.name) ? d : { ...d, strict: true }));
}

// ── Gönderme ───────────────────────────────────────────────────────────────

const publicUrl = (path: string) => `${(process.env.PUBLIC_URL ?? "").replace(/\/+$/, "")}${path}`;

/** Paragraf sınırından en çok 4096 karakterlik parçalara böler */
export function splitText(text: string, max = MAX_TEXT): string[] {
  const out: string[] = [];
  let cur = "";
  for (const para of text.split(/\n{2,}/)) {
    const next = cur ? `${cur}\n\n${para}` : para;
    if (next.length <= max) cur = next;
    else {
      if (cur) out.push(cur);
      cur = para;
      while (cur.length > max) {
        out.push(cur.slice(0, max));
        cur = cur.slice(max);
      }
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

type Out = { tur: "text"; metin: string } | { tur: "image" | "video"; link: string; yol: string; metin: string | null };

/** Müşteriye mesaj gönderir ve asistan mesajı olarak kaydeder (deneme alanında yalnızca kaydeder) */
export async function deliver(ctx: Ctx, telefon: string, o: Out): Promise<{ ok: true } | { ok: false; hata: string }> {
  if (!(await ctx.canSend())) return { ok: false, hata: "Sohbet ekibe geçti; mesaj gönderilmedi." };
  let wamid = `deneme:${randomUUID()}`;
  if (ctx.cfg) {
    const r = o.tur === "text" ? await sendText(ctx.cfg, telefon, o.metin) : await sendMedia(ctx.cfg, telefon, o.tur, o.link, o.metin ?? undefined);
    if (!r.ok) return r;
    wamid = r.wamid;
  }
  const tarih = new Date();
  await insertMessage({ sohbetId: ctx.sohbetId, wamid: wamid.slice(0, 191), yon: "asistan", tur: o.tur, metin: o.metin, medyaYol: o.tur === "text" ? null : o.yol.slice(0, 255), tarih });
  await db().update(sohbetler).set({ sonMesaj: sql`GREATEST(${sohbetler.sonMesaj}, ${tarih})` }).where(eq(sohbetler.id, ctx.sohbetId));
  ctx.gonderilen++;
  return { ok: true };
}

/** Araç çağrısının gelen kutusundaki kısa satırı (WhatsApp'a gitmez) */
export async function logTool(sohbetId: number, toolUseId: string, metin: string) {
  await insertMessage({ sohbetId, wamid: `arac:${toolUseId}`.slice(0, 191), yon: "asistan", tur: ARAC, metin: metin.slice(0, 1000), tarih: new Date() });
}

// ── Araçlar ────────────────────────────────────────────────────────────────

const priceCache = new Map<string, { t: number; v: Awaited<ReturnType<typeof wcProductInfo>> }>();

async function siteOf(id: number | null) {
  if (!id) return null;
  const [s] = await db().select().from(schema.siteBaglantilari).where(eq(schema.siteBaglantilari.id, id));
  return s ?? null;
}

/** Sohbetin ürünü ya da asistanın sattığı ilk kart (taksit, havale ve IBAN'ın sitesi/markası için) */
async function cardForChat(ctx: Ctx): Promise<Kart | null> {
  const cards = (await listCards()).filter((c) => c.aktif);
  return cards.find((c) => c.kod === ctx.urunKodu && c.siteId) ?? cards.find((c) => c.asistanSeviyesi === "cevaplar" && c.siteId) ?? null;
}

/** Sitedeki ürün bilgisi (5 dakika önbellek) */
async function liveProduct(card: Kart) {
  const site = await siteOf(card.siteId);
  if (!site || !card.disUrunId) return null;
  const key = `${site.id}:${card.disUrunId}`;
  let info = priceCache.get(key);
  if (!info || Date.now() - info.t > 5 * 60_000) {
    info = { t: Date.now(), v: await wcProductInfo(site, card.disUrunId) };
    priceCache.set(key, info);
  }
  return { site, v: info.v };
}

/** Kategorideki yayındaki ürünler; varyantlı ürünlerin seçenekleri de (en düşük fiyat çoğu zaman yalnız baskı gibi bir seçenektir). 5 dakika önbellek. */
type KategoriUrunu = Awaited<ReturnType<typeof wcCategoryProducts>>[number] & { secenekler: { ad: string; fiyat: number }[] };
const categoryCache = new Map<string, { t: number; v: KategoriUrunu[] }>();
async function liveCategory(card: Kart) {
  const site = await siteOf(card.siteId);
  if (!site || !card.disKategoriId) return null;
  const key = `${site.id}:${card.disKategoriId}`;
  let c = categoryCache.get(key);
  if (!c || Date.now() - c.t > 5 * 60_000) {
    const list = await wcCategoryProducts(site, card.disKategoriId);
    const v = await Promise.all(
      list.map(async (u) => ({
        ...u,
        secenekler: u.varyantli
          ? (await wcVariations(site, u.id).catch(() => [])).flatMap((x) => (x.fiyat === null ? [] : [{ ad: x.ad, fiyat: x.fiyat }])).slice(0, 10)
          : [],
      })),
    );
    c = { t: Date.now(), v };
    categoryCache.set(key, c);
  }
  return { site, urunler: c.v };
}

const tl = (n: number) => Math.round(n * 100) / 100;

/** Kategori kartı: kategorideki ürünler; asistan genel soruda kategoriyi özetler, belirli ürün sorulunca o ürünün linkini verir */
async function categoryInfo(card: Kart) {
  const base = { kod: card.kod, ad: card.ad, seviye: card.asistanSeviyesi, kategori_linki: card.url };
  let live: Awaited<ReturnType<typeof liveCategory>>;
  try {
    live = await liveCategory(card);
  } catch {
    return { ...base, urunler: [], not: "Ürünler şu an siteden okunamadı; fiyat söyleme, ekibe devret." };
  }
  const prices = live ? await sitePanelPrices(live.site.id).catch(() => new Map<number, PanelFiyat[]>()) : new Map<number, PanelFiyat[]>();
  // Panelde karşılığı olan ürünün fiyatı ve seçenekleri panelden
  const urunler = (live?.urunler ?? [])
    .map((u) => {
      const p = prices.get(u.id);
      if (!p?.length) return { ...u, kaynak: "site" as const };
      const min = Math.min(...p.map((x) => x.fiyat));
      return { ...u, fiyat: min, varyantli: p.length > 1, secenekler: p.length > 1 ? p.map((x) => ({ ad: secenekAdi(x), fiyat: x.fiyat })) : [], kaynak: "panel" as const };
    })
    .filter((u) => u.fiyat !== null);
  if (!live || !urunler.length) return { ...base, urunler: [], not: "Kategoride fiyatı okunabilen ürün yok; fiyat söyleme, ekibe devret." };
  const oran = card.asistanSeviyesi === "cevaplar" ? await siteTransferRate(live.site) : null;
  return {
    ...base,
    one_cikan_urun_id: card.disUrunId,
    urunler: urunler.map((u) => ({
      urun_id: u.id, ad: u.ad, [u.varyantli ? "baslangic_fiyati_kdv_dahil" : "fiyat_kdv_dahil"]: u.fiyat, link: u.link, fiyat_kaynagi: u.kaynak,
      ...(u.secenekler.length ? { secenekler_kdv_dahil: u.secenekler } : {}),
    })),
    ...(oran !== null ? { havale_eft_indirim_orani: oran } : {}),
    not: `${urunler.some((u) => u.kaynak === "site") ? `fiyat_kaynagi "site" olan ürünler: ${KAYNAK_SITE_NOTU} ` : ""}Genel soruda (ör. "bayrak fiyatı ne") seçenekleri kısaca özetle: hangi modeller / ölçüler var ve fiyatları; tek link olarak kategori_linki'ni ver, her ürünün linkini sıralama. Seçenekli üründe en düşük fiyat çoğu zaman tam ürün değildir (ör. "sadece baskı", "sadece iskelet"): fiyatı tam set / komple ürün seçeneği üzerinden söyle, diğer seçenekleri ayrıca belirt; yalnız baskı fiyatını ürün fiyatı gibi sunma. Müşteri belirli bir model ya da ölçü sorarsa o ürünün fiyatını ve linkini ver. Görmek isterse urun_gorseli_gonder.${
      card.asistanSeviyesi === "bilgi_verir" ? " Sonra ölçü, adet, baskı, il ve ad bilgisini topla, bilgi_kaydet ve ekibe_devret. Satışı kapatma: sipariş, ödeme linki, IBAN ya da teslim süresi sözü verme." : ""
    }`,
  };
}

/* Fiyat kaynağı: panel (siteye bağlı satış kartı). Panelde karşılığı yoksa geçici olarak sitedeki fiyat söylenir; o ürünle
   panel teklifi oluşturulmaz (fiyat kapsamı raporunda listelenir). */
const KAYNAK_SITE_NOTU = "Bu ürünün panelde fiyatı yok; söylediğin fiyat sitedeki fiyattır. Bu ürünle teklif oluşturma; sipariş/teklif için bilgileri topla ve ekibe devret.";
/** Satış kartı seçeneğinin müşteriye görünen adı: renk ve/veya ölçü, yoksa kart adı */
const secenekAdi = (x: PanelFiyat) => [x.olcu, x.renk].filter(Boolean).join(" · ") || x.ad;

async function urunBilgisi(kod: string) {
  if (kod === "gazebo") return { kod, not: "Gazebo fiyatı gazebo_secenekleri ve gazebo_fiyatla ile alınır (sitedeki Kendin Tasarla fiyatları)." };
  const card = await getCard(kod);
  if (!card || !card.aktif) return { hata: `"${kod}" kodlu ürün kartı yok. urun_bul ile doğru kodu bul.` };
  const base = { kod: card.kod, ad: card.ad, seviye: card.asistanSeviyesi, link: card.url };
  if (card.asistanSeviyesi === "devreder") return { ...base, fiyat: null, not: "Bu ürünün fiyatını ekip verir: ölçü, adet, il ve ad bilgisini topla, kaydet ve ekibe devret." };
  if (card.panelKategoriId) {
    const site = await siteOf(card.siteId);
    if (!site) return { ...base, fiyat: null, not: "Kartın sitesi seçili değil; fiyat söyleme, ekibe devret." };
    const info = await panelCategoryInfo(card, site);
    if (card.asistanSeviyesi !== "cevaplar") return info;
    const oran = await siteTransferRate(site);
    return { ...info, havale_eft_indirim_orani: oran, kargo: "Ücretsiz" };
  }
  if (card.disKategoriId) return categoryInfo(card);
  let live: Awaited<ReturnType<typeof liveProduct>>;
  try {
    live = await liveProduct(card);
  } catch {
    return { ...base, fiyat: null, not: "Fiyat şu an siteden okunamadı; fiyat söyleme, ekibe devret." };
  }
  if (!live) return { ...base, fiyat: null, not: "Bu ürünün canlı fiyatı tanımlı değil; fiyat söyleme, ekibe devret." };
  const panel = await panelPriceOf(live.site.id, card.disUrunId!).catch(() => null);
  const v = panel
    ? { ...live.v, fiyat: panel.fiyat, varyantli: panel.coklu, listeFiyati: live.v.listeFiyati && live.v.listeFiyati > panel.fiyat ? live.v.listeFiyati : null }
    : live.v;
  if (!v.yayinda || v.fiyat === null) return { ...base, fiyat: null, not: "Ürün sitede satışta değil; fiyat söyleme, ekibe devret." };
  const link = v.link || card.url;
  const kaynak = panel
    ? { fiyat_kaynagi: "panel", ...(panel.coklu ? { secenekler_kdv_dahil: panel.secenekler.map((x) => ({ ad: secenekAdi(x), fiyat: x.fiyat })) } : {}) }
    : { fiyat_kaynagi: "site", kaynak_notu: KAYNAK_SITE_NOTU };
  if (card.asistanSeviyesi === "bilgi_verir")
    return {
      ...base,
      link,
      ...(v.varyantli ? { baslangic_fiyati_kdv_dahil: v.fiyat } : { fiyat_kdv_dahil: v.fiyat }),
      kisa_aciklama: v.kisaAciklama || null,
      ...kaynak,
      not: `${v.varyantli ? `Fiyat ölçü/seçeneğe göre değişir: "${v.fiyat} TL'den başlayan fiyatlarla" de. ` : ""}Fiyatı, özellikleri ve linki ver; sonra ölçü, adet, baskı, il ve ad bilgisini topla, bilgi_kaydet ve ekibe_devret. Satışı kapatma: sipariş, ödeme linki, IBAN ya da teslim süresi sözü verme.`,
    };
  const oran = await siteTransferRate(live.site);
  return {
    ...base,
    link,
    fiyat_kdv_dahil: v.fiyat,
    liste_fiyati: v.listeFiyati,
    ...kaynak,
    havale_eft_indirim_orani: oran,
    havale_eft_fiyati: tl(v.fiyat * (1 - oran / 100)),
    kargo: "Ücretsiz",
    uretim: "Stokta tutulmaz; seçilen renkte siparişe özel 5 iş gününde üretilip kargoya verilir.",
    not: `Havale/EFT ile ödemede %${oran} indirimimiz var (havale_eft_fiyati). Kartla 12 taksite kadar, taksit farkıyla. Stok durumundan bahsetme.`,
  };
}

async function urunBul(sorgu: string) {
  const q = fold(sorgu);
  const words = q.split(" ").filter((w) => w.length > 2);
  const cards = (await listCards()).filter((c) => c.aktif);
  const scored = cards
    .map((c) => {
      const ad = fold(c.ad);
      const keys = c.anahtarKelimeler.split(",").map(fold).filter(Boolean);
      let puan = keys.some((k) => q.includes(k)) ? 10 : 0;
      puan += words.filter((w) => ad.includes(w) || keys.some((k) => k.includes(w))).length;
      return { c, puan };
    })
    .filter((x) => x.puan > 0)
    .sort((a, b) => b.puan - a.puan)
    .slice(0, 5);
  const row = (c: Kart) => ({ kod: c.kod, ad: c.ad, seviye: c.asistanSeviyesi });
  if (scored.length) return { sonuclar: scored.map((x) => row(x.c)) };
  return {
    sonuclar: [],
    not: "Eşleşen kart yok. Aşağıdaki kartlardan biri müşterinin ürünüyse (farklı adla soruyor olabilir) onun koduyla urun_bilgisi çağır; değilse site_urun_ara ile sitede ara. Bulamazsan uydurma: bilgileri topla, kaydet ve ekibe devret.",
    tum_kartlar: cards.map(row),
  };
}

async function activeColors() {
  return (await listColors()).filter((c) => c.aktif).map((c) => ({ ad: c.ad, hex: c.hex }));
}

async function renkKartelasi(ctx: Ctx, telefon: string) {
  const colors = await activeColors();
  if (!colors.length) return { hata: "Renk listesi boş." };
  // Renk listesi değişince adres değişir (Meta eski görseli önbellekten vermesin)
  const v = createHash("sha1").update(colors.map((c) => c.hex + c.ad).join("|")).digest("hex").slice(0, 10);
  const yol = `/jpg/kartela/renkler.jpg?v=${v}`;
  const metin = `Renk seçeneklerimiz: ${colors.map((c, i) => `${i + 1}. ${c.ad}`).join(", ")}`;
  const r = await deliver(ctx, telefon, { tur: "image", link: publicUrl(yol), yol, metin });
  return r.ok ? { gonderildi: true, renkler: colors.map((c) => c.ad) } : { hata: r.hata };
}

async function taksit(ctx: Ctx, tutar: number) {
  const card = await cardForChat(ctx);
  const site = await siteOf(card?.siteId ?? null);
  const r = await siteInstallments(site ?? undefined, tutar);
  if (!r.ok) return { hata: "Taksit bilgisi şu an alınamadı." };
  return {
    tutar: r.tablo.tutar,
    bankalar: r.tablo.aileler.map((a) => ({ kart_ailesi: a.aile, banka: a.banka, taksitler: a.taksitler.map((t) => ({ taksit: t.n, aylik: t.aylik, toplam: t.toplam })) })),
  };
}

const SIPARIS_AD: Record<string, string> = { alindi: "Alındı", uretimde: "Üretimde", hazir: "Hazır, kargoya verilecek", kargoda: "Kargoda", teslim: "Teslim edildi", iptal: "İptal" };

async function musteriDurumu(telefon: string | null) {
  const key = phoneKey(telefon);
  if (!key) return { kayitli: false };
  const m = schema.musteriler;
  const [c] = await db()
    .select({ id: m.id, firma: m.firma, yetkili: m.yetkili })
    .from(m)
    .where(phoneMatch("musteriler.telefon", key))
    .orderBy(desc(m.id))
    .limit(1);
  if (!c) return { kayitli: false, not: "Bu numarayla kayıt yok. Sipariş soruyorsa sipariş numarasını iste ve ekibe devret." };
  const sp = schema.siparisler;
  const orders = await db()
    .select({ id: sp.id, no: sp.no, disNo: sp.disNo, durum: sp.durum, tarih: sql<Date>`COALESCE(${sp.disTarih}, ${sp.olusturma})` })
    .from(sp)
    .where(eq(sp.musteriId, c.id))
    .orderBy(desc(sp.id))
    .limit(5);
  const siparisler = [];
  for (const o of orders) {
    const k = await orderCargo(o.id).catch(() => null);
    siparisler.push({
      siparis_no: o.disNo ?? o.no,
      durum: SIPARIS_AD[o.durum] ?? o.durum,
      tarih: new Date(o.tarih).toISOString().slice(0, 10),
      kargo_firmasi: k?.firma ? kargoAd(k.firma) : null,
      takip_linki: takipLinki(k?.firma, k?.takipNo),
    });
  }
  return { kayitli: true, ad: c.yetkili || c.firma, siparisler };
}

/** Sipariş numarasıyla durum: siparişteki (müşteri kaydı, fatura ya da teslimat) telefon sohbetin numarasıyla eşleşmeli */
async function siparisSorgula(telefon: string | null, no: string) {
  const q = no.replace(/^#/, "").trim().slice(0, 40);
  if (!q) return { hata: "Sipariş numarası gerekli." };
  const sp = schema.siparisler;
  const [o] = await db()
    .select({ id: sp.id, no: sp.no, disNo: sp.disNo, durum: sp.durum, tarih: sql<Date>`COALESCE(${sp.disTarih}, ${sp.olusturma})`, siteVeri: sp.siteVeri, telefon: schema.musteriler.telefon })
    .from(sp)
    .leftJoin(schema.musteriler, eq(schema.musteriler.id, sp.musteriId))
    .where(sql`${sp.disNo} = ${q} OR ${sp.no} = ${q}`)
    .orderBy(desc(sp.id))
    .limit(1);
  const yok = { bulundu: false, not: "Bu numarayla, bu WhatsApp numarasına ait sipariş bulunamadı. Numarayı kontrol etmesini iste; yine olmazsa sipariş numarası ve adıyla ekibe devret. Başka bilgi verme." };
  if (!o) return yok;
  const sv = (() => {
    try {
      return o.siteVeri ? (JSON.parse(o.siteVeri) as { musteri?: { telefon?: string }; teslimat?: { telefon?: string } | null; kargo?: { firma: string | null; takipNo: string | null; link?: string | null }; kalemler?: { ad: string; adet: number }[] }) : null;
    } catch {
      return null;
    }
  })();
  const key = phoneKey(telefon);
  const own = !!key && [o.telefon, sv?.musteri?.telefon, sv?.teslimat?.telefon].some((t) => phoneKey(t ?? null) === key);
  if (!own) return yok;
  const k = sv?.kargo?.takipNo ? sv.kargo : await orderCargo(o.id).catch(() => null);
  return {
    bulundu: true,
    siparis_no: o.disNo ?? o.no,
    durum: SIPARIS_AD[o.durum] ?? o.durum,
    tarih: new Date(o.tarih).toISOString().slice(0, 10),
    urunler: (sv?.kalemler ?? []).slice(0, 10).map((x) => `${x.ad} × ${x.adet}`),
    kargo_firmasi: k?.firma ? kargoAd(k.firma) : null,
    takip_linki: takipLinki(k?.firma, k?.takipNo),
    not: "Durumu kısaca bildir. Kargodaysa takip linkini ver. Gecikme, hasar ya da iade varsa ekibe devret.",
  };
}

async function medyaGonder(ctx: Ctx, telefon: string, kod: string, id: string) {
  const card = await getCard(kod);
  const m = card?.aktif ? card.medya.find((x) => x.id === id) : null;
  if (!m) return { hata: "Bu kimlikle izinli medya yok." };
  // Paneldeki webp görsel WhatsApp'a JPEG olarak (/jpg dönüştürücüsü) gider
  const yol = m.yol.startsWith("/dosya/") ? `/jpg${m.yol.replace(/\.webp$/, ".jpg")}` : m.yol;
  const link = yol.startsWith("/") ? publicUrl(yol) : yol;
  const r = await deliver(ctx, telefon, { tur: m.tur, link, yol, metin: m.aciklama || null });
  return r.ok ? { gonderildi: true } : { hata: r.hata };
}

/** Asistanın ürün sitesi: sohbetin ya da kartların sitesi */
/** Gazebo araçları: ana sitenin markası (fiyat tablosu) ve "gazebo" kartı (tasarım linki, kartta düzenlenir) */
async function gazeboCtx(ctx: Ctx) {
  const site = await mainSite(ctx);
  if (!site) return null;
  const card = await getCard("gazebo");
  return { markaId: site.markaId, adres: site.adres, card: card?.aktif ? card : null };
}

async function mainSite(ctx: Ctx) {
  return siteOf((await cardForChat(ctx))?.siteId ?? (await listCards()).find((c) => c.aktif && c.siteId)?.siteId ?? null);
}

async function siteUrunAra(ctx: Ctx, sorgu: string) {
  const site = await mainSite(ctx);
  if (!site) return { hata: "Site bağlantısı yok; bilgileri topla ve ekibe devret." };
  const q = sorgu.trim().slice(0, 80);
  if (q.length < 2) return { hata: "Arama ifadesi çok kısa." };
  let rows: Awaited<ReturnType<typeof wcSearch>>;
  try {
    // Site anlık yoğunlukta (ör. kategori seçenekleriyle aynı anda) hata verebilir: bir kez yeniden denenir
    const all = await wcSearch(site, q).catch(async (e) => {
      console.error("[wa-asistan] site araması", e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, 1500));
      return wcSearch(site, q);
    });
    rows = all.filter((r) => r.durum === "publish" && r.fiyat !== null).slice(0, 8);
  } catch {
    return { hata: "Site şu an okunamadı; fiyat söyleme, ekibe devret." };
  }
  const prices = await sitePanelPrices(site.id).catch(() => new Map<number, PanelFiyat[]>());
  if (!rows.length) return { sonuclar: [], not: "Sitede eşleşen ürün yok. Farklı bir ifadeyle bir kez daha ara; yoksa bilgileri topla ve ekibe devret." };
  return {
    sonuclar: rows.map((r) => {
      const p = prices.get(r.id);
      return p?.length
        ? { urun_id: r.id, ad: r.ad, [p.length > 1 ? "baslangic_fiyati_kdv_dahil" : "fiyat_kdv_dahil"]: Math.min(...p.map((x) => x.fiyat)), link: r.link, fiyat_kaynagi: "panel" }
        : { urun_id: r.id, ad: r.ad, [r.varyantli ? "baslangic_fiyati_kdv_dahil" : "fiyat_kdv_dahil"]: r.fiyat, link: r.link, fiyat_kaynagi: "site" };
    }),
    not: `fiyat_kaynagi "site" olanlarda: ${KAYNAK_SITE_NOTU} ` + "Fiyatlar KDV dahil. Ayrıntı için site_urun_detay. Kartı olmayan üründe fiyat, özellik ve link verirsin; satışı kapatmazsın, bilgileri toplayıp ekibe devredersin. Sonuç gazebo çadırsa sitedeki hazır gazebo modellerinin fiyatını verme: gazebo_secenekleri / gazebo_fiyatla kullan.",
  };
}

/** Panelde bu site ürününe bağlı pazaryeri ürünleri: ölçü, renk, paket ve satış uyarısı (fiyat, toptan ve maliyet dönmez) */
async function panelInfo(siteId: number, urunId: number) {
  const pl = schema.pazaryeriListelemeleri;
  const pu = schema.pazaryeriUrunleri;
  const u = schema.urunler;
  const rows = await db()
    .select({ ad: pu.ad, olcu: pu.olcu, renk: pu.renk, aciklama: pu.aciklama, agirlik: pu.agirlik, en: pu.en, boy: pu.boy, yukseklik: pu.yukseklik, uyari: u.uyari })
    .from(pl)
    .innerJoin(pu, eq(pu.id, pl.urunId))
    .leftJoin(u, eq(u.id, pu.urunId))
    .where(and(eq(pl.siteId, siteId), eq(pl.disUrunId, urunId), eq(pl.aktif, true), eq(pu.aktif, true)))
    .limit(10);
  if (!rows.length) return null;
  const first = rows.find((r) => r.aciklama) ?? rows[0];
  return {
    secenekler: rows.map((r) => ({
      ad: r.ad,
      olcu: r.olcu,
      renk: r.renk,
      paket: r.en && r.boy && r.yukseklik ? `${r.en}×${r.boy}×${r.yukseklik} cm${r.agirlik ? `, ${r.agirlik} kg` : ""}` : r.agirlik ? `${r.agirlik} kg` : null,
    })),
    aciklama: first.aciklama?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200) || null,
    satis_uyarisi: [...new Set(rows.map((r) => r.uyari).filter(Boolean))].join(" ") || null,
  };
}

async function siteUrunDetay(ctx: Ctx, urunId: number) {
  const site = await mainSite(ctx);
  if (!site) return { hata: "Site bağlantısı yok; bilgileri topla ve ekibe devret." };
  if (!(urunId > 0)) return { hata: "urun_id gerekli." };
  try {
    const v = await wcProductInfo(site, urunId);
    if (!v.yayinda || v.fiyat === null) return { hata: "Bu ürün sitede satışta değil; fiyat söyleme, ekibe devret." };
    const [d, varyant, panel, pf] = await Promise.all([
      wcProductDetail(site, urunId),
      v.varyantli ? wcVariations(site, urunId).catch(() => []) : Promise.resolve([]),
      panelInfo(site.id, urunId).catch(() => null),
      panelPriceOf(site.id, urunId).catch(() => null),
    ]);
    const coklu = pf ? pf.coklu : v.varyantli;
    return {
      urun_id: urunId,
      ad: v.ad,
      link: v.link,
      ...(coklu ? { baslangic_fiyati_kdv_dahil: pf?.fiyat ?? v.fiyat } : { fiyat_kdv_dahil: pf?.fiyat ?? v.fiyat }),
      liste_fiyati: v.listeFiyati && v.listeFiyati > (pf?.fiyat ?? v.fiyat) ? v.listeFiyati : null,
      fiyat_kaynagi: pf ? "panel" : "site",
      ...(pf ? {} : { kaynak_notu: KAYNAK_SITE_NOTU }),
      kategoriler: d.kategoriler,
      kisa_aciklama: v.kisaAciklama || null,
      aciklama: d.aciklama || null,
      secenekler: pf
        ? pf.secenekler.map((x) => ({ ad: secenekAdi(x), fiyat_kdv_dahil: x.fiyat }))
        : varyant.filter((x) => x.fiyat !== null).slice(0, 30).map((x) => ({ ad: x.ad, fiyat_kdv_dahil: x.fiyat })),
      panel,
      gorsel_var: !!v.gorsel,
      not: "Bilgiyi kısa ve satış diliyle özetle; açıklamayı olduğu gibi yapıştırma. Kartı olmayan üründe satışı kapatmazsın: ölçü, adet, il ve ad bilgisini topla, bilgi_kaydet ve ekibe_devret. Stok durumundan bahsetme.",
    };
  } catch {
    return { hata: "Ürün şu an siteden okunamadı; fiyat söyleme, ekibe devret." };
  }
}

/** Sitedeki yayındaki ürünün görseli: panelin /jpg dönüştürücüsünden JPEG gider (dönüştürücü de yalnız yayındaki ürünü verir) */
async function urunGorseli(ctx: Ctx, telefon: string, kod: string | null, urunId: number | null) {
  const card = kod ? await getCard(kod) : null;
  const site = card?.aktif && card.siteId ? await siteOf(card.siteId) : await mainSite(ctx);
  const id = urunId || (card?.aktif ? card.disUrunId : null);
  if (!site || !id) return { hata: "urun_id gerekli: urun_bilgisi ya da site_urun_ara'daki ürün numaralarından birini ver." };
  let v: Awaited<ReturnType<typeof wcProductInfo>>;
  try {
    v = await wcProductInfo(site, id);
  } catch {
    return { hata: "Ürün şu an siteden okunamadı." };
  }
  if (!v.yayinda) return { hata: "Bu ürün sitede yayında değil." };
  if (!v.gorsel) return { hata: "Ürünün sitede görseli yok." };
  const yol = `/jpg/site/${site.id}/${id}.jpg`;
  const r = await deliver(ctx, telefon, { tur: "image", link: publicUrl(yol), yol, metin: v.ad });
  return r.ok ? { gonderildi: true, urun: v.ad } : { hata: r.hata };
}

type BilgiInput = { ad: string | null; il: string | null; urun: string | null; adet: number | null; renk: string | null; not: string | null; aranma_zamani: string | null };

async function bilgiKaydet(ctx: Ctx, i: BilgiInput) {
  const c = (v: string | null, max: number) => (v?.trim() ? v.trim().slice(0, max) : null);
  const set = {
    ad: c(i.ad, 120), il: c(i.il, 64), urun: c(i.urun, 160), adet: Number.isInteger(i.adet) && i.adet! > 0 ? Math.min(i.adet!, 1_000_000) : null,
    renk: c(i.renk, 60), not: c(i.not, 2000), aranmaZamani: c(i.aranma_zamani, 120),
  };
  const filled = Object.fromEntries(Object.entries(set).filter(([, v]) => v !== null));
  if (!ctx.cfg) return { kaydedildi: true, deneme: "Deneme alanı: talep yazılmadı.", bilgiler: filled };
  const [open] = await db()
    .select({ id: talepler.id })
    .from(talepler)
    .where(and(eq(talepler.sohbetId, ctx.sohbetId), inArray(talepler.durum, ["yeni", "arandi", "teklif"])))
    .orderBy(desc(talepler.id))
    .limit(1);
  if (open) {
    if (Object.keys(filled).length) await db().update(talepler).set(filled).where(eq(talepler.id, open.id));
  } else {
    await db().insert(talepler).values({ sohbetId: ctx.sohbetId, telefon: ctx.telefon ?? "", ...filled });
    void notify("talep", sellers(), {
      title: "Yeni talep · WhatsApp",
      body: [set.ad || (ctx.telefon ? `+${ctx.telefon}` : null), set.il, set.urun, set.adet ? `${set.adet} adet` : null].filter(Boolean).join(" · ") || "Asistan yeni bir talep kaydetti",
      url: "/panel/talepler",
      tag: `wa-talep-${ctx.sohbetId}`,
    });
  }
  return { kaydedildi: true, bilgiler: filled };
}

async function etiketle(ctx: Ctx, kod: string) {
  const card = await getCard(kod);
  if (!card) return { hata: "Bu kodla ürün kartı yok." };
  await db().update(sohbetler).set({ urunKodu: card.kod }).where(eq(sohbetler.id, ctx.sohbetId));
  ctx.urunKodu = card.kod;
  return { etiketlendi: card.kod };
}

/** Ekibe bildirim: menü rozeti (okunmamış), uygulama bildirimi ve ayarda adres varsa e-posta (deneme alanında yok) */
async function notifyTeam(ctx: Ctx, konu: string, metin: string, oncelikli = false) {
  await db().update(sohbetler).set({ okunmamis: sql`GREATEST(${sohbetler.okunmamis}, 1)` }).where(eq(sohbetler.id, ctx.sohbetId));
  if (!ctx.cfg) return;
  const [c] = await db().select({ telefon: sohbetler.telefon, ad: sohbetler.ad, ilgilenenId: sohbetler.ilgilenenId }).from(sohbetler).where(eq(sohbetler.id, ctx.sohbetId));
  // Sohbetle ilgilenen biri varsa ona, yoksa satış ekibine
  void notify("whatsapp", c?.ilgilenenId ? [c.ilgilenenId] : sellers(), {
    title: `${oncelikli ? "Öncelikli · " : ""}WhatsApp · ${konu.charAt(0).toLocaleUpperCase("tr")}${konu.slice(1)}`,
    body: `${c?.ad || `+${c?.telefon ?? ""}`} · ${metin.replace(/^[Öncelikli] /, "").replace(/s+/g, " ").slice(0, 300)}`,
    url: `/panel/whatsapp?s=${ctx.sohbetId}`,
    tag: `wa-${ctx.sohbetId}`,
  });
  const to = ctx.ayar.bildirim_eposta;
  if (!to || !mailReady()) return;
  const link = publicUrl(`/panel/whatsapp?s=${ctx.sohbetId}`);
  const esc = (v: string) => v.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
  await sendMail({
    to,
    subject: `${oncelikli ? "[Öncelikli] " : ""}WhatsApp: ${konu}: ${c?.ad || c?.telefon || ""}`,
    html: `<p><b>${esc(c?.ad || "")}</b> +${esc(c?.telefon || "")}</p><p>${esc(metin).replace(/\n/g, "<br>")}</p><p><a href="${esc(link)}">Sohbeti panelde aç</a></p>`,
  }).catch((e) => console.error("whatsapp bildirim e-postası", e));
}

/** Sohbeti ekibe devreder (asistanın kendi kararı ya da kalıcı hata/ret durumunda sunucu) */
export async function handOff(ctx: Ctx, sebep: string, ozet: string, oncelik: "normal" | "yuksek") {
  const metin = `${oncelik === "yuksek" ? "[Öncelikli] " : ""}${sebep.trim().slice(0, 300)}\n${ozet.trim().slice(0, 3000)}`.trim();
  await db().update(sohbetler).set({ durum: "ekip", ozet: metin }).where(eq(sohbetler.id, ctx.sohbetId));
  ctx.devredildi = true;
  await notifyTeam(ctx, "sohbet ekibe devredildi", metin, oncelik === "yuksek");
}

async function odemeBilgisi(ctx: Ctx, telefon: string) {
  if (!ctx.ayar.iban_gonderebilir) return { hata: "IBAN gönderimi kapalı; ekibe devret." };
  const card = await cardForChat(ctx);
  const site = await siteOf(card?.siteId ?? null);
  const [m] = site ? await db().select().from(schema.markalar).where(eq(schema.markalar.id, site.markaId)) : [];
  if (!m?.iban) return { hata: "Kayıtlı IBAN bulunamadı; ekibe devret." };
  const metin = [`Havale / EFT bilgilerimiz:`, m.banka && `Banka: ${m.banka}`, `Alıcı: ${m.hesapAdi || m.unvan || m.ad}`, `IBAN: ${m.iban}`, `Açıklamaya adınızı ve telefonunuzu yazmanızı rica ederiz.`]
    .filter(Boolean)
    .join("\n");
  const r = await deliver(ctx, telefon, { tur: "text", metin });
  return r.ok ? { gonderildi: true } : { hata: r.hata };
}

type LinkInput = {
  urun_kodu: string; renk: string; kalem_kodu: string | null; secenek_dahil: boolean; adet: number; ad_soyad: string; adres: string; il: string; eposta: string | null; fatura: string | null;
};

/** Gazebo onayı: tasarım görseli ve özeti müşteriye gider (tutar ve görsel ödeme linkiyle aynı hesaptan) */
async function gazeboOnay(ctx: Ctx, telefon: string, i: GazeboSecim) {
  const g = await gazeboCtx(ctx);
  if (!g) return { hata: "Site bağlantısı yok; ekibe devret." };
  const p = await priceGazebo(g.markaId, i);
  if (!p.ok) return { hata: p.hata };
  let yol: string;
  try {
    yol = await gazeboOnayGorseli(p);
  } catch (e) {
    console.error("[wa-asistan] gazebo görseli", e);
    return { hata: "Tasarım görseli hazırlanamadı; özeti yazıyla gönder." };
  }
  const jpg = `/jpg${yol.replace(/\.webp$/, ".jpg")}`;
  const link3d = designLink(g.card, g.adres, p.size, p.f, p.tasarim);
  const metin = [...p.ozet, `Toplam: ${p.toplam.toLocaleString("tr-TR")} TL (KDV dahil, kargo ücretsiz)`, "", `3D olarak görmek ve çevirmek için: ${link3d}`].join("\n").slice(0, 1024);
  const r = await deliver(ctx, telefon, { tur: "image", link: publicUrl(jpg), yol: jpg, metin });
  if (r.ok) await db().update(sohbetler).set({ gazeboTasarim: JSON.stringify(i) }).where(eq(sohbetler.id, ctx.sohbetId));
  return r.ok
    ? { gonderildi: true, toplam_kdv_dahil: p.toplam, not: "Görsel, özet, toplam ve 3D linki görselin açıklamasında müşteriye gitti. Bunları tekrar yazma: yalnızca tek kısa cümleyle onay iste (ör. \"Tasarımı bu şekilde onaylıyor musunuz? Değiştirmek istediğiniz bir yer varsa söyleyin.\"). Onaylarsa kartla ödeme için ad soyad, açık adres ve il topla; sonra odeme_linki_olustur'u urun_kodu \"gazebo\" ile çağır (link bu onaylı tasarımdan oluşur). Tasarım değişirse önce yeniden gazebo_onay_gonder." }
    : { hata: r.hata };
}

/** Ödeme linki (ayara göre): ekip onaylı → özet ekibe; otomatik → link oluşturulup gönderilir; deneme → yalnızca tutar */
async function odemeLinki(ctx: Ctx, telefon: string, i: LinkInput) {
  const mod = ctx.ayar.odeme_linki;
  if (mod === "kapali") return { hata: "Ödeme linki kapalı; ekibe devret." };
  const card = await getCard(String(i.urun_kodu ?? ""));
  if (!card?.aktif || card.asistanSeviyesi !== "cevaplar") return { hata: "Bu ürün için ödeme linkini ekip hazırlar; bilgileri kaydet ve ekibe devret." };
  const adet = Math.floor(Number(i.adet));
  if (!(adet >= 1 && adet <= 100)) return { hata: "Adet 1 ile 100 arasında olmalı; 100'den fazlası için ekibe devret." };
  const fatura = (i.fatura ?? "").trim().slice(0, 500);
  const kisi = {
    adSoyad: String(i.ad_soyad ?? "").trim().slice(0, 160), adres: String(i.adres ?? "").trim().slice(0, 400), il: String(i.il ?? "").trim().slice(0, 60), eposta: (i.eposta ?? "").trim().slice(0, 191),
    ...(fatura ? { fatura } : {}),
  };
  let taslak: PaymentDraft;
  let renkGerekli = true;
  if (card.kod === "gazebo") {
    // Gazebo: tutar konfigüratörün tablosundan; link oluşturulurken yeniden hesaplanır
    const g = await gazeboCtx(ctx);
    const [s] = await db().select({ t: sohbetler.gazeboTasarim }).from(sohbetler).where(eq(sohbetler.id, ctx.sohbetId));
    const secim = s?.t ? (JSON.parse(s.t) as GazeboSecim) : null;
    const p = g && secim ? await priceGazebo(g.markaId, secim) : { ok: false as const, hata: "Önce gazebo_onay_gonder ile tasarımı müşteriye onaylat." };
    if (!p.ok) return { hata: p.hata };
    if (p.f === 2) return { hata: "Baskılı gazebonun ödeme linkini ekip hazırlar (baskı tasarımı ekiple); bilgileri kaydet ve ekibe devret." };
    taslak = { urunKodu: card.kod, urun: p.ozet[0], renk: p.renk ?? "", adet: p.adet, ...kisi, tutar: p.toplam, gazebo: secim! };
  } else if (card.panelKategoriId) {
    // Panel kategorisi: tutar panel fiyatından (sitedeki fiyat farkı ya da hatası müşteriye yansımaz)
    const site = await siteOf(card.siteId);
    const k = site && i.kalem_kodu ? await panelKalem(site.markaId, card.panelKategoriId, i.kalem_kodu, !!i.secenek_dahil) : { ok: false as const, hata: "kalem_kodu gerekli (urun_bilgisi'ndeki ürün)." };
    if (!k.ok) return { hata: k.hata };
    renkGerekli = k.renk;
    taslak = { urunKodu: card.kod, urun: k.ad, renk: String(i.renk ?? "").trim().slice(0, 60), adet, ...kisi, tutar: tl(k.birim * adet), panel: { kalem: i.kalem_kodu!, secenek: !!i.secenek_dahil } };
  } else {
    const live = await liveProduct(card).catch(() => null);
    if (!live?.v.yayinda || live.v.fiyat === null) return { hata: "Fiyat okunamadı; ekibe devret." };
    taslak = { urunKodu: card.kod, urun: card.ad, renk: String(i.renk ?? "").trim().slice(0, 60), adet, ...kisi, tutar: tl(live.v.fiyat * adet) };
  }
  if (!taslak.adSoyad.includes(" ") || taslak.adres.length < 10 || taslak.il.length < 2 || (renkGerekli && !taslak.renk))
    return { hata: `Ad soyad, açık adres, il${renkGerekli ? " ve renk" : ""} eksik; müşteriden iste.` };
  // Deneme alanı: sipariş ve link oluşturulmaz, ama asistan gerçek sohbetteki sonucu görür (yoksa hata sanıp ekibe devrediyor)
  if (!ctx.cfg) {
    if (mod === "ekip_onayli") return { hazirlaniyor: true, tutar_kdv_dahil: taslak.tutar, not: "Müşteriye şunu söyle: \"Ödeme linkiniz hazırlanıyor, ekibimiz birazdan iletecek.\"" };
    const d = await deliver(ctx, telefon, { tur: "text", metin: `[Deneme] Burada ödeme linki gönderilirdi: ${taslak.urun} × ${adet}${taslak.renk ? ` · ${taslak.renk}` : ""} · ${taslak.tutar} TL${taslak.fatura ? ` · Fatura: ${taslak.fatura}` : ""}` });
    if (!d.ok) return { hata: d.hata };
    return { gonderildi: true, toplam_kdv_dahil: taslak.tutar, not: "Link ayrı mesajla gönderildi; linki tekrar yazma." };
  }
  const ozet = `${taslak.adSoyad} · ${taslak.urun} × ${adet}${taslak.renk ? ` · ${taslak.renk}` : ""} · ${taslak.tutar} TL\n${taslak.adres}, ${taslak.il}${taslak.fatura ? `\nFatura: ${taslak.fatura}` : ""}`;
  if (mod === "ekip_onayli") {
    await db().update(sohbetler).set({ odemeTaslak: JSON.stringify(taslak) }).where(eq(sohbetler.id, ctx.sohbetId));
    await handOff(ctx, "Ödeme linki ekip onayı bekliyor", ozet, "yuksek");
    return { hazirlaniyor: true, tutar_kdv_dahil: taslak.tutar, not: "Müşteriye şunu söyle: \"Ödeme linkiniz hazırlanıyor, ekibimiz birazdan iletecek.\"" };
  }
  const r = await createChatPaymentLink(ctx.sohbetId, telefon, taslak, null, "WhatsApp asistanı");
  if (!r.ok) return { hata: `${r.hata} Ekibe devret.` };
  const d = await deliver(ctx, telefon, { tur: "text", metin: paymentMessage(r.no, r.toplam, r.link) });
  if (!d.ok) return { hata: d.hata };
  await notifyTeam(ctx, "Asistan ödeme linki gönderdi", `${ozet}\nSipariş ${r.no}`);
  return { gonderildi: true, siparis_no: r.no, toplam_kdv_dahil: r.toplam, not: "Link ayrı mesajla gönderildi; linki tekrar yazma." };
}

/** Aracı çalıştırır; sonuç Claude'a JSON metin olarak döner */
export async function runTool(ctx: Ctx, telefon: string, name: string, input: Record<string, unknown>): Promise<{ sonuc: unknown; hata: boolean }> {
  const str = (k: string) => String(input[k] ?? "");
  let sonuc: unknown;
  switch (name) {
    case "urun_bilgisi":
      sonuc = await urunBilgisi(str("kod"));
      break;
    case "urun_bul":
      sonuc = await urunBul(str("sorgu"));
      break;
    case "renkleri_listele":
      sonuc = { renkler: await activeColors(), not: "Üretebildiğimiz renkler. Ürünler stokta tutulmaz: seçilen renkte siparişe özel 5 iş gününde üretilip kargoya verilir; bunu da söyle." };
      break;
    case "renk_kartelasi_gonder":
      sonuc = await renkKartelasi(ctx, telefon);
      break;
    case "taksit_hesapla":
      sonuc = await taksit(ctx, Number(input.tutar));
      break;
    case "musteri_durumu":
      sonuc = await musteriDurumu(ctx.telefon);
      break;
    case "siparis_sorgula":
      sonuc = await siparisSorgula(ctx.telefon, str("siparis_no"));
      break;
    case "medya_gonder":
      sonuc = await medyaGonder(ctx, telefon, str("kod"), str("id"));
      break;
    case "urun_gorseli_gonder":
      sonuc = await urunGorseli(ctx, telefon, input.kod ? str("kod") : null, Number(input.urun_id) || null);
      break;
    case "site_urun_ara":
      sonuc = await siteUrunAra(ctx, str("sorgu"));
      break;
    case "gazebo_onay_gonder":
      sonuc = await gazeboOnay(ctx, telefon, input as GazeboSecim);
      break;
    case "gazebo_secenekleri":
    case "gazebo_fiyatla":
    case "panel_urun_ara": {
      const g = await gazeboCtx(ctx);
      if (!g) sonuc = { hata: "Site bağlantısı yok; bilgileri topla ve ekibe devret." };
      else if (name === "gazebo_secenekleri") sonuc = await gazeboSecenekleri(g.markaId, g.card, g.adres, input.olcu ? str("olcu") : null, input.kumas ? str("kumas") : null);
      else if (name === "gazebo_fiyatla") sonuc = await gazeboFiyatla(g.markaId, g.card, g.adres, input as GazeboInput);
      else sonuc = await panelUrunAra(g.markaId, str("sorgu"));
      break;
    }
    case "site_urun_detay":
      sonuc = await siteUrunDetay(ctx, Number(input.urun_id));
      break;
    case "bilgi_kaydet":
      sonuc = await bilgiKaydet(ctx, input as BilgiInput);
      break;
    case "sohbeti_etiketle":
      sonuc = await etiketle(ctx, str("urun_kodu"));
      break;
    case "ekibe_devret":
      await handOff(ctx, str("sebep"), str("ozet"), input.oncelik === "yuksek" ? "yuksek" : "normal");
      sonuc = { devredildi: true, not: "Müşteriye ekibimizin mesai saatleri içinde (hafta içi 08:00-18:00) kendisine ulaşacağını kısaca söyle; yeni soru sorma." };
      break;
    case "odeme_linki_olustur":
      sonuc = await odemeLinki(ctx, telefon, input as LinkInput);
      break;
    case "odeme_bilgisi_gonder":
      sonuc = await odemeBilgisi(ctx, telefon);
      break;
    default:
      sonuc = { hata: `Bilinmeyen araç: ${name}` };
  }
  return { sonuc, hata: !!(sonuc && typeof sonuc === "object" && "hata" in sonuc) };
}
