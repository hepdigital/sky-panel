import "server-only";
import { eq, inArray, like, sql } from "drizzle-orm";
import { YURTICI_DEFAULT, packageKeyValid, type Paket, type Tariff } from "@/lib/cargo-tariff";
import { db, schema } from "./db";

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
