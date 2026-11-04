import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import webpush, { type PushSubscription } from "web-push";
import { sha256, type Me } from "./auth";
import { db, schema } from "./db";

// Uygulama bildirimleri (Web Push): panel telefona/bilgisayara uygulama olarak yüklenir, olaylar bildirim olarak düşer.
// Gönderim kendi sunucumuzdan VAPID anahtarlarıyla yapılır (ücretli servis yok). Anahtarlar ortam değişkeninde yoksa
// ilk kullanımda üretilip veritabanında saklanır; değişirse tüm cihazların yeniden abone olması gerekir.

const { bildirimAbonelikleri: subs, bildirimTercihleri: prefs, kullanicilar } = schema;

/** Bildirim türleri: ayarlarda kullanıcı tek tek kapatabilir. seller: yalnızca yönetici ve satışçıya gider */
export const BILDIRIM_TURLERI = {
  siparis: { ad: "Yeni sipariş", aciklama: "Siteden ya da pazaryerinden yeni sipariş geldiğinde", seller: true },
  odeme: { ad: "Ödeme alındı", aciklama: "Bekleyen bir siparişin ödemesi alındığında (kart, ödeme linki)", seller: true },
  talep: { ad: "Yeni talep", aciklama: "Toptan/bayilik formu, konfigüratörde yarım kalan tasarım, WhatsApp talebi", seller: true },
  whatsapp: { ad: "WhatsApp", aciklama: "Asistan sohbeti ekibe devrettiğinde ve ekipteki sohbete müşteri yazdığında", seller: true },
  kargo: { ad: "Kargo", aciklama: "Gönderi teslim edildiğinde ya da iade/ret olduğunda", seller: true },
  gorev: { ad: "Görevler", aciklama: "Size görev atandığında ve görevinize yorum yazıldığında", seller: false },
} as const;
export type BildirimTuru = keyof typeof BILDIRIM_TURLERI;
export type Tercihler = Record<BildirimTuru, boolean>;

export type Bildirim = { title: string; body: string; url: string; tag?: string };

/* ───────────── kurulum ───────────── */

let ready: Promise<unknown> | null = null;
const ensure = (): Promise<unknown> =>
  (ready ??= (async () => {
    await db().execute(
      sql.raw(`CREATE TABLE IF NOT EXISTS bildirim_abonelikleri (
        id int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
        kullanici_id int unsigned NOT NULL,
        ozet varchar(64) NOT NULL,
        endpoint text NOT NULL,
        p256dh varchar(200) NOT NULL,
        auth varchar(100) NOT NULL,
        cihaz varchar(120) NULL,
        oturum varchar(64) NULL,
        olusturma timestamp NOT NULL DEFAULT current_timestamp(),
        son_gonderim timestamp NULL,
        UNIQUE KEY bildirim_abonelikleri_ozet_unique (ozet),
        KEY ba_kullanici (kullanici_id),
        KEY ba_oturum (oturum),
        CONSTRAINT bildirim_abonelikleri_kullanici_id_kullanicilar_id_fk FOREIGN KEY (kullanici_id) REFERENCES kullanicilar (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`),
    );
    await db().execute(
      sql.raw(`CREATE TABLE IF NOT EXISTS bildirim_tercihleri (
        kullanici_id int unsigned NOT NULL PRIMARY KEY,
        veri text NOT NULL,
        CONSTRAINT bildirim_tercihleri_kullanici_id_kullanicilar_id_fk FOREIGN KEY (kullanici_id) REFERENCES kullanicilar (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`),
    );
    await db().execute(
      sql.raw(`CREATE TABLE IF NOT EXISTS bildirim_anahtari (
        id tinyint unsigned NOT NULL PRIMARY KEY,
        genel varchar(120) NOT NULL,
        ozel varchar(120) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`),
    );
  })().catch((e) => {
    ready = null;
    throw e;
  }));

let keys: Promise<{ genel: string; ozel: string }> | null = null;
/** VAPID anahtarları: ortam değişkeni, yoksa veritabanı (ilk kullanımda üretilir) */
const vapid = () =>
  (keys ??= (async () => {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { genel: process.env.VAPID_PUBLIC_KEY, ozel: process.env.VAPID_PRIVATE_KEY };
    await ensure();
    const read = async () => {
      const [rows] = (await db().execute(sql`SELECT genel, ozel FROM bildirim_anahtari WHERE id = 1`)) as unknown as [{ genel: string; ozel: string }[]];
      return rows[0] ?? null;
    };
    const found = await read();
    if (found) return found;
    const k = webpush.generateVAPIDKeys();
    // Aynı anda iki istek üretirse ilk yazılan kalır
    await db().execute(sql`INSERT IGNORE INTO bildirim_anahtari (id, genel, ozel) VALUES (1, ${k.publicKey}, ${k.privateKey})`);
    return (await read())!;
  })().catch((e) => {
    keys = null;
    throw e;
  }));

