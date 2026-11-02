import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { ensureTables } from "./store";

// Asistan ayarları (şartname §4 wa_asistan_ayarlari): tek satır, veri JSON. Okunamayan alan varsayılana döner.

export const MODELLER = [
  { key: "claude-opus-5-5", label: "Claude Opus 5.5 (en iyi kalite)" },
  { key: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (daha ucuz)" },
  { key: "claude-haiku-5-5", label: "Claude Haiku 5.5 (en ucuz)" },
] as const;
export const EFORLAR = ["low", "medium", "high"] as const;
export const CALISMA_MODLARI = ["7/24", "mesai_disi", "saat_araliklari"] as const;

/** Haftanın günleri 1 (Pazartesi) … 7 (Pazar); saatler Türkiye saatiyle "SS:DD" */
export type SaatAraligi = { gunler: number[]; bas: string; bit: string };

export type WaAyarlar = {
  aktif: boolean;
  calisma_modu: (typeof CALISMA_MODLARI)[number];
  /** saat_araliklari modunda asistanın çalıştığı, mesai_disi modunda mesai sayılan aralıklar */
  saat_araliklari: SaatAraligi[];
  model: (typeof MODELLER)[number]["key"];
  effort: (typeof EFORLAR)[number];
  birlestirme_saniye: number;
  /** Ekip müşteriye bu kadar saat cevap vermezse sohbet asistana döner (null = kapalı) */
  ekipten_geri_donus_saat: number | null;
  ton_ve_kurallar: string;
  karsilama: string;
  iban_gonderebilir: boolean;
  /** Sesli mesajda: yazarak iletmesini rica et ya da ekibe devret */
  sesli_mesaj: "sor" | "devret";
  bildirim_eposta: string;
};

export const VARSAYILAN: WaAyarlar = {
  aktif: false,
  calisma_modu: "7/24",
  saat_araliklari: [{ gunler: [1, 2, 3, 4, 5], bas: "09:00", bit: "18:00" }],
  model: "claude-opus-5-5",
  effort: "medium",
  birlestirme_saniye: 8,
  ekipten_geri_donus_saat: null,
  ton_ve_kurallar: "",
  karsilama: "",
  iban_gonderebilir: false,
  sesli_mesaj: "sor",
  bildirim_eposta: "",
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const str = (v: unknown, max: number, d: string) => (typeof v === "string" ? v.slice(0, max) : d);

/** Gelen veriyi doğrular: bilinmeyen alan atılır, hatalı alan varsayılana döner */
export function normalize(raw: unknown): WaAyarlar {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ranges = Array.isArray(r.saat_araliklari)
    ? (r.saat_araliklari as SaatAraligi[])
        .filter((a) => a && HHMM.test(a.bas) && HHMM.test(a.bit) && Array.isArray(a.gunler))
        .map((a) => ({ gunler: [...new Set(a.gunler.map(Number).filter((g) => g >= 1 && g <= 7))].sort(), bas: a.bas, bit: a.bit }))
        .filter((a) => a.gunler.length)
        .slice(0, 14)
    : VARSAYILAN.saat_araliklari;
  const geri = Number(r.ekipten_geri_donus_saat);
  return {
    aktif: r.aktif === true,
    calisma_modu: CALISMA_MODLARI.find((m) => m === r.calisma_modu) ?? VARSAYILAN.calisma_modu,
    saat_araliklari: ranges,
    model: MODELLER.find((m) => m.key === r.model)?.key ?? VARSAYILAN.model,
    effort: EFORLAR.find((e) => e === r.effort) ?? VARSAYILAN.effort,
    birlestirme_saniye: Math.min(60, Math.max(0, Math.round(Number(r.birlestirme_saniye ?? VARSAYILAN.birlestirme_saniye)) || 0)),
    ekipten_geri_donus_saat: r.ekipten_geri_donus_saat === null || r.ekipten_geri_donus_saat === "" || !(geri >= 1) ? null : Math.min(23, Math.round(geri)),
    ton_ve_kurallar: str(r.ton_ve_kurallar, 8000, ""),
    karsilama: str(r.karsilama, 1000, ""),
    iban_gonderebilir: r.iban_gonderebilir === true,
    sesli_mesaj: r.sesli_mesaj === "devret" ? "devret" : "sor",
    bildirim_eposta: str(r.bildirim_eposta, 200, "").trim(),
  };
}

export async function getSettings(): Promise<WaAyarlar> {
  await ensureTables();
  const [row] = await db().select({ veri: schema.waAsistanAyarlari.veri }).from(schema.waAsistanAyarlari).where(eq(schema.waAsistanAyarlari.id, 1));
  if (!row) return VARSAYILAN;
  try {
    return normalize(JSON.parse(row.veri));
  } catch {
    return VARSAYILAN;
  }
}

export async function saveSettings(raw: unknown) {
  await ensureTables();
  const veri = JSON.stringify(normalize(raw));
  await db().insert(schema.waAsistanAyarlari).values({ id: 1, veri }).onDuplicateKeyUpdate({ set: { veri: sql`VALUES(veri)` } });
}

/** Türkiye saatiyle gün (1 = Pazartesi) ve dakika */
export function trNow(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  const gun = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) + 1;
  return { gun, dakika: Number(p.hour) * 60 + Number(p.minute) };
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** Şu an aralıklardan birinin içinde mi (bitiş başlangıçtan küçükse gece yarısını aşan aralık) */
export function inRanges(ranges: SaatAraligi[], now = new Date()) {
  const { gun, dakika } = trNow(now);
  const dun = gun === 1 ? 7 : gun - 1;
  return ranges.some((a) => {
    const b = minutes(a.bas);
    const e = minutes(a.bit);
    if (b <= e) return a.gunler.includes(gun) && dakika >= b && dakika < e;
    return (a.gunler.includes(gun) && dakika >= b) || (a.gunler.includes(dun) && dakika < e);
  });
}

/** Asistan şu an cevap verir mi: açık, Claude anahtarı tanımlı ve çalışma saati içinde */
export function assistantOn(s: WaAyarlar, now = new Date()) {
  if (!s.aktif || !process.env.ANTHROPIC_API_KEY?.trim()) return false;
  if (s.calisma_modu === "7/24") return true;
  const inside = inRanges(s.saat_araliklari, now);
  return s.calisma_modu === "saat_araliklari" ? inside : !inside;
}
