import "server-only";
import { and, desc, eq, gt, ne, sql } from "drizzle-orm";
import type { Me } from "../auth";
import { customerByPhone } from "../customers";
import { db, schema } from "../db";
import { saveWhatsappMedia } from "../files";
import { waConfig, windowOpen, type WaConfig } from "./config";
import { downloadMedia, sendText } from "./graph";

// WhatsApp gelen kutusu (şartname §4, §5): webhook kaydı, panel listesi, panelden gönderme.
// Asistan fazına ait alanlar (urun_kodu, isleniyor_kadar, asistan_gecmis, ozet) burada yazılmaz.

const { waSohbetler: sohbetler, waMesajlar: mesajlar, kullanicilar } = schema;

let ready: Promise<unknown> | null = null;
const ensureTables = (): Promise<unknown> =>
  (ready ??= (async () => {
    await db().execute(
      sql.raw(`CREATE TABLE IF NOT EXISTS wa_sohbetler (
        id int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
        telefon varchar(32) NOT NULL,
        ad varchar(120) NULL,
        durum enum('asistan','ekip','kapali') NOT NULL DEFAULT 'asistan',
        ilgilenen_id int unsigned NULL,
        kaynak enum('reklam','site','dogrudan') NOT NULL DEFAULT 'dogrudan',
        reklam_id varchar(40) NULL,
        ctwa_clid varchar(191) NULL,
        urun_kodu varchar(60) NULL,
        musteri_id int unsigned NULL,
        son_musteri_mesaji timestamp NULL DEFAULT NULL,
        son_mesaj timestamp NOT NULL DEFAULT current_timestamp(),
        okunmamis int unsigned NOT NULL DEFAULT 0,
        isleniyor_kadar timestamp NULL DEFAULT NULL,
        asistan_gecmis longtext NULL,
        ozet text NULL,
        olusturma timestamp NOT NULL DEFAULT current_timestamp(),
        guncelleme timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
        UNIQUE KEY wa_sohbet_telefon (telefon),
        KEY wa_sohbet_son (son_mesaj)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`),
    );
    await db().execute(
      sql.raw(`CREATE TABLE IF NOT EXISTS wa_mesajlar (
        id int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
        sohbet_id int unsigned NOT NULL,
        wamid varchar(191) NOT NULL,
        yon enum('gelen','asistan','ekip') NOT NULL,
        tur varchar(20) NOT NULL,
        metin text NULL,
        medya_id varchar(191) NULL,
        medya_yol varchar(255) NULL,
        durum varchar(20) NULL,
        kullanici_id int unsigned NULL,
        ham json NULL,
        tarih timestamp NOT NULL DEFAULT current_timestamp(),
        UNIQUE KEY wa_mesaj_wamid (wamid),
        KEY wa_mesaj_sohbet (sohbet_id, tarih),
        CONSTRAINT wa_mesajlar_sohbet_id_wa_sohbetler_id_fk FOREIGN KEY (sohbet_id) REFERENCES wa_sohbetler (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`),
    );
  })().catch((e) => {
    ready = null;
    throw e;
  }));

// ── Webhook ────────────────────────────────────────────────────────────────