/** Tarayıcının abone olurken kullandığı genel anahtar */
export async function publicKey() {
  return (await vapid()).genel;
}

/* ───────────── abonelik ───────────── */

type SubJson = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

/** Cihaz adı: tarayıcı kimliğinden kısa bir etiket ("iPhone · Safari", "Android · Chrome", "Windows · Edge") */
function deviceName(ua: string) {
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Cihaz";
  const br = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung" : /OPR\//.test(ua) ? "Opera" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Chrome|CriOS/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "";
  return [os, br].filter(Boolean).join(" · ");
}

/**
 * Cihazı kullanıcıya bağlar. Aynı cihaz başka bir hesapla açıldıysa abonelik yeni kullanıcıya geçer.
 * eski: tarayıcı aboneliği yenilediyse önceki uç adres (silinir).
 */
export async function subscribe(me: Me, sessionToken: string | null, s: SubJson, ua: string, eski?: string | null) {
  const endpoint = String(s.endpoint ?? "");
  const p256dh = String(s.keys?.p256dh ?? "");
  const auth = String(s.keys?.auth ?? "");
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 2000 || !p256dh || p256dh.length > 200 || !auth || auth.length > 100) return false;
  await ensure();
  const v = { kullaniciId: me.id, endpoint, p256dh, auth, cihaz: deviceName(ua).slice(0, 120), oturum: sessionToken ? sha256(sessionToken) : null };
  await db().insert(subs).values({ ozet: sha256(endpoint), ...v }).onDuplicateKeyUpdate({ set: v });
  if (eski && eski !== endpoint) await db().delete(subs).where(eq(subs.ozet, sha256(eski)));
  return true;
}

export async function unsubscribe(me: Me, endpoint: string) {
  await ensure();
  await db().delete(subs).where(and(eq(subs.ozet, sha256(endpoint)), eq(subs.kullaniciId, me.id)));
}

/** Çıkışta: bu oturumdan açılmış cihaz abonelikleri silinir */
export async function dropSessionDevices(sessionToken: string) {
  try {
    await ensure();
    await db().delete(subs).where(eq(subs.oturum, sha256(sessionToken)));
  } catch (e) {
    console.error("bildirim aboneliği silinemedi", e);
  }
}

export async function listDevices(me: Me) {
  await ensure();
  return db()
    .select({ id: subs.id, cihaz: subs.cihaz, olusturma: subs.olusturma, sonGonderim: subs.sonGonderim, ozet: subs.ozet })
    .from(subs)
    .where(eq(subs.kullaniciId, me.id))
    .orderBy(subs.olusturma);
}

export async function removeDevice(me: Me, id: number) {
  await ensure();
  await db().delete(subs).where(and(eq(subs.id, id), eq(subs.kullaniciId, me.id)));
}

/* ───────────── tercihler ───────────── */

const ALL = Object.keys(BILDIRIM_TURLERI) as BildirimTuru[];
const parsePrefs = (veri: string | null | undefined): Tercihler => {
  let o: Partial<Record<string, unknown>> = {};
  try {
    o = veri ? (JSON.parse(veri) as Record<string, unknown>) : {};
  } catch {}
  return Object.fromEntries(ALL.map((t) => [t, o[t] !== false])) as Tercihler;
};

export async function getPrefs(me: Me) {
  await ensure();
  const [r] = await db().select({ veri: prefs.veri }).from(prefs).where(eq(prefs.kullaniciId, me.id));
  return parsePrefs(r?.veri);
}

export async function setPref(me: Me, tur: string, acik: boolean) {
  if (!ALL.includes(tur as BildirimTuru)) return;
  const next = { ...(await getPrefs(me)), [tur]: acik };
  const veri = JSON.stringify(next);
  await db().insert(prefs).values({ kullaniciId: me.id, veri }).onDuplicateKeyUpdate({ set: { veri } });
}

/* ───────────── alıcılar ───────────── */

/**
 * Satış bildiriminin alıcıları: yöneticiler + markası görünen satışçılar (atanmış markası olmayan satışçı hepsini görür;
 * sipariş/talep ekranlarıyla aynı kural). markaId yoksa tüm satışçılar. ekle: ayrıca gidecek kullanıcılar (siparişin sahibi).
 */
