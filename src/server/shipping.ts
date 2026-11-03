import "server-only";
import { and, desc, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { YURTICI_DEFAULT, packageKeyValid, type Paket, type Tariff } from "@/lib/cargo-tariff";
import { db, schema } from "./db";
import { ykShipments, ykTest, type YkCredentials } from "./yurtici";

// Kargo: anlaşmalı tarife (Sevkiyat ekranında düzenlenir) ve koli ölçüleri (modüler gazebo parçaları, teklif ürünleri).
// Tablolar ilk kullanımda oluşur (canlıda drizzle push kullanılmaz); bkz. db/kurulum.sql.

const { kargoTarifeleri: tariffs, kargoPaketleri: packages } = schema;

let ready: Promise<unknown> | null = null;
const ensure = () =>
  (ready ??= (async () => {
    await db().execute(
      sql.raw(`CREATE TABLE IF NOT EXISTS kargo_tarifeleri (
        firma varchar(20) NOT NULL PRIMARY KEY,
        veri longtext NOT NULL,
        guncelleme timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`),
    );
    await db().execute(
      sql.raw(`CREATE TABLE IF NOT EXISTS kargo_paketleri (
        anahtar varchar(120) NOT NULL PRIMARY KEY,
        en decimal(8,1) NULL,
        boy decimal(8,1) NULL,
        yukseklik decimal(8,1) NULL,
        kg decimal(8,2) NULL,
        adet smallint unsigned NOT NULL DEFAULT 1,
        guncelleme timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`),
    );
    await db().execute(
      sql.raw(`CREATE TABLE IF NOT EXISTS kargo_gonderileri (
        id int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
        firma varchar(20) NOT NULL,
        belge_id varchar(40) NOT NULL,
        belge_no varchar(40) NULL,
        tarih date NOT NULL,
        yon varchar(10) NOT NULL,
        gonderici varchar(200) NULL,
        alici varchar(200) NULL,
        alici_adres varchar(500) NULL,
        koli smallint unsigned NOT NULL DEFAULT 1,
        desi decimal(8,2) NOT NULL DEFAULT 0,
        kg decimal(8,2) NOT NULL DEFAULT 0,
        ucret decimal(12,2) NOT NULL DEFAULT 0,
        kdv decimal(12,2) NOT NULL DEFAULT 0,
        toplam decimal(12,2) NOT NULL DEFAULT 0,
        durum_kodu varchar(10) NULL,
        durum varchar(80) NULL,
        red tinyint(1) NOT NULL DEFAULT 0,
        takip_url varchar(255) NULL,
        tahmini_teslim date NULL,
        siparis_id int unsigned NULL,
        eslesme varchar(10) NULL,
        guncelleme timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
        UNIQUE KEY kg_firma_belge (firma, belge_id),
        KEY kg_tarih (tarih),
        KEY kg_siparis (siparis_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`),
    );
  })().catch((e) => {
    ready = null;
    throw e;
  }));

/* ───────────── tarife ───────────── */

export async function getTariff(firma = "yurtici"): Promise<Tariff> {
  await ensure();
  const [r] = await db().select({ veri: tariffs.veri }).from(tariffs).where(eq(tariffs.firma, firma));
  return r ? { ...YURTICI_DEFAULT, ...(JSON.parse(r.veri) as Partial<Tariff>) } : YURTICI_DEFAULT;
}

const pos = (v: unknown, max: number) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.min(max, Math.round(Number(v) * 100) / 100) : null);

