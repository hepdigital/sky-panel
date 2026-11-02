import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { takipLinki, kargoAd } from "@/lib/cargo";
import { listColors } from "../colors";
import { phoneKey, phoneMatch } from "../customers";
import { db, schema } from "../db";
import { mailReady, sendMail } from "../mail";
import { wcProductInfo } from "../marketplaces/woocommerce";
import { orderCargo } from "../orders";
import { siteInstallments } from "../payment-links";
import { fold, getCard, listCards, type Kart } from "./cards";
import type { WaConfig } from "./config";
import { sendMedia, sendText } from "./graph";
import type { WaAyarlar } from "./settings";
import { ARAC, insertMessage, MAX_TEXT } from "./store";

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
        "Ürün kartının canlı bilgisi: sitedeki güncel fiyat (KDV dahil, indirimliyse liste fiyatıyla), havale/EFT fiyatı, stok durumu ve ürün linki. Fiyat soran her müşteride bunu çağır; fiyatı ezberden söyleme.",
      input_schema: { type: "object", properties: { kod: { type: "string", description: "Ürün kartı kodu, ör. kis-bahcesi-3x3" } }, required: ["kod"], additionalProperties: false },
    },
    {
      name: "urun_bul",
      description: "Müşterinin ifadesine (ör. 'kamelya', 'bayrak') uyan ürün kartlarını bulur: kod, ad ve asistanın bu ürünü baştan sona cevaplayıp cevaplamadığı (kapsamda).",
      input_schema: { type: "object", properties: { sorgu: { type: "string" } }, required: ["sorgu"], additionalProperties: false },
    },
    {
      name: "renkleri_listele",
      description: "Stokta olan kumaş renkleri (ad ve renk kodu). Yalnızca bu renkleri öner.",
      input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
    {
      name: "renk_kartelasi_gonder",
      description: "Stoktaki renklerin kartela görselini müşteriye WhatsApp'tan gönderir. Müşteri renk konusunda kararsızsa kullan.",
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

/** Sohbetin ürünü ya da kapsamdaki ilk kart (taksit ve IBAN'ın sitesi/markası için) */
async function cardForChat(ctx: Ctx): Promise<Kart | null> {
  const cards = (await listCards()).filter((c) => c.aktif);
  return cards.find((c) => c.kod === ctx.urunKodu) ?? cards.find((c) => c.asistanCevaplar && c.siteId) ?? null;
}

const tl = (n: number) => Math.round(n * 100) / 100;

async function urunBilgisi(kod: string) {
  const card = await getCard(kod);
  if (!card || !card.aktif) return { hata: `"${kod}" kodlu ürün kartı yok. urun_bul ile doğru kodu bul.` };
  const base = { kod: card.kod, ad: card.ad, kapsamda: card.asistanCevaplar, link: card.url };
  const site = await siteOf(card.siteId);
  if (!site || !card.disUrunId) return { ...base, fiyat: null, not: "Bu ürünün canlı fiyatı tanımlı değil; fiyat söyleme, ekibe devret." };
  const key = `${site.id}:${card.disUrunId}`;
  let info = priceCache.get(key);
  if (!info || Date.now() - info.t > 5 * 60_000) {
    try {
      info = { t: Date.now(), v: await wcProductInfo(site, card.disUrunId) };
      priceCache.set(key, info);
    } catch {
      return { ...base, fiyat: null, not: "Fiyat şu an siteden okunamadı; fiyat söyleme, ekibe devret." };
    }
  }
  const v = info.v;
  if (!v.yayinda || v.fiyat === null) return { ...base, fiyat: null, not: "Ürün sitede satışta değil; fiyat söyleme, ekibe devret." };
  return {
    ...base,
    link: v.link || card.url,
    fiyat_kdv_dahil: v.fiyat,
    liste_fiyati: v.listeFiyati,
    havale_eft_fiyati: tl(v.fiyat * 0.95),
    stokta: v.stokta,
    kargo: "Ücretsiz",
    not: "Havale/EFT ile ödemede sitede %5 indirim uygulanır (havale_eft_fiyati). Kartla 12 taksite kadar, taksit farkıyla.",
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
  const row = (c: Kart) => ({ kod: c.kod, ad: c.ad, kapsamda: c.asistanCevaplar });
  if (scored.length) return { sonuclar: scored.map((x) => row(x.c)) };
  return { sonuclar: [], not: "Eşleşen kart yok. Ürün kapsam dışı sayılır: bilgileri topla, kaydet ve ekibe devret.", tum_kartlar: cards.map(row) };
}

async function activeColors() {
  return (await listColors()).filter((c) => c.aktif).map((c) => ({ ad: c.ad, hex: c.hex }));
}

async function renkKartelasi(ctx: Ctx, telefon: string) {
  const colors = await activeColors();
  if (!colors.length) return { hata: "Stokta renk yok." };
  // Renk listesi değişince adres değişir (Meta eski görseli önbellekten vermesin)
  const v = createHash("sha1").update(colors.map((c) => c.hex + c.ad).join("|")).digest("hex").slice(0, 10);
  const yol = `/jpg/kartela/renkler.jpg?v=${v}`;
  const metin = `Stoktaki renklerimiz: ${colors.map((c, i) => `${i + 1}. ${c.ad}`).join(", ")}`;
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

/** Sohbeti ekibe devreder (asistanın kendi kararı ya da kalıcı hata/ret durumunda sunucu) */
export async function handOff(ctx: Ctx, sebep: string, ozet: string, oncelik: "normal" | "yuksek") {
  const metin = `${oncelik === "yuksek" ? "[Öncelikli] " : ""}${sebep.trim().slice(0, 300)}\n${ozet.trim().slice(0, 3000)}`.trim();
  await db()
    .update(sohbetler)
    .set({ durum: "ekip", ozet: metin, okunmamis: sql`GREATEST(${sohbetler.okunmamis}, 1)` })
    .where(eq(sohbetler.id, ctx.sohbetId));
  ctx.devredildi = true;
  const to = ctx.ayar.bildirim_eposta;
  if (ctx.cfg && to && mailReady()) {
    const [c] = await db().select({ telefon: sohbetler.telefon, ad: sohbetler.ad }).from(sohbetler).where(eq(sohbetler.id, ctx.sohbetId));
    const link = publicUrl(`/panel/whatsapp?s=${ctx.sohbetId}`);
    const esc = (v: string) => v.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
    await sendMail({
      to,
      subject: `${oncelik === "yuksek" ? "[Öncelikli] " : ""}WhatsApp sohbeti ekibe devredildi: ${c?.ad || c?.telefon || ""}`,
      html: `<p><b>${esc(c?.ad || "")}</b> +${esc(c?.telefon || "")}</p><p>${esc(metin).replace(/\n/g, "<br>")}</p><p><a href="${esc(link)}">Sohbeti panelde aç</a></p>`,
    }).catch((e) => console.error("whatsapp devretme e-postası", e));
  }
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
      sonuc = { renkler: await activeColors() };
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
    case "odeme_bilgisi_gonder":
      sonuc = await odemeBilgisi(ctx, telefon);
      break;
    default:
      sonuc = { hata: `Bilinmeyen araç: ${name}` };
  }
  return { sonuc, hata: !!(sonuc && typeof sonuc === "object" && "hata" in sonuc) };
}
