import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "./db";

const { kanallar, teklifler } = schema;

export type Channel = { id: number; ad: string; aktif: boolean; teklif: number };

/** Kanallar sırasıyla; teklif: o kanaldan verilen teklif sayısı */
export async function listChannels(): Promise<Channel[]> {
  return db()
    .select({
      id: kanallar.id, ad: kanallar.ad, aktif: kanallar.aktif,
      teklif: sql<number>`(SELECT COUNT(*) FROM ${teklifler} WHERE ${teklifler.kanalId} = ${kanallar.id})`.mapWith(Number),
    })
    .from(kanallar)
    .orderBy(asc(kanallar.sira), asc(kanallar.id));
}

/** Teklif ekranının listesi: yalnızca aktif kanallar */
export async function activeChannels() {
  return db().select({ id: kanallar.id, ad: kanallar.ad }).from(kanallar).where(eq(kanallar.aktif, true)).orderBy(asc(kanallar.sira), asc(kanallar.id));
}

/** Ekle ya da düzenle (yalnızca yönetici; çağıran kontrol eder). Kanal silinmez, kapatılır: eski teklifler adını korur. */
export async function saveChannel(c: { id: number | null; ad: string; aktif: boolean }): Promise<{ ok: true } | { ok: false; hata: string }> {
  const ad = c.ad.trim().slice(0, 80);
  if (!ad) return { ok: false, hata: "Kanal adı gerekli." };
  try {
    if (c.id) await db().update(kanallar).set({ ad, aktif: !!c.aktif }).where(eq(kanallar.id, c.id));
    else {
      const [{ max }] = await db().select({ max: sql<number>`COALESCE(MAX(${kanallar.sira}), 0)` }).from(kanallar);
      await db().insert(kanallar).values({ ad, sira: Number(max) + 10 });
    }
  } catch {
    return { ok: false, hata: "Bu adla bir kanal zaten var." };
  }
  return { ok: true };
}