export async function saveTariff(t: Tariff, firma = "yurtici"): Promise<{ ok: true } | { ok: false; hata: string }> {
  await ensure();
  const kademeler = (t.kademeler ?? [])
    .map((k) => ({ ust: pos(k.ust, 10000), ucret: pos(k.ucret, 1_000_000) }))
    .filter((k): k is { ust: number; ucret: number } => k.ust !== null && k.ucret !== null)
    .sort((a, b) => a.ust - b.ust);
  if (!kademeler.length) return { ok: false, hata: "En az bir kademe gerekli." };
  if (new Set(kademeler.map((k) => k.ust)).size !== kademeler.length) return { ok: false, hata: "Aynı üst desi iki kez yazılmış." };
  const v: Tariff = { kademeler, ustuDesi: pos(t.ustuDesi, 100000) ?? 0, ekYuzde: pos(t.ekYuzde, 100) ?? 0, kdv: pos(t.kdv, 100) ?? 20 };
  const veri = JSON.stringify(v);
  await db().insert(tariffs).values({ firma, veri }).onDuplicateKeyUpdate({ set: { veri } });
  return { ok: true };
}

/* ───────────── koli ölçüleri ───────────── */

const toPaket = (r: typeof packages.$inferSelect): Paket => ({ en: r.en, boy: r.boy, yukseklik: r.yukseklik, kg: r.kg, adet: r.adet });

/** Ölçüler: anahtar → koli; prefix verilirse yalnızca o tür (ör. "u|") */
export async function getPackages(prefix?: string): Promise<Record<string, Paket>> {
  await ensure();
  const rows = await db().select().from(packages).where(prefix ? like(packages.anahtar, `${prefix}%`) : undefined);
  return Object.fromEntries(rows.map((r) => [r.anahtar, toPaket(r)]));
}

/** Teklif ürünlerinin kolileri, ürün kimliğine göre */
export async function productPackages(ids: number[]): Promise<Record<number, Paket>> {
  if (!ids.length) return {};
  await ensure();
  const rows = await db().select().from(packages).where(inArray(packages.anahtar, ids.map((id) => `u|${id}`)));
  return Object.fromEntries(rows.map((r) => [Number(r.anahtar.slice(2)), toPaket(r)]));
}

const dim = (v: unknown) => pos(v, 10000) || null;

/** Ölçüleri yazar: değerlerin hepsi boşsa (ya da null) kayıt silinir. Geçersiz anahtarlar yok sayılır */
export async function savePackages(list: Record<string, Paket | null>) {
  await ensure();
  for (const [anahtar, p] of Object.entries(list)) {
    if (!packageKeyValid(anahtar)) continue;
    const v = p ? { en: dim(p.en), boy: dim(p.boy), yukseklik: dim(p.yukseklik), kg: dim(p.kg), adet: Math.max(1, Math.min(99, Math.round(Number(p.adet) || 1))) } : null;
    if (!v || (v.en === null && v.boy === null && v.yukseklik === null && v.kg === null)) {
      await db().delete(packages).where(eq(packages.anahtar, anahtar));
      continue;
    }
    await db().insert(packages).values({ anahtar, ...v }).onDuplicateKeyUpdate({ set: v });
  }
}

/* ───────────── Yurtiçi bağlantısı ve gönderiler (salt okuma) ───────────── */

const { kargoGonderileri: shipments, siparisler } = schema;
const API_KEY = "yurtici-api";
const SYNC_KEY = "yurtici-esitleme";

async function readRow<T>(firma: string): Promise<T | null> {
  await ensure();
  const [r] = await db().select({ veri: tariffs.veri }).from(tariffs).where(eq(tariffs.firma, firma));
  return r ? (JSON.parse(r.veri) as T) : null;
}
const writeRow = (firma: string, v: unknown) => {
  const veri = JSON.stringify(v);
  return db().insert(tariffs).values({ firma, veri }).onDuplicateKeyUpdate({ set: { veri } });
};

/** Bağlantı özeti (şifre dönmez) */
export async function yurticiStatus() {
  const [api, st] = await Promise.all([readRow<YkCredentials>(API_KEY), readRow<{ son: string | null; hata?: string | null }>(SYNC_KEY)]);
  return { bagli: !!api, kullanici: api?.kullanici ?? null, musteriNo: api?.musteriNo ?? null, son: st?.son ?? null, hata: st?.hata ?? null };
}

