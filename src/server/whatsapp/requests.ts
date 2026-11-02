import "server-only";
import { desc, eq, inArray, sql } from "drizzle-orm";
import type { Me } from "../auth";
import { db, schema } from "../db";
import { waConfig } from "./config";
import { ensureTables } from "./store";

// Asistanın topladığı WhatsApp talepleri (wa_talepler): Talepler panosunda site talepleriyle birlikte listelenir.
// Sohbetler tüm satış ekibine açık olduğu için marka süzgeci yoktur.

const { waTalepler: talepler, waSohbetler: sohbetler, kullanicilar } = schema;

/** Pano satırının mesaj metni: toplanan bilgiler satır satır */
export function requestText(t: typeof talepler.$inferSelect) {
  return [
    t.urun && `Ürün: ${t.urun}`,
    t.adet && `Adet: ${t.adet}`,
    t.renk && `Renk: ${t.renk}`,
    t.aranmaZamani && `Aranma zamanı: ${t.aranmaZamani}`,
    t.not && `Not: ${t.not}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function listWaRequests(acik: boolean) {
  if (!waConfig()) return [];
  try {
    await ensureTables();
    return await db()
      .select({ t: talepler, sohbetAd: sohbetler.ad, ilgilenen: kullanicilar.adSoyad })
      .from(talepler)
      .innerJoin(sohbetler, eq(sohbetler.id, talepler.sohbetId))
      .leftJoin(kullanicilar, eq(kullanicilar.id, talepler.ilgilenenId))
      .where(acik ? inArray(talepler.durum, ["yeni", "arandi", "teklif"]) : undefined)
      .orderBy(desc(talepler.tarih))
      .limit(300);
  } catch {
    return [];
  }
}

/** Menü sayacına eklenen yeni WhatsApp talepleri */
export async function newWaRequestCount() {
  if (!waConfig()) return 0;
  try {
    await ensureTables();
    const [r] = await db().select({ n: sql<number>`COUNT(*)`.mapWith(Number) }).from(talepler).where(eq(talepler.durum, "yeni"));
    return r?.n ?? 0;
  } catch {
    return 0;
  }
}

/** Durum / not güncelleme; durumu değiştiren kişi ilgilenen olur (site talepleriyle aynı kural) */
export async function updateWaRequest(me: Me, id: number, change: { durum?: string; not?: string }) {
  await ensureTables();
  const set: Partial<typeof talepler.$inferInsert> = {};
  const durum = schema.TALEP_DURUMLARI.find((d) => d === change.durum);
  if (durum) {
    set.durum = durum;
    set.ilgilenenId = me.id;
  }
  if (change.not !== undefined) set.panelNot = change.not.trim().slice(0, 4000) || null;
  if (!Object.keys(set).length) return { ok: true as const };
  const [r] = await db().update(talepler).set(set).where(eq(talepler.id, id));
  return r.affectedRows ? { ok: true as const } : { ok: false as const, hata: "Talep bulunamadı." };
}
