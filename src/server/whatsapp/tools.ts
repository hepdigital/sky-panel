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
import { orderCargo } from "../orders";
import { siteInstallments, siteTransferRate } from "../payment-links";
import { fold, getCard, listCards, type Kart } from "./cards";
import type { WaConfig } from "./config";
import { DUVAR_SECENEKLERI, KUMAS_SECENEKLERI, gazeboFiyatla, gazeboSecenekleri, panelUrunAra, type GazeboInput } from "./gazebo";
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

/** Araç tanımları sabit sırada (önbellek). odeme_bilgisi_gonder yalnızca ayar açıksa eklenir. */
export function toolDefs(ayar: WaAyarlar): Anthropic.Beta.BetaTool[] {
  const defs: Anthropic.Beta.BetaTool[] = [
    {
      name: "urun_bilgisi",
      description:
        "Ürün kartının canlı bilgisi: sitedeki güncel fiyat (KDV dahil, indirimliyse liste fiyatıyla), havale/EFT indirimi ve fiyatı, ürün linki. Kategori kartında kategorideki ürünler (ürün numarası, ad, fiyat, link) ve kategori linki. Fiyat soran her müşteride bunu çağır; fiyatı ezberden söyleme.",
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
          kumas: { anyOf: [{ type: "string", enum: KUMAS_SECENEKLERI }, { type: "null" }], description: "Baskısız: 690D (su geçirmez) ya da 200D (su itici); baskılı: baskili. Bilinmiyorsa boş" },
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
          kumas: { type: "string", enum: KUMAS_SECENEKLERI },
          on: { type: "string", enum: DUVAR_SECENEKLERI },
          arka: { type: "string", enum: DUVAR_SECENEKLERI },
          sol: { type: "string", enum: DUVAR_SECENEKLERI },
          sag: { type: "string", enum: DUVAR_SECENEKLERI },
          adet: { anyOf: [{ type: "integer" }, { type: "null" }] },
        },
        required: ["olcu", "iskelet", "kumas", "on", "arka", "sol", "sag", "adet"],
        additionalProperties: false,
      },
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
        "Kartla ödeme için sitede sipariş ve ödeme linki hazırlar. Tutarı sunucu hesaplar (sitedeki fiyat × adet). YALNIZCA müşteri sipariş özetini (ad soyad, adres, ürün, renk, adet, tutar) tek mesajda gördükten sonra açıkça onayladıysa çağır. Yalnız senin baştan sona sattığın ürünler için.",
      input_schema: {
        type: "object",
        properties: {
          urun_kodu: { type: "string" },
          renk: { type: "string" },
          adet: { type: "integer" },
          ad_soyad: { type: "string" },
          adres: { type: "string", description: "Açık adres: mahalle, sokak, no, ilçe" },
          il: { type: "string" },
          eposta: NULLABLE_STR,
        },
        required: ["urun_kodu", "renk", "adet", "ad_soyad", "adres", "il", "eposta"],
        additionalProperties: false,
      },
    });
  if (ayar.iban_gonderebilir)
    defs.push({
      name: "odeme_bilgisi_gonder",
      description: "Havale/EFT ile ödemek isteyen müşteriye şirketin kayıtlı banka ve IBAN bilgisini ayrı bir mesaj olarak gönderir. IBAN'ı asla kendin yazma, bu aracı kullan.",
      input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    });
  return defs.map((d) => ({ ...d, strict: true }));
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
  const urunler = (live?.urunler ?? []).filter((u) => u.fiyat !== null);
  if (!live || !urunler.length) return { ...base, urunler: [], not: "Kategoride fiyatı okunabilen ürün yok; fiyat söyleme, ekibe devret." };
  const oran = card.asistanSeviyesi === "cevaplar" ? await siteTransferRate(live.site) : null;
  return {
    ...base,
    one_cikan_urun_id: card.disUrunId,
    urunler: urunler.map((u) => ({
      urun_id: u.id, ad: u.ad, [u.varyantli ? "baslangic_fiyati_kdv_dahil" : "fiyat_kdv_dahil"]: u.fiyat, link: u.link,
      ...(u.secenekler.length ? { secenekler_kdv_dahil: u.secenekler } : {}),
    })),
    ...(oran !== null ? { havale_eft_indirim_orani: oran } : {}),
    not: `Genel soruda (ör. "bayrak fiyatı ne") seçenekleri kısaca özetle: hangi modeller / ölçüler var ve fiyatları; tek link olarak kategori_linki'ni ver, her ürünün linkini sıralama. Seçenekli üründe en düşük fiyat çoğu zaman tam ürün değildir (ör. "sadece baskı", "sadece iskelet"): fiyatı tam set / komple ürün seçeneği üzerinden söyle, diğer seçenekleri ayrıca belirt; yalnız baskı fiyatını ürün fiyatı gibi sunma. Müşteri belirli bir model ya da ölçü sorarsa o ürünün fiyatını ve linkini ver. Görmek isterse urun_gorseli_gonder.${
      card.asistanSeviyesi === "bilgi_verir" ? " Sonra ölçü, adet, baskı, il ve ad bilgisini topla, bilgi_kaydet ve ekibe_devret. Satışı kapatma: sipariş, ödeme linki, IBAN ya da teslim süresi sözü verme." : ""
    }`,
  };
}