/** Kullanıcı ve şifre test edilip kaydedilir; şifre boşsa kayıtlı şifre kullanılır */
export async function saveYurtici(kullanici: string, sifre: string): Promise<{ ok: true } | { ok: false; hata: string }> {
  const old = await readRow<YkCredentials>(API_KEY);
  const c = { kullanici: kullanici.trim(), sifre: sifre.trim() || old?.sifre || "", musteriNo: "" };
  if (!c.kullanici || !c.sifre) return { ok: false, hata: "Web servis kullanıcı adı ve şifresi gerekli." };
  try {
    c.musteriNo = (await ykTest(c)).musteriNo;
  } catch (e) {
    return { ok: false, hata: e instanceof Error ? e.message : "Yurtiçi bağlantısı kurulamadı." };
  }
  if (!c.musteriNo || c.musteriNo === "0") return { ok: false, hata: "Yurtiçi müşteri numarası alınamadı." };
  await writeRow(API_KEY, c);
  return { ok: true };
}

const DAY = 24 * 3600_000;
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10).replaceAll("-", "");

/**
 * Gönderileri çeker: ilk seferde son 180 gün, sonra son 45 gün (durumlar ve geç kesilen ücretler güncellenir). 30 günlük
 * pencereler; kayıtlar belge kimliğiyle eşsiz, sipariş eşleşmesi korunur. Ardından eşleşmemiş giden gönderiler siparişlere bağlanır.
 */
export async function syncYurtici(): Promise<{ ok: true; count: number } | { ok: false; hata: string }> {
  const api = await readRow<YkCredentials>(API_KEY);
  if (!api) return { ok: false, hata: "Yurtiçi bağlantısı ayarlı değil." };
  const st = await readRow<{ son: string | null }>(SYNC_KEY);
  const now = Date.now();
  let count = 0;
  try {
    for (let end = now; end > now - (st?.son ? 45 : 180) * DAY; end -= 30 * DAY) {
      const list = await ykShipments(api, ymd(end - 30 * DAY + DAY), ymd(end));
      for (const s of list) {
        const v = {
          belgeNo: s.belgeNo.slice(0, 40) || null, tarih: s.tarih, yon: s.gondericiId === api.musteriNo ? "giden" : "gelen",
          gonderici: s.gonderici.slice(0, 200) || null, alici: s.alici.slice(0, 200) || null, aliciAdres: s.aliciAdres.slice(0, 500) || null,
          koli: s.koli, desi: s.desi, kg: s.kg, ucret: s.ucret, kdv: s.kdv, toplam: s.toplam, durumKodu: s.durumKodu.slice(0, 10) || null,
          durum: s.durum.slice(0, 80) || null, red: s.red, takipUrl: s.takipUrl?.slice(0, 255) ?? null, tahminiTeslim: s.tahminiTeslim,
        };
        await db().insert(shipments).values({ firma: "yurtici", belgeId: s.belgeId, ...v }).onDuplicateKeyUpdate({ set: v });
      }
      count += list.length;
    }
    await matchShipments();
    await writeRow(SYNC_KEY, { son: new Date(now).toISOString(), hata: null });
    return { ok: true, count };
  } catch (e) {
    const hata = e instanceof Error ? (e.name === "TimeoutError" ? "Yurtiçi zamanında yanıt vermedi." : e.message) : "Bilinmeyen hata";
    await writeRow(SYNC_KEY, { son: st?.son ?? null, hata });
    return { ok: false, hata };
  }
}

/** Son eşitleme bir saatten eskiyse eşitler (Sevkiyat ekranı açılışında arka planda) */
export async function syncYurticiIfStale() {
  const [api, st] = await Promise.all([readRow<YkCredentials>(API_KEY), readRow<{ son: string | null }>(SYNC_KEY)]);
  if (api && (!st?.son || Date.now() - new Date(st.son).getTime() > 3600_000)) await syncYurtici();
}

