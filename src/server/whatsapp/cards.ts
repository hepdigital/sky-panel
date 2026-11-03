import "server-only";
import { asc, eq, like, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { ensureTables } from "./store";

// Asistanın ürün kartları (şartname §4 wa_urun_kartlari, §8). Fiyat kartta tutulmaz; urun_bilgisi aracı siteden okur.
// Kart tek ürüne (disUrunId) ya da site kategorisine (disKategoriId: kategorideki ürünler listelenir, disUrunId öne çıkan) bağlanır.

const { waUrunKartlari: kartlar } = schema;

export type Sss = { soru: string; cevap: string };
export type Itiraz = { itiraz: string; cevap: string };
/** yol: panelde yüklü görsel (/dosya/urun/<ad>.webp) ya da herkese açık https adresi (mp4 video) */
export type Medya = { id: string; tur: "image" | "video"; yol: string; aciklama: string };

export type Seviye = (typeof schema.WA_ASISTAN_SEVIYELERI)[number];

export type Kart = {
  kod: string; ad: string; siteId: number | null; disUrunId: number | null; disKategoriId: number | null; url: string | null; anahtarKelimeler: string; asistanSeviyesi: Seviye;
  bilgi: string; sss: Sss[]; itirazlar: Itiraz[]; medya: Medya[]; yasaklar: string; aktif: boolean;
};

const parse = <T,>(v: string | null): T[] => {
  try {
    const j = JSON.parse(v ?? "[]");
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
};
const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function toKart(r: typeof kartlar.$inferSelect): Kart {
  return {
    kod: r.kod, ad: r.ad, siteId: r.siteId, disUrunId: r.disUrunId, disKategoriId: r.disKategoriId, url: r.url, anahtarKelimeler: r.anahtarKelimeler ?? "", asistanSeviyesi: r.asistanSeviyesi,
    bilgi: r.bilgi ?? "", sss: parse<Sss>(r.sss), itirazlar: parse<Itiraz>(r.itirazlar), medya: parse<Medya>(r.medya), yasaklar: r.yasaklar ?? "", aktif: r.aktif,
  };
}

// ── İlk içerik: 3x3 kış bahçesi (şartname §8) tablo boşken bir kez; bilgi kartları yoksa. Sonra panelden düzenlenir. ─────────

const KIS_BAHCESI_BILGI = `- 3x3 m kış bahçesi çadırı.
- 40 mm güçlendirilmiş çelik iskelet.
- Su itici Oxford kumaş (tavan ve duvarlar).
- Dört tarafta şeffaf pencere.
- Entegre baca (soba) çıkışı: içeride soba kullanılabilir. UFO ve benzeri elektrikli ısıtıcılara uygun.
- Set içeriği: 3x3 m çelik iskelet, çatı ve yan duvar panelleri, 4 kauçuk taban, taşıma ve saklama çantası.
- Kurulum: 1-2 kişiyle yaklaşık 10 dakika.
- Üretim ve kargo: siparişe özel 5 iş gününde üretilip kargoya verilir; kargo genellikle 2-4 iş günü. Kargo ücretsiz.
- Garanti: 1 yıl.
- Kullanım: bahçe, teras, geniş balkon, işletme terası, karavan yanı.
- Uyarılar: 30 km/s üzeri rüzgârda çadır kapatılmalı. Kar yağışında üzerinde kar birikmemeli; yoğun karda kaldırılmalı.
- Renk: stoktaki renkler önerilir; müşteri kararsızsa kartela gönderilir.`;

const KIS_BAHCESI_ITIRAZLAR: Itiraz[] = [
  { itiraz: "Pahalı", cevap: "40 mm çelik iskelet ve soba çıkışlı kapalı yapı; kurulum dahil hiçbir ek masraf yok, kargo ücretsiz, 12 taksit imkânı var." },
  { itiraz: "Kışa dayanır mı?", cevap: "Su itici kumaş ve kapalı yapı yağmur ve soğukta koruma sağlar; soba ya da ısıtıcıyla ısınır. Yoğun kar ve 30 km/s üzeri rüzgâr uyarısı mutlaka söylenir." },
  { itiraz: "Kurulumu zor mu?", cevap: "1-2 kişiyle yaklaşık 10 dakikada kurulur; istenirse kurulum videosu gönderilir." },
];

/** Fiyat ve özellik verip devredilen ürünler (Faz 2.1). Site ürün numarası ve bilgi panelden girilir. */
const BILGI_KARTLARI = [
  {
    kod: "bayrak",
    ad: "Reklam bayrakları (yelken, damla, olta bayrak)",
    anahtarKelimeler: "bayrak, yelken bayrak, damla bayrak, olta bayrak, reklam bayrağı, plaj bayrağı, kırlangıç bayrak, dış mekan bayrak",
    yasaklar: "\"Plaj bayrağı\" ifadesini asla kullanma (müşteri kullansa bile). Doğru adlar: yelken bayrak, damla bayrak, olta bayrak.",
  },
  { kod: "orumcek-stand", ad: "Örümcek stand", anahtarKelimeler: "örümcek stand, orumcek stand, katlanır stand, fuar standı, pop up stand, popup stand", yasaklar: null },
  { kod: "roll-up", ad: "Roll-up banner", anahtarKelimeler: "roll up, rollup, roll-up, roll up banner, banner stand, afiş standı", yasaklar: null },
];

let seeded: Promise<unknown> | null = null;
const ensureSeed = (): Promise<unknown> =>
  (seeded ??= (async () => {
    await ensureTables();
    const [r] = await db().select({ n: sql<number>`COUNT(*)`.mapWith(Number) }).from(kartlar);
    // Bilgi verip devredilen ürün kartları yoksa eklenir (kod değiştirilmiş ya da silinmiş kart yeniden eklenir; kaldırmak için pasifleştirin)
    await db()
      .insert(kartlar)
      .ignore()
      .values(BILGI_KARTLARI.map((k) => ({ ...k, asistanSeviyesi: "bilgi_verir" as const, sss: "[]", itirazlar: "[]", medya: "[]" })));
    if (r?.n) return;
    // Canlı fiyat skygorselmarket bağlantısından okunur (bağlantı yoksa kartta site boş kalır, panelden seçilir)
    const [site] = await db().select({ id: schema.siteBaglantilari.id }).from(schema.siteBaglantilari).where(like(schema.siteBaglantilari.adres, "%skygorselmarket.com%")).limit(1);
    await db()
      .insert(kartlar)
      .ignore()
      .values({
        kod: "kis-bahcesi-3x3",
        ad: "SKY 3x3 Profesyonel Dış Mekan Kış Bahçesi Çadırı",
        siteId: site?.id ?? null,
        disUrunId: 20659,
        url: "https://skygorselmarket.com/sky-3x3-profesyonel-dis-mekan-kis-bahcesi-cadiri/",
        anahtarKelimeler: "kış bahçesi, kış çadırı, kamelya, çardak, kapalı gazebo, soba çıkışlı çadır, balkon kapatma, teras kapatma, bahçe çadırı, karavan kış bahçesi",
        asistanSeviyesi: "cevaplar",
        bilgi: KIS_BAHCESI_BILGI,
        sss: "[]",
        itirazlar: JSON.stringify(KIS_BAHCESI_ITIRAZLAR),
        medya: "[]",
        yasaklar: "Kesin teslim tarihi garanti etme. 3x3 dışındaki ölçüler, tek kapı ya da özel üretim isteklerinde ekibe devret.",
      });
  })().catch((e) => {
    seeded = null;
    throw e;
  }));

export async function listCards(): Promise<Kart[]> {
  await ensureSeed();
  return (await db().select().from(kartlar).orderBy(asc(kartlar.ad))).map(toKart);
}

export async function getCard(kod: string): Promise<Kart | null> {
  await ensureSeed();
  const [r] = await db().select().from(kartlar).where(eq(kartlar.kod, kod));
  return r ? toKart(r) : null;
}

/** Türkçe küçük harf, aksansız: arama karşılaştırması için */
export const fold = (v: string) =>
  v
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c] ?? c)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Kartı kaydeder (yeni ya da güncelleme). kod: küçük harf, rakam ve tire. */
export async function saveCard(raw: Record<string, unknown>, eskiKod: string | null): Promise<{ ok: true } | { ok: false; hata: string }> {
  await ensureSeed();
  const kod = s(raw.kod, 60).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(kod)) return { ok: false, hata: "Kod yalnızca küçük harf, rakam ve tire içerebilir (ör. kis-bahcesi-3x3)." };
  const ad = s(raw.ad, 160);
  if (!ad) return { ok: false, hata: "Ürün adı gerekli." };
  const url = s(raw.url, 255);
  if (url && !/^https:\/\//.test(url)) return { ok: false, hata: "Ürün linki https:// ile başlamalı." };
  const siteId = Number(raw.siteId) || null;
  const disUrunId = Number(raw.disUrunId) || null;
  const disKategoriId = Number(raw.disKategoriId) || null;
  const sss = (Array.isArray(raw.sss) ? raw.sss : []).map((x: Sss) => ({ soru: s(x?.soru, 500), cevap: s(x?.cevap, 2000) })).filter((x) => x.soru && x.cevap).slice(0, 50);
  const itirazlar = (Array.isArray(raw.itirazlar) ? raw.itirazlar : []).map((x: Itiraz) => ({ itiraz: s(x?.itiraz, 500), cevap: s(x?.cevap, 2000) })).filter((x) => x.itiraz && x.cevap).slice(0, 50);
  const medya: Medya[] = [];
  for (const x of (Array.isArray(raw.medya) ? raw.medya : []) as Medya[]) {
    const yol = s(x?.yol, 255);
    const tur = x?.tur === "video" ? "video" : "image";
    if (!yol) continue;
    if (tur === "image" && !/^\/dosya\/urun\/[a-z0-9]+\.webp$/.test(yol) && !/^https:\/\/\S+\.(jpe?g|png)$/i.test(yol))
      return { ok: false, hata: `Görsel yolu geçersiz: ${yol} (panelde yüklü /dosya/urun/… görseli ya da https …jpg/png adresi olmalı).` };
    if (tur === "video" && !/^https:\/\/\S+\.mp4$/i.test(yol)) return { ok: false, hata: `Video adresi https:// ile başlayan bir .mp4 dosyası olmalı: ${yol}` };
    medya.push({ id: s(x?.id, 30).replace(/[^a-z0-9-]/gi, "") || `m${medya.length + 1}`, tur, yol, aciklama: s(x?.aciklama, 300) });
  }
  if (new Set(medya.map((m) => m.id)).size !== medya.length) return { ok: false, hata: "Medya kimlikleri tekil olmalı." };
  const values = {
    kod, ad, siteId, disUrunId, disKategoriId, url: url || null, anahtarKelimeler: s(raw.anahtarKelimeler, 2000) || null,
    asistanSeviyesi: schema.WA_ASISTAN_SEVIYELERI.find((v) => v === raw.asistanSeviyesi) ?? "devreder",
    bilgi: s(raw.bilgi, 20000) || null, sss: JSON.stringify(sss), itirazlar: JSON.stringify(itirazlar), medya: JSON.stringify(medya), yasaklar: s(raw.yasaklar, 4000) || null,
    aktif: raw.aktif !== false,
  };
  if (eskiKod) {
    if (eskiKod !== kod && (await getCard(kod))) return { ok: false, hata: "Bu kod başka bir kartta kullanılıyor." };
    const [r] = await db().update(kartlar).set(values).where(eq(kartlar.kod, eskiKod));
    if (!r.affectedRows) return { ok: false, hata: "Kart bulunamadı." };
    if (eskiKod !== kod) await db().update(schema.waSohbetler).set({ urunKodu: kod }).where(eq(schema.waSohbetler.urunKodu, eskiKod));
  } else {
    if (await getCard(kod)) return { ok: false, hata: "Bu kod başka bir kartta kullanılıyor." };
    await db().insert(kartlar).values(values);
  }
  return { ok: true };
}