async function urunBilgisi(kod: string) {
  const card = await getCard(kod);
  if (!card || !card.aktif) return { hata: `"${kod}" kodlu ürün kartı yok. urun_bul ile doğru kodu bul.` };
  const base = { kod: card.kod, ad: card.ad, seviye: card.asistanSeviyesi, link: card.url };
  if (card.asistanSeviyesi === "devreder") return { ...base, fiyat: null, not: "Bu ürünün fiyatını ekip verir: ölçü, adet, il ve ad bilgisini topla, kaydet ve ekibe devret." };
  if (card.disKategoriId) return categoryInfo(card);
  let live: Awaited<ReturnType<typeof liveProduct>>;
  try {
    live = await liveProduct(card);
  } catch {
    return { ...base, fiyat: null, not: "Fiyat şu an siteden okunamadı; fiyat söyleme, ekibe devret." };
  }
  if (!live) return { ...base, fiyat: null, not: "Bu ürünün canlı fiyatı tanımlı değil; fiyat söyleme, ekibe devret." };
  const v = live.v;
  if (!v.yayinda || v.fiyat === null) return { ...base, fiyat: null, not: "Ürün sitede satışta değil; fiyat söyleme, ekibe devret." };
  const link = v.link || card.url;
  if (card.asistanSeviyesi === "bilgi_verir")
    return {
      ...base,
      link,
      ...(v.varyantli ? { baslangic_fiyati_kdv_dahil: v.fiyat } : { fiyat_kdv_dahil: v.fiyat }),
      kisa_aciklama: v.kisaAciklama || null,
      not: `${v.varyantli ? `Fiyat ölçü/seçeneğe göre değişir: "${v.fiyat} TL'den başlayan fiyatlarla" de. ` : ""}Fiyatı, özellikleri ve linki ver; sonra ölçü, adet, baskı, il ve ad bilgisini topla, bilgi_kaydet ve ekibe_devret. Satışı kapatma: sipariş, ödeme linki, IBAN ya da teslim süresi sözü verme.`,
    };
  const oran = await siteTransferRate(live.site);
  return {
    ...base,
    link,
    fiyat_kdv_dahil: v.fiyat,
    liste_fiyati: v.listeFiyati,
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
  return { sonuclar: [], not: "Eşleşen kart yok. site_urun_ara ile sitede ara; fiyat, özellik ve link verip bilgileri topla, kaydet ve ekibe devret.", tum_kartlar: cards.map(row) };
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
  if (!rows.length) return { sonuclar: [], not: "Sitede eşleşen ürün yok. Farklı bir ifadeyle bir kez daha ara; yoksa bilgileri topla ve ekibe devret." };
  return {
    sonuclar: rows.map((r) => ({ urun_id: r.id, ad: r.ad, [r.varyantli ? "baslangic_fiyati_kdv_dahil" : "fiyat_kdv_dahil"]: r.fiyat, link: r.link })),
    not: "Fiyatlar KDV dahil, sitedeki güncel fiyat. Ayrıntı için site_urun_detay. Kartı olmayan üründe fiyat, özellik ve link verirsin; satışı kapatmazsın, bilgileri toplayıp ekibe devredersin.",
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
    const [d, varyant, panel] = await Promise.all([
      wcProductDetail(site, urunId),
      v.varyantli ? wcVariations(site, urunId).catch(() => []) : Promise.resolve([]),
      panelInfo(site.id, urunId).catch(() => null),
    ]);
    return {
      urun_id: urunId,
      ad: v.ad,
      link: v.link,
      ...(v.varyantli ? { baslangic_fiyati_kdv_dahil: v.fiyat } : { fiyat_kdv_dahil: v.fiyat }),
      liste_fiyati: v.listeFiyati,
      kategoriler: d.kategoriler,
      kisa_aciklama: v.kisaAciklama || null,
      aciklama: d.aciklama || null,
      secenekler: varyant.filter((x) => x.fiyat !== null).slice(0, 30).map((x) => ({ ad: x.ad, fiyat_kdv_dahil: x.fiyat })),
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
  } else await db().insert(talepler).values({ sohbetId: ctx.sohbetId, telefon: ctx.telefon ?? "", ...filled });
  return { kaydedildi: true, bilgiler: filled };
}

async function etiketle(ctx: Ctx, kod: string) {
  const card = await getCard(kod);
  if (!card) return { hata: "Bu kodla ürün kartı yok." };
  await db().update(sohbetler).set({ urunKodu: card.kod }).where(eq(sohbetler.id, ctx.sohbetId));
  ctx.urunKodu = card.kod;
  return { etiketlendi: card.kod };
}

/** Ekibe bildirim: menü rozeti (okunmamış) ve ayarda adres varsa e-posta (deneme alanında yok) */
async function notifyTeam(ctx: Ctx, konu: string, metin: string, oncelikli = false) {
  await db().update(sohbetler).set({ okunmamis: sql`GREATEST(${sohbetler.okunmamis}, 1)` }).where(eq(sohbetler.id, ctx.sohbetId));
  const to = ctx.ayar.bildirim_eposta;
  if (!ctx.cfg || !to || !mailReady()) return;
  const [c] = await db().select({ telefon: sohbetler.telefon, ad: sohbetler.ad }).from(sohbetler).where(eq(sohbetler.id, ctx.sohbetId));
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

type LinkInput = { urun_kodu: string; renk: string; adet: number; ad_soyad: string; adres: string; il: string; eposta: string | null };

/** Ödeme linki (ayara göre): ekip onaylı → özet ekibe; otomatik → link oluşturulup gönderilir; deneme → yalnızca tutar */
async function odemeLinki(ctx: Ctx, telefon: string, i: LinkInput) {
  const mod = ctx.ayar.odeme_linki;
  if (mod === "kapali") return { hata: "Ödeme linki kapalı; ekibe devret." };
  const card = await getCard(String(i.urun_kodu ?? ""));
  if (!card?.aktif || card.asistanSeviyesi !== "cevaplar") return { hata: "Bu ürün için ödeme linkini ekip hazırlar; bilgileri kaydet ve ekibe devret." };
  const adet = Math.floor(Number(i.adet));
  if (!(adet >= 1 && adet <= 100)) return { hata: "Adet 1 ile 100 arasında olmalı; 100'den fazlası için ekibe devret." };
  const live = await liveProduct(card).catch(() => null);
  if (!live?.v.yayinda || live.v.fiyat === null) return { hata: "Fiyat okunamadı; ekibe devret." };
  const taslak: PaymentDraft = {
    urunKodu: card.kod, urun: card.ad, renk: String(i.renk ?? "").trim().slice(0, 60), adet, adSoyad: String(i.ad_soyad ?? "").trim().slice(0, 160),
    adres: String(i.adres ?? "").trim().slice(0, 400), il: String(i.il ?? "").trim().slice(0, 60), eposta: (i.eposta ?? "").trim().slice(0, 191), tutar: tl(live.v.fiyat * adet),
  };
  if (!taslak.adSoyad.includes(" ") || taslak.adres.length < 10 || taslak.il.length < 2 || !taslak.renk) return { hata: "Ad soyad, açık adres, il ve renk eksik; müşteriden iste." };
  if (!ctx.cfg) return { deneme: "Deneme alanı: link oluşturulmadı.", mod, tutar_kdv_dahil: taslak.tutar, ozet: taslak };
  const ozet = `${taslak.adSoyad} · ${taslak.urun} × ${adet} · ${taslak.renk} · ${taslak.tutar} TL\n${taslak.adres}, ${taslak.il}`;
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
    case "medya_gonder":
      sonuc = await medyaGonder(ctx, telefon, str("kod"), str("id"));
      break;
    case "urun_gorseli_gonder":
      sonuc = await urunGorseli(ctx, telefon, input.kod ? str("kod") : null, Number(input.urun_id) || null);
      break;
    case "site_urun_ara":
      sonuc = await siteUrunAra(ctx, str("sorgu"));
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
      sonuc = { devredildi: true, not: "Müşteriye ekibimizin en kısa sürede döneceğini kısaca söyle; yeni soru sorma." };
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