/** Ad karşılaştırması için kelimeler: Türkçe harfler sadeleşir, kısa kelimeler, sayılar ve unvan ekleri atılır */
const STOP = new Set(["ltd", "sti", "san", "tic", "anonim", "sirketi", "limited", "ins", "mudurlugu"]);
function words(s: string | null | undefined) {
  const t = (s ?? "").toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");
  return new Set(t.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)));
}

/**
 * Eşleşmemiş giden gönderileri siparişe bağlar: alıcı adının başındaki numara bir sipariş numarasıysa doğrudan; değilse alıcı
 * adıyla müşteri / teslimat adı arasında en az iki ortak kelime (tek kelimelik adda o kelime) ve sipariş gönderiden en çok 30 gün önce.
 */
async function matchShipments() {
  const open = await db().select().from(shipments).where(and(eq(shipments.yon, "giden"), isNull(shipments.eslesme)));
  if (!open.length) return;
  const min = open.reduce((a, s) => (s.tarih < a ? s.tarih : a), open[0].tarih);
  const cand = await db()
    .select({ id: siparisler.id, no: siparisler.no, musteri: siparisler.musteriAdi, veri: siparisler.siteVeri, t: sql<string>`COALESCE(${siparisler.disTarih}, ${siparisler.olusturma})` })
    .from(siparisler)
    .where(sql`COALESCE(${siparisler.disTarih}, ${siparisler.olusturma}) >= ${min} - INTERVAL 30 DAY`);
  const orders = cand.map((o) => {
    const teslimat = o.veri ? ((JSON.parse(o.veri) as { teslimat?: { ad?: string } | null }).teslimat?.ad ?? null) : null;
    return { id: o.id, no: o.no, w: new Set([...words(o.musteri), ...words(teslimat)]), gun: new Date(o.t).getTime() };
  });
  for (const s of open) {
    const at = new Date(s.tarih).getTime();
    const no = s.alici?.match(/^\s*(\d{4,8})\s*\//)?.[1];
    let best = no ? orders.find((o) => o.no === no) : undefined;
    if (!best) {
      const w = words(s.alici?.replace(/^\s*\d+\s*\//, ""));
      let score = 0;
      for (const o of orders) {
        const d = (at - o.gun) / DAY;
        if (d < -1 || d > 30) continue;
        const ortak = [...w].filter((x) => o.w.has(x)).length;
        if (!ortak || ortak < Math.min(2, w.size)) continue;
        const sc = ortak * 100 - d;
        if (sc > score) [score, best] = [sc, o];
      }
    }
    if (best) await db().update(shipments).set({ siparisId: best.id, eslesme: "oto" }).where(eq(shipments.id, s.id));
  }
}

/** Gönderinin sipariş bağlantısı: null → kaldırılır ve otomatik eşleşmeye bir daha girmez */
export async function linkShipment(id: number, siparisId: number | null) {
  await ensure();
  await db().update(shipments).set({ siparisId, eslesme: siparisId ? "elle" : "yok" }).where(eq(shipments.id, id));
}

/** Sevkiyat ekranı: son gönderiler, eşleşen siparişin numarasıyla */
export async function listShipments(limit = 400) {
  await ensure();
  return db()
    .select({ s: shipments, siparisNo: siparisler.no })
    .from(shipments)
    .leftJoin(siparisler, eq(siparisler.id, shipments.siparisId))
    .orderBy(desc(shipments.tarih), desc(shipments.id))
    .limit(limit);
}

/** Siparişin kargo gönderileri (sipariş detayı) */
export async function orderShipments(siparisId: number) {
  await ensure();
  return db().select().from(shipments).where(eq(shipments.siparisId, siparisId)).orderBy(desc(shipments.tarih));
}
