import "server-only";
import { createHmac } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { isAdmin, type Me } from "./auth";
import { brandsFor } from "./brands";
import { db, schema } from "./db";
import { wcRequest } from "./marketplaces/woocommerce";

// Ödeme linki: satışçı tutarı elle girer, panel markanın WooCommerce sitesinde ürünsüz bir sipariş açar ("ödeme bekliyor",
// tutar tek ücret satırı) ve sitenin hazır ödeme sayfasının linkini verir. Müşteri sitedeki iyzico formunda taksit seçerek öder;
// sipariş eşitlemesiyle panele site siparişi olarak döner. Taksit farkını iyzico müşteriye yansıtır; kart komisyonu için
// isteğe bağlı %5 eklenir. Sitedeki SKY Konfigüratör eklentisi bu siparişlerde e-posta doğrulamasını atlar (_sky_odeme_linki).

export const KOMISYON_ORANI = 5;

let ready: Promise<unknown> | null = null;
const ensureTable = (): Promise<unknown> =>
  (ready ??= db()
    .execute(
      sql.raw(`CREATE TABLE IF NOT EXISTS odeme_linkleri (
        id int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
        site_id int unsigned NOT NULL,
        marka_id int unsigned NOT NULL,
        kullanici_id int unsigned NULL,
        dis_id int unsigned NOT NULL,
        dis_no varchar(40) NOT NULL,
        musteri varchar(160) NOT NULL,
        telefon varchar(32) NOT NULL,
        eposta varchar(191) NULL,
        aciklama varchar(255) NULL,
        tutar decimal(12,2) NOT NULL,
        komisyon decimal(5,2) NOT NULL DEFAULT 0,
        toplam decimal(12,2) NOT NULL,
        link varchar(500) NOT NULL,
        iptal tinyint(1) NOT NULL DEFAULT 0,
        olusturma timestamp NOT NULL DEFAULT current_timestamp(),
        UNIQUE KEY odeme_linki_site_dis (site_id, dis_id),
        KEY odeme_linki_kullanici (kullanici_id),
        CONSTRAINT odeme_linkleri_site_fk FOREIGN KEY (site_id) REFERENCES site_baglantilari (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`),
    )
    .catch((e) => {
      ready = null;
      throw e;
    }));

type Row = {
  id: number; site_id: number; marka_id: number; kullanici_id: number | null; dis_id: number; dis_no: string; musteri: string; telefon: string;
  eposta: string | null; aciklama: string | null; tutar: string; komisyon: string; toplam: string; link: string; iptal: number; olusturma: Date;
};

/** Satışçının link açabileceği siteler: çalıştığı markaların etkin WooCommerce bağlantıları */
export async function paymentSites(me: Me) {
  const brands = await brandsFor(me);
  if (!brands.length) return [];
  const s = schema.siteBaglantilari;
  return db()
    .select({ id: s.id, ad: s.ad, adres: s.adres, markaId: s.markaId, marka: schema.markalar.ad })
    .from(s)
    .innerJoin(schema.markalar, eq(schema.markalar.id, s.markaId))
    .where(and(eq(s.tur, "woocommerce"), eq(s.aktif, true), inArray(s.markaId, brands.map((b) => b.id))))
    .orderBy(s.id);
}

