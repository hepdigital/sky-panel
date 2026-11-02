import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { ensureTables } from "./store";

// Asistanın Claude maliyeti: her messages.create sonrası bir satır (wa_ai_kullanim). Fiyat, yanıtı veren modele
// (res.model) göre hesaplanır: ret yedeği devreye girerse ayardaki modelden farklı olabilir.

const { waAiKullanim: kullanim } = schema;

type Fiyat = { girdi: number; cikti: number; okuma: number; yazma: number };

/** USD / milyon token. Önbellek yazma 5 dakikalık önbellek fiyatıdır. */
export const FIYATLAR: Record<string, Fiyat> = {
  "claude-haiku-5-5": { girdi: 0.1, cikti: 0.5, okuma: 0.01, yazma: 0.125 },
  "claude-sonnet-5-5": { girdi: 2, cikti: 10, okuma: 0.2, yazma: 2.5 },
  "claude-opus-5-5": { girdi: 4, cikti: 20, okuma: 0.2, yazma: 5 },
  // Ret yedeğinin cevap verebileceği modeller (önbellek: girdinin 0,1× ve 1,25×'i)
  "claude-opus-5": { girdi: 5, cikti: 25, okuma: 0.5, yazma: 6.25 },
  "claude-opus-4-8": { girdi: 5, cikti: 25, okuma: 0.5, yazma: 6.25 },
  "claude-sonnet-5": { girdi: 2, cikti: 10, okuma: 0.2, yazma: 2.5 },
};
/** Haiku 5.5: istemin toplamı 100 bin token'ı aşarsa üst fiyat */
const HAIKU_UZUN: Fiyat = { girdi: 0.5, cikti: 2.5, okuma: 0.05, yazma: 0.625 };

export type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };

/** Bilinmeyen model ayardaki modelin fiyatıyla hesaplanır. output_tokens düşünme token'larını zaten içerir. */
export function costUsd(model: string, yedek: string, u: Usage) {
  const okuma = u.cache_read_input_tokens ?? 0;
  const yazma = u.cache_creation_input_tokens ?? 0;
  const key = FIYATLAR[model] ? model : yedek;
  let f = FIYATLAR[key] ?? FIYATLAR["claude-opus-5-5"];
  if (key === "claude-haiku-5-5" && u.input_tokens + okuma + yazma > 100_000) f = HAIKU_UZUN;
  return (u.input_tokens * f.girdi + u.output_tokens * f.cikti + okuma * f.okuma + yazma * f.yazma) / 1_000_000;
}

export async function recordUsage(r: { sohbetId: number; model: string; usage: Usage; maliyet: number; deneme: boolean; ilkCagri: boolean }) {
  await db()
    .insert(kullanim)
    .values({
      sohbetId: r.sohbetId, model: r.model.slice(0, 60), inputTokens: r.usage.input_tokens, cacheCreationInputTokens: r.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: r.usage.cache_read_input_tokens ?? 0, outputTokens: r.usage.output_tokens, maliyetUsd: r.maliyet.toFixed(6), deneme: r.deneme, ilkCagri: r.ilkCagri,
    })
    .catch((e) => console.error("[wa-asistan] kullanım kaydı", e));
}

/** Türkiye saatiyle bugünün ve bu ayın başlangıcı (UTC; Türkiye UTC+3, yaz saati yok) */
export function trBounds(now = new Date()) {
  const tr = new Date(now.getTime() + 3 * 3600_000);
  const gun = new Date(Date.UTC(tr.getUTCFullYear(), tr.getUTCMonth(), tr.getUTCDate()) - 3 * 3600_000);
  const ay = new Date(Date.UTC(tr.getUTCFullYear(), tr.getUTCMonth(), 1) - 3 * 3600_000);
  return { gun, ay };
}

const usd = sql<number>`COALESCE(SUM(${kullanim.maliyetUsd}), 0)`.mapWith(Number);

/** Canlı sohbetlerin bugünkü harcaması (deneme hariç): günlük bütçe freni */
export async function spentToday() {
  await ensureTables();
  const [r] = await db().select({ usd }).from(kullanim).where(and(eq(kullanim.deneme, false), gte(kullanim.olusturma, trBounds().gun)));
  return r?.usd ?? 0;
}

/** Sohbetin bugün başlattığı asistan turu sayısı (sohbet başına günlük sınır) */
export async function turnsToday(sohbetId: number) {
  const [r] = await db()
    .select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(kullanim)
    .where(and(eq(kullanim.sohbetId, sohbetId), eq(kullanim.ilkCagri, true), gte(kullanim.olusturma, trBounds().gun)));
  return r?.n ?? 0;
}

/** Sohbetin toplam AI maliyeti ve çağrı sayısı */
export async function chatCost(sohbetId: number) {
  await ensureTables();
  const [r] = await db().select({ usd, cagri: sql<number>`COUNT(*)`.mapWith(Number) }).from(kullanim).where(eq(kullanim.sohbetId, sohbetId));
  return { usd: r?.usd ?? 0, cagri: r?.cagri ?? 0 };
}

/** Gelen kutusu özeti: bugün, bu ay ve bu ay sohbet başı ortalama (deneme hariç) */
export async function costSummary() {
  await ensureTables();
  const { gun, ay } = trBounds();
  const [r] = await db()
    .select({
      bugun: sql<number>`COALESCE(SUM(CASE WHEN ${kullanim.olusturma} >= ${gun} THEN ${kullanim.maliyetUsd} ELSE 0 END), 0)`.mapWith(Number),
      ay: usd,
      sohbet: sql<number>`COUNT(DISTINCT ${kullanim.sohbetId})`.mapWith(Number),
    })
    .from(kullanim)
    .where(and(eq(kullanim.deneme, false), gte(kullanim.olusturma, ay)));
  const sohbet = r?.sohbet ?? 0;
  return { bugun: r?.bugun ?? 0, ay: r?.ay ?? 0, ortalama: sohbet ? (r?.ay ?? 0) / sohbet : 0 };
}