export async function sellers(markaId?: number | null, ekle: (number | null | undefined)[] = []) {
  const users = await db()
    .select({ id: kullanicilar.id, rol: kullanicilar.rol })
    .from(kullanicilar)
    .where(and(eq(kullanicilar.aktif, true), inArray(kullanicilar.rol, ["yonetici", "satis"])));
  const assigned = await db().select().from(schema.kullaniciMarkalar);
  const brandsOf = new Map<number, number[]>();
  for (const r of assigned) brandsOf.set(r.kullaniciId, [...(brandsOf.get(r.kullaniciId) ?? []), r.markaId]);
  const ids = users
    .filter((u) => u.rol === "yonetici" || !markaId || !brandsOf.get(u.id)?.length || brandsOf.get(u.id)!.includes(markaId))
    .map((u) => u.id);
  return [...new Set([...ids, ...ekle.filter((x): x is number => !!x)])];
}

/** Yalnızca yöneticiler (+ ekle) */
export async function admins(ekle: (number | null | undefined)[] = []) {
  const users = await db().select({ id: kullanicilar.id }).from(kullanicilar).where(and(eq(kullanicilar.aktif, true), eq(kullanicilar.rol, "yonetici")));
  return [...new Set([...users.map((u) => u.id), ...ekle.filter((x): x is number => !!x)])];
}

/* ───────────── gönderim ───────────── */

type Sub = typeof subs.$inferSelect;

/** Tek cihaza gönderir; süresi dolan/silinen abonelik (404/410) kaldırılır */
async function deliver(s: Sub, payload: string, ttl: number) {
  const k = await vapid();
  // Gönderen kimliği https olmalı (yerelde PUBLIC_URL http olabilir)
  const pub = (process.env.PUBLIC_URL ?? "").replace(/\/+$/, "");
  const subject = pub.startsWith("https://") ? pub : "https://panel.skygorselmarket.com";
  const sub: PushSubscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
  try {
    await webpush.sendNotification(sub, payload, { TTL: ttl, urgency: "high", vapidDetails: { subject, publicKey: k.genel, privateKey: k.ozel }, timeout: 10_000 });
    await db().update(subs).set({ sonGonderim: new Date() }).where(eq(subs.id, s.id));
    return true;
  } catch (e) {
    const code = (e as { statusCode?: number })?.statusCode;
    if (code === 404 || code === 410) await db().delete(subs).where(eq(subs.id, s.id));
    else console.error("bildirim gönderilemedi", code ?? e);
    return false;
  }
}

/**
 * Bildirimi kullanıcılara gönderir (her birinin tüm cihazlarına). Türü kapatmış, rolü uygun olmayan ya da pasif
 * kullanıcılar atlanır; haric: işlemi yapan kişi (kendi yaptığı için bildirim almaz).
 * Hata fırlatmaz: bildirim gitmese de asıl işlem etkilenmez.
 */
export async function notify(tur: BildirimTuru, kime: number[] | Promise<number[]>, b: Bildirim, haric?: number | null) {
  try {
    const ids = (await kime).filter((id) => id !== haric);
    if (!ids.length) return 0;
    await ensure();
    const rows = await db()
      .select({ s: subs, rol: kullanicilar.rol, veri: prefs.veri })
      .from(subs)
      .innerJoin(kullanicilar, eq(kullanicilar.id, subs.kullaniciId))
      .leftJoin(prefs, eq(prefs.kullaniciId, subs.kullaniciId))
      .where(and(inArray(subs.kullaniciId, ids), eq(kullanicilar.aktif, true)));
    const targets = rows.filter((r) => (!BILDIRIM_TURLERI[tur].seller || r.rol !== "personel") && parsePrefs(r.veri)[tur]);
    if (!targets.length) return 0;
    const payload = JSON.stringify({ title: b.title.slice(0, 120), body: b.body.slice(0, 400), url: b.url, tag: b.tag });
    const ok = await Promise.all(targets.map(({ s }) => deliver(s, payload, 24 * 3600)));
    return ok.filter(Boolean).length;
  } catch (e) {
    console.error("bildirim", e);
    return 0;
  }
}

/** Deneme bildirimi: kullanıcının kendi cihazlarına (tercihlerden bağımsız) */
export async function sendTest(me: Me) {
  await ensure();
  const list = await db().select().from(subs).where(eq(subs.kullaniciId, me.id));
  if (!list.length) return 0;
  const payload = JSON.stringify({ title: "Bildirimler açık", body: `Merhaba ${me.adSoyad.split(" ")[0]}, bu cihaza bildirimler gelecek.`, url: "/panel/bildirimler", tag: "deneme" });
  const ok = await Promise.all(list.map((s) => deliver(s, payload, 600)));
  return ok.filter(Boolean).length;
}

/** Ayarlar ekranındaki türler: personele satış bildirimleri gösterilmez */
export const typesFor = (me: Me) => ALL.filter((t) => !BILDIRIM_TURLERI[t].seller || me.rol !== "personel").map((t) => ({ tur: t, ...BILDIRIM_TURLERI[t] }));