type Referral = { source_id?: string; source_type?: string; source_url?: string; ctwa_clid?: string; headline?: string };
type WaMessage = {
  id: string;
  from?: string;
  to?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; caption?: string };
  video?: { id?: string; caption?: string };
  document?: { id?: string; filename?: string; caption?: string };
  audio?: { id?: string };
  sticker?: { id?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  reaction?: { emoji?: string };
  contacts?: { name?: { formatted_name?: string } }[];
  referral?: Referral;
};
type WaStatus = { id: string; status?: string };
type WaValue = {
  metadata?: { phone_number_id?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: WaMessage[];
  /** Coexistence: ekibin telefondaki WhatsApp Business uygulamasından attığı mesajlar */
  message_echoes?: WaMessage[];
  statuses?: WaStatus[];
};
export type WebhookBody = { object?: string; entry?: { changes?: { field?: string; value?: WaValue }[] }[] };

/** İndirilecek gelen görseller (webhook cevabından sonra indirilir) */
export type PendingMedia = { wamid: string; medyaId: string };

const digits = (v: string | undefined) => (v ?? "").replace(/\D/g, "").slice(0, 32);
const clip = (v: string | null | undefined, max: number) => (v?.trim() ? v.trim().slice(0, max) : null);
const tsOf = (m: WaMessage) => {
  const n = Number(m.timestamp);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
};

/** Mesajın panelde görünen metni (medyanın açıklaması, buton/liste cevabı, konum…) */
function textOf(m: WaMessage): string | null {
  switch (m.type) {
    case "text":
      return m.text?.body ?? null;
    case "image":
      return m.image?.caption ?? null;
    case "video":
      return m.video?.caption ?? null;
    case "document":
      return [m.document?.filename, m.document?.caption].filter(Boolean).join(" · ") || null;
    case "button":
      return m.button?.text ?? null;
    case "interactive":
      return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
    case "reaction":
      return m.reaction?.emoji ?? null;
    case "location":
      return [m.location?.name, m.location?.address, m.location ? `${m.location.latitude}, ${m.location.longitude}` : null].filter(Boolean).join(" · ") || null;
    case "contacts":
      return m.contacts?.map((c) => c.name?.formatted_name).filter(Boolean).join(", ") || null;
    default:
      return null;
  }
}

const mediaIdOf = (m: WaMessage) => m.image?.id ?? m.video?.id ?? m.document?.id ?? m.audio?.id ?? m.sticker?.id ?? null;

/** İlk mesajın kaynağı: reklam (referral), site (mesajda site linki) ya da doğrudan */
function sourceOf(m: WaMessage) {
  if (m.referral) return { kaynak: "reklam" as const, reklamId: clip(m.referral.source_id, 40), ctwaClid: clip(m.referral.ctwa_clid, 191) };
  if (/skygorselmarket\.com/i.test(textOf(m) ?? "")) return { kaynak: "site" as const, reklamId: null, ctwaClid: null };
  return { kaynak: "dogrudan" as const, reklamId: null, ctwaClid: null };
}

/** Sohbeti bulur ya da açar (kaynak yalnızca açılışta yazılır); kimliğini döner */
async function chatId(telefon: string, ad: string | null, first: WaMessage | null) {
  const src = first ? sourceOf(first) : { kaynak: "dogrudan" as const, reklamId: null, ctwaClid: null };
  const [r] = await db()
    .insert(sohbetler)
    .values({ telefon, ad, ...src })
    .onDuplicateKeyUpdate({ set: { ad: sql`COALESCE(VALUES(ad), ad)`, id: sql`LAST_INSERT_ID(id)` } });
  return r.insertId;
}

/** Mesajı yazar; aynı wamid daha önce geldiyse false (Meta aynı webhook'u tekrar gönderebilir) */
async function insertMessage(v: typeof mesajlar.$inferInsert) {
  // INSERT IGNORE: tekrar gelen kayıtta etkilenen satır 0 olur (ON DUPLICATE KEY UPDATE eşleşen satırı da sayar)
  const [r] = await db().insert(mesajlar).ignore().values(v);
  return r.affectedRows === 1;
}

const STATUS_RANK = ["sent", "delivered", "read"];

/** Webhook gövdesini kaydeder. Yalnız hızlı veritabanı işleri yapılır; görseller sonradan indirilir. */
export async function saveWebhook(cfg: WaConfig, body: WebhookBody): Promise<PendingMedia[]> {
  await ensureTables();
  const media: PendingMedia[] = [];
  for (const entry of body.entry ?? [])
    for (const change of entry.changes ?? []) {
      const v = change.value;
      // Uygulamaya bağlı başka bir numaranın bildirimi işlenmez
      if (!v || (v.metadata?.phone_number_id && v.metadata.phone_number_id !== cfg.phoneNumberId)) continue;
      const names = new Map((v.contacts ?? []).map((c) => [digits(c.wa_id), clip(c.profile?.name, 120)]));

      for (const m of v.messages ?? []) {
        const telefon = digits(m.from);
        if (!telefon || !m.id) continue;
        const id = await chatId(telefon, names.get(telefon) ?? null, m);
        const tarih = tsOf(m);
        const medyaId = clip(mediaIdOf(m), 191);
        const added = await insertMessage({ sohbetId: id, wamid: m.id.slice(0, 191), yon: "gelen", tur: (m.type ?? "unknown").slice(0, 20), metin: textOf(m), medyaId, ham: m, tarih });
        if (!added) continue;
        // Kapalı sohbete yeni mesaj gelirse sohbet yeniden açılır
        await db()
          .update(sohbetler)
          .set({
            sonMesaj: sql`GREATEST(${sohbetler.sonMesaj}, ${tarih})`,
            sonMusteriMesaji: sql`GREATEST(COALESCE(${sohbetler.sonMusteriMesaji}, ${tarih}), ${tarih})`,
            okunmamis: sql`${sohbetler.okunmamis} + 1`,
            durum: sql`IF(${sohbetler.durum} = 'kapali', 'asistan', ${sohbetler.durum})`,
          })
          .where(eq(sohbetler.id, id));
        if (m.type === "image" && medyaId) media.push({ wamid: m.id.slice(0, 191), medyaId });
      }

      for (const m of v.message_echoes ?? []) {
        const telefon = digits(m.to);
        if (!telefon || !m.id) continue;
        const id = await chatId(telefon, null, null);
        const tarih = tsOf(m);
        const medyaId = clip(mediaIdOf(m), 191);
        const added = await insertMessage({ sohbetId: id, wamid: m.id.slice(0, 191), yon: "ekip", tur: (m.type ?? "unknown").slice(0, 20), metin: textOf(m), medyaId, ham: m, tarih });
        if (!added) continue;
        // Ekip telefondan yazdı: sohbet ekipte (asistan fazında asistan susar)
        await db()
          .update(sohbetler)
          .set({ sonMesaj: sql`GREATEST(${sohbetler.sonMesaj}, ${tarih})`, durum: "ekip" })
          .where(eq(sohbetler.id, id));
        if (m.type === "image" && medyaId) media.push({ wamid: m.id.slice(0, 191), medyaId });
      }

      for (const s of v.statuses ?? []) {
        const durum = s.status?.slice(0, 20);
        if (!s.id || !durum) continue;
        // Durumlar sırasız gelebilir: okundu → iletildi'ye geri dönülmez; başarısız her zaman yazılır
        await db()
          .update(mesajlar)
          .set({ durum })
          .where(
            and(
              eq(mesajlar.wamid, s.id.slice(0, 191)),
              durum === "failed" || !STATUS_RANK.includes(durum)
                ? undefined
                : sql`(${mesajlar.durum} IS NULL OR (${mesajlar.durum} <> 'failed' AND FIELD(${mesajlar.durum}, 'sent', 'delivered', 'read') < FIELD(${durum}, 'sent', 'delivered', 'read')))`,
            ),
          );
      }
    }
  return media;
}

/** Gelen görselleri indirip UPLOAD_DIR/whatsapp/ altına yazar (webhook cevabından sonra çalışır) */
export async function fetchMedia(cfg: WaConfig, list: PendingMedia[]) {
  for (const p of list) {
    try {
      const file = await downloadMedia(cfg, p.medyaId);
      if (!file) continue;
      const yol = await saveWhatsappMedia(file.mime, file.data);
      await db().update(mesajlar).set({ medyaYol: yol }).where(eq(mesajlar.wamid, p.wamid));
    } catch (e) {
      console.error("whatsapp medya", e);
    }
  }
}

// ── Panel ──────────────────────────────────────────────────────────────────

export type ChatDurum = (typeof schema.WA_SOHBET_DURUMLARI)[number];

/** Gelen kutusu listesi: son mesaja göre en yeni 100 sohbet, son mesajın kısa metniyle */
export async function listChats(durum: ChatDurum | null) {
  await ensureTables();
  const son = sql<string | null>`(SELECT COALESCE(m.metin, CONCAT('[', m.tur, ']')) FROM wa_mesajlar m WHERE m.sohbet_id = ${sohbetler.id} ORDER BY m.tarih DESC, m.id DESC LIMIT 1)`;
  return db()
    .select({
      id: sohbetler.id, telefon: sohbetler.telefon, ad: sohbetler.ad, durum: sohbetler.durum, kaynak: sohbetler.kaynak,
      okunmamis: sohbetler.okunmamis, sonMesaj: sohbetler.sonMesaj, sonMusteriMesaji: sohbetler.sonMusteriMesaji, ilgilenen: kullanicilar.adSoyad, son,
    })
    .from(sohbetler)
    .leftJoin(kullanicilar, eq(kullanicilar.id, sohbetler.ilgilenenId))
    .where(durum ? eq(sohbetler.durum, durum) : ne(sohbetler.durum, "kapali"))
    .orderBy(desc(sohbetler.sonMesaj))
    .limit(100);
}

/** Tek sohbet: son 200 mesaj ve müşteri kartı. Açılınca okunmamış sayısı sıfırlanır. */
export async function getChat(me: Me, id: number) {
  await ensureTables();
  const [c] = await db()
    .select({ s: sohbetler, ilgilenen: kullanicilar.adSoyad })
    .from(sohbetler)
    .leftJoin(kullanicilar, eq(kullanicilar.id, sohbetler.ilgilenenId))
    .where(eq(sohbetler.id, id));
  if (!c) return null;
  const rows = await db()
    .select({ id: mesajlar.id, yon: mesajlar.yon, tur: mesajlar.tur, metin: mesajlar.metin, medyaYol: mesajlar.medyaYol, durum: mesajlar.durum, tarih: mesajlar.tarih, yazan: kullanicilar.adSoyad })
    .from(mesajlar)
    .leftJoin(kullanicilar, eq(kullanicilar.id, mesajlar.kullaniciId))
    .where(eq(mesajlar.sohbetId, id))
    .orderBy(desc(mesajlar.tarih), desc(mesajlar.id))
    .limit(200);
  const musteri = await customerByPhone(me, c.s.telefon);
  // Telefonla eşleşen müşteri ilk bulunduğunda sohbete yazılır
  const link = musteri && c.s.musteriId === null ? { musteriId: musteri.id } : {};
  if (c.s.okunmamis || "musteriId" in link) await db().update(sohbetler).set({ okunmamis: 0, ...link }).where(eq(sohbetler.id, id));
  return { ...c.s, ilgilenen: c.ilgilenen, mesajlar: rows.reverse(), musteri, pencereAcik: windowOpen(c.s.sonMusteriMesaji) };
}

/** Menü rozeti: okunmamış mesajı olan açık sohbet sayısı */
export async function unreadChatCount() {
  if (!waConfig()) return 0;
  try {
    await ensureTables();
    const [r] = await db()
      .select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(sohbetler)
      .where(and(gt(sohbetler.okunmamis, 0), ne(sohbetler.durum, "kapali")));
    return r?.n ?? 0;
  } catch {
    return 0;
  }
}

/** Devral: sohbet ekibe geçer, ilgilenen bu kullanıcı olur */
export async function takeOver(me: Me, id: number) {
  await ensureTables();
  await db().update(sohbetler).set({ durum: "ekip", ilgilenenId: me.id }).where(eq(sohbetler.id, id));
}

export async function closeChat(id: number) {
  await ensureTables();
  await db().update(sohbetler).set({ durum: "kapali", okunmamis: 0 }).where(eq(sohbetler.id, id));
}

export const MAX_TEXT = 4096;

/** Panelden metin gönderir. Pencere (müşterinin son mesajından 24 saat) kapalıysa gönderilmez. */
export async function sendFromPanel(me: Me, id: number, text: string): Promise<{ ok: true } | { ok: false; hata: string }> {
  const cfg = waConfig();
  if (!cfg) return { ok: false, hata: "WhatsApp bağlantısı ayarlı değil." };
  const body = text.trim();
  if (!body) return { ok: false, hata: "Mesaj boş." };
  if (body.length > MAX_TEXT) return { ok: false, hata: `Mesaj en çok ${MAX_TEXT} karakter olabilir.` };
  await ensureTables();
  const [c] = await db().select({ telefon: sohbetler.telefon, son: sohbetler.sonMusteriMesaji }).from(sohbetler).where(eq(sohbetler.id, id));
  if (!c) return { ok: false, hata: "Sohbet bulunamadı." };
  if (!windowOpen(c.son)) return { ok: false, hata: "Müşterinin son mesajından bu yana 24 saat geçti; serbest mesaj gönderilemez." };
  const r = await sendText(cfg, c.telefon, body);
  if (!r.ok) return r;
  const tarih = new Date();
  await insertMessage({ sohbetId: id, wamid: r.wamid.slice(0, 191), yon: "ekip", tur: "text", metin: body, kullaniciId: me.id, tarih });
  // Panelden yazan sohbeti devralmış sayılır (asistan fazında asistan susar)
  await db()
    .update(sohbetler)
    .set({ sonMesaj: sql`GREATEST(${sohbetler.sonMesaj}, ${tarih})`, durum: "ekip", ilgilenenId: sql`COALESCE(${sohbetler.ilgilenenId}, ${me.id})` })
    .where(eq(sohbetler.id, id));
  return { ok: true };
}