const cleanPhone = (v: string) => {
  let d = v.replace(/\D/g, "");
  if (d.startsWith("90") && d.length === 12) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  return /^[2-5]\d{9}$/.test(d) ? `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}` : null;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

export type NewPaymentLink = { siteId: number; musteri: string; telefon: string; eposta?: string; aciklama?: string; tutar: number; komisyon: boolean };

export async function createPaymentLink(me: Me, input: NewPaymentLink) {
  const site = (await paymentSites(me)).find((s) => s.id === Number(input.siteId));
  if (!site) return { ok: false as const, hata: "Site seçin." };
  const musteri = String(input.musteri ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
  if (musteri.length < 2) return { ok: false as const, hata: "Müşteri adını yazın." };
  const telefon = cleanPhone(String(input.telefon ?? ""));
  if (!telefon) return { ok: false as const, hata: "Telefonu kontrol edin (ör. 0532 123 45 67)." };
  const eposta = String(input.eposta ?? "").trim().toLowerCase();
  if (eposta && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eposta)) return { ok: false as const, hata: "E-posta adresini kontrol edin." };
  const tutar = round2(Number(input.tutar));
  if (!(tutar >= 1 && tutar <= 2_000_000)) return { ok: false as const, hata: "Tutarı kontrol edin." };
  const komisyon = input.komisyon ? KOMISYON_ORANI : 0;
  const toplam = round2(tutar * (1 + komisyon / 100));
  const aciklama = String(input.aciklama ?? "").trim().slice(0, 200);

  const [full] = await db().select().from(schema.siteBaglantilari).where(eq(schema.siteBaglantilari.id, site.id));
  const parts = musteri.split(" ");
  const ad = parts.length > 1 ? parts.slice(0, -1).join(" ") : musteri;
  const soyad = parts.length > 1 ? parts[parts.length - 1] : "";
  // iyzico alıcı e-postası ister: müşteri e-postası yoksa sitenin alan adında bir adres yazılır (doğrulama eklentide kapalı)
  const host = new URL(site.adres).hostname.replace(/^www\./, "");
  let order: { id: number; number: string; payment_url: string };
  try {
    order = (await wcRequest(full, "/orders", {
      method: "POST",
      body: JSON.stringify({
        status: "pending",
        currency: "TRY",
        billing: { first_name: ad, last_name: soyad, phone: telefon, email: eposta || `odeme@${host}`, country: "TR" },
        fee_lines: [{ name: aciklama ? `Ödeme · ${aciklama}` : "Ödeme", total: toplam.toFixed(2), tax_status: "none" }],
        customer_note: aciklama,
        meta_data: [
          { key: "_sky_odeme_linki", value: "1" },
          { key: "_sky_satisci", value: me.adSoyad },
          ...(komisyon ? [{ key: "_sky_kart_komisyonu", value: `%${komisyon} (${tutar.toFixed(2)} + ${(toplam - tutar).toFixed(2)})` }] : []),
        ],
      }),
    })) as typeof order;
  } catch (e) {
    return { ok: false as const, hata: `Sitede sipariş açılamadı: ${(e as Error).message}` };
  }
  if (!order?.payment_url) return { ok: false as const, hata: "Site ödeme linki vermedi." };

  await ensureTable();
  await db().execute(
    sql`INSERT INTO odeme_linkleri (site_id, marka_id, kullanici_id, dis_id, dis_no, musteri, telefon, eposta, aciklama, tutar, komisyon, toplam, link)
        VALUES (${site.id}, ${site.markaId}, ${me.id}, ${order.id}, ${String(order.number)}, ${musteri}, ${telefon}, ${eposta || null}, ${aciklama || null}, ${tutar}, ${komisyon}, ${toplam}, ${order.payment_url})`,
  );
  return { ok: true as const, link: order.payment_url, no: String(order.number), toplam };
}

/** Linkler ve ödeme durumu (eşitlenen site siparişinden): yönetici hepsini, satışçı kendi açtıklarını görür */
export async function listPaymentLinks(me: Me) {
  await ensureTable();
  const own = isAdmin(me) ? sql`` : sql`WHERE l.kullanici_id = ${me.id}`;
  const [rows] = (await db().execute(sql`
    SELECT l.*, k.ad_soyad AS satisci, s.ad AS site, sp.id AS siparis_id, sp.odeme_durumu, sp.dis_durum, sp.durum
    FROM odeme_linkleri l
    LEFT JOIN kullanicilar k ON k.id = l.kullanici_id
    LEFT JOIN site_baglantilari s ON s.id = l.site_id
    LEFT JOIN siparisler sp ON sp.site_id = l.site_id AND BINARY sp.dis_no = BINARY l.dis_no
    ${own}
    ORDER BY l.id DESC LIMIT 200`)) as unknown as [(Row & { satisci: string | null; site: string | null; siparis_id: number | null; odeme_durumu: string | null; dis_durum: string | null; durum: string | null })[]];
  return rows.map((r) => ({
    id: r.id,
    no: r.dis_no,
    musteri: r.musteri,
    telefon: r.telefon,
    aciklama: r.aciklama,
    tutar: Number(r.tutar),
    komisyon: Number(r.komisyon),
    toplam: Number(r.toplam),
    link: r.link,
    site: r.site,
    satisci: r.satisci,
    siparisId: r.siparis_id,
    durum: r.iptal || r.durum === "iptal" ? ("iptal" as const) : r.odeme_durumu === "odendi" ? ("odendi" as const) : ("bekliyor" as const),
    olusturma: new Date(r.olusturma).toISOString(),
  }));
}

/** Ödenmemiş linki iptal eder: sitedeki sipariş iptal edilir, link artık ödeme almaz */
export async function cancelPaymentLink(me: Me, id: number) {
  await ensureTable();
  const [[l]] = (await db().execute(sql`SELECT * FROM odeme_linkleri WHERE id = ${id}`)) as unknown as [Row[]];
  if (!l) return { ok: false as const, hata: "Link bulunamadı." };
  if (!isAdmin(me) && l.kullanici_id !== me.id) return { ok: false as const, hata: "Bu linki yalnızca açan kişi iptal edebilir." };
  const [site] = await db().select().from(schema.siteBaglantilari).where(eq(schema.siteBaglantilari.id, l.site_id));
  if (!site) return { ok: false as const, hata: "Site bağlantısı bulunamadı." };
  try {
    const cur = (await wcRequest(site, `/orders/${l.dis_id}`)) as { status: string; date_paid: string | null };
    if (cur.date_paid || ["processing", "completed"].includes(cur.status)) return { ok: false as const, hata: "Bu sipariş ödenmiş, iptal edilemez." };
    if (cur.status !== "cancelled") await wcRequest(site, `/orders/${l.dis_id}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
  } catch (e) {
    return { ok: false as const, hata: `Sitede iptal edilemedi: ${(e as Error).message}` };
  }
  await db().execute(sql`UPDATE odeme_linkleri SET iptal = 1 WHERE id = ${id}`);
  return { ok: true as const };
}

export type Taksit = { n: number; aylik: number; toplam: number };
export type TaksitTablosu = { tutar: number; aileler: { aile: string; banka: string; taksitler: Taksit[] }[] };

/**
 * iyzico taksit tutarları (vade farkı dahil, müşterinin ödeme formunda göreceği): sitedeki SKY Konfigüratör eklentisi
 * iyzico'ya sitenin anahtarlarıyla sorar; panel isteği ortak anahtarla (KONFIGURATOR_SECRET) imzalar.
 */
export async function installmentTable(me: Me, siteId: number, tutar: number): Promise<{ ok: true; tablo: TaksitTablosu } | { ok: false; hata: string }> {
  const site = (await paymentSites(me)).find((s) => s.id === Number(siteId));
  const secret = process.env.KONFIGURATOR_SECRET;
  const t = round2(tutar);
  if (!site || !secret || !(t >= 1 && t <= 2_000_000)) return { ok: false, hata: "Taksit bilgisi alınamadı." };
  const tutarStr = t.toFixed(2);
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret).update(`taksit|${tutarStr}|${ts}`).digest("base64url");
  try {
    const res = await fetch(`${site.adres.replace(/\/+$/, "")}/wp-json/sky/v1/taksit?tutar=${tutarStr}&ts=${ts}&sig=${sig}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const data = (await res.json().catch(() => null)) as (TaksitTablosu & { hata?: string }) | null;
    if (!res.ok || !data?.aileler) return { ok: false, hata: data?.hata ?? `Taksit bilgisi alınamadı (HTTP ${res.status}).` };
    return { ok: true, tablo: data };
  } catch {
    return { ok: false, hata: "Taksit bilgisi alınamadı." };
  }
}
