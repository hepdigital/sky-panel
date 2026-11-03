import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "../db";
import { getSettings } from "./settings";
import { ARAC, ensureTables } from "./store";
import { costUsd, recordUsage, spentToday } from "./usage";

// Ekibin cevaplarından öğrenme (Faz 2.1, düzelt-öğret'in ilk adımı): devredilen sohbet kapatılınca ya da asistana bırakılınca
// müşteri sorusu ve ekibin cevabından tek bir ucuz Haiku çağrısıyla öneri çıkarılır (wa_ornekler, durum 'oneri').
// Yalnızca yöneticinin onayladıkları sistem istemine girer. Fiyat/indirim içeren öneriler işaretli gelir.

const { waOrnekler: ornekler, waMesajlar: mesajlar, waSohbetler: sohbetler } = schema;
const MODEL = "claude-haiku-5-5";

/** Sistem istemine giren onaylı örnekler (en yeni 40) */
export async function approvedExamples() {
  await ensureTables();
  const rows = await db()
    .select({ urunKodu: ornekler.urunKodu, musteriMesaji: ornekler.musteriMesaji, dogruCevap: ornekler.dogruCevap })
    .from(ornekler)
    .where(and(eq(ornekler.durum, "onayli"), eq(ornekler.aktif, true)))
    .orderBy(desc(ornekler.id))
    .limit(40);
  return rows.reverse();
}

const SCHEMA = {
  type: "object",
  properties: {
    uygun: { type: "boolean", description: "Başka müşterilere de uygulanabilir bir soru-cevap var mı" },
    musteri_sorusu: { type: "string" },
    ekip_cevabi: { type: "string" },
    fiyat_iceriyor: { type: "boolean", description: "Cevapta fiyat, indirim ya da kişiye özel tutar geçiyor mu" },
  },
  required: ["uygun", "musteri_sorusu", "ekip_cevabi", "fiyat_iceriyor"],
  additionalProperties: false,
} as const;

const SYSTEM = `Bir WhatsApp satış konuşmasından, satış asistanının ileride benzer sorularda kullanacağı bir örnek çıkarıyorsun.
Konuşmada asistanın cevaplayamayıp ekibe devrettiği bir müşteri sorusu ve ekibin ona verdiği cevap var.
- musteri_sorusu: müşterinin sorusunu genel ve kısa yaz (ör. "2x3 ölçüde yapıyor musunuz, iki tarafta kapı olabilir mi?").
- ekip_cevabi: ekibin cevabını, başka müşterilere de söylenebilecek biçimde kısa yaz.
- İsim, telefon, adres, sipariş numarası gibi kişisel bilgileri çıkar.
- Selamlaşma, kargo takibi, ödeme dekontu gibi bu müşteriye özel işlerse ya da ekip soruya cevap vermediyse uygun=false.
- Cevapta fiyat, indirim ya da kişiye özel tutar varsa fiyat_iceriyor=true.`;

const who = { gelen: "Müşteri", asistan: "Asistan", ekip: "Ekip" } as const;

/**
 * Sohbetten öneri çıkarır. Ekibin müşteriye yazdığı bir cevap yoksa ya da bu mesajlardan daha önce öneri çıkarıldıysa çağrı yapılmaz.
 * Claude anahtarı yoksa ya da günlük bütçe dolduysa çalışmaz.
 */
export async function learnFromChat(sohbetId: number) {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return;
  await ensureTables();
  const rows = await db()
    .select({ id: mesajlar.id, yon: mesajlar.yon, tur: mesajlar.tur, metin: mesajlar.metin })
    .from(mesajlar)
    .where(and(eq(mesajlar.sohbetId, sohbetId), ne(mesajlar.tur, ARAC), ne(mesajlar.tur, "maliyet")))
    .orderBy(desc(mesajlar.id))
    .limit(30);
  const konusma = rows.reverse();
  const ekip = konusma.filter((m) => m.yon === "ekip" && m.metin?.trim());
  const sonEkip = ekip.at(-1);
  if (!sonEkip || !konusma.some((m) => m.yon === "gelen" && m.id < sonEkip.id)) return;
  const [onceki] = await db().select({ id: ornekler.id }).from(ornekler).where(and(eq(ornekler.sohbetId, sohbetId), inArray(ornekler.sonMesajId, [sonEkip.id]))).limit(1);
  if (onceki) return;
  const ayar = await getSettings();
  if ((await spentToday()) >= ayar.gunluk_butce_usd) return;
  const [s] = await db().select({ urunKodu: sohbetler.urunKodu }).from(sohbetler).where(eq(sohbetler.id, sohbetId));

  const metin = konusma.map((m) => `${who[m.yon]}: ${(m.metin ?? `[${m.tur}]`).replace(/\s+/g, " ").slice(0, 600)}`).join("\n");
  try {
    const res = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2 }).messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: `<konusma>\n${metin}\n</konusma>` }],
    });
    await recordUsage({ sohbetId, model: res.model, usage: res.usage, maliyet: costUsd(res.model, MODEL, res.usage), deneme: false, ilkCagri: false });
    if (res.stop_reason !== "end_turn") return;
    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
    const o = JSON.parse(text) as { uygun: boolean; musteri_sorusu: string; ekip_cevabi: string; fiyat_iceriyor: boolean };
    if (!o.uygun || !o.musteri_sorusu.trim() || !o.ekip_cevabi.trim()) return;
    await db()
      .insert(ornekler)
      .values({
        sohbetId, urunKodu: s?.urunKodu ?? null, musteriMesaji: o.musteri_sorusu.trim().slice(0, 2000), dogruCevap: o.ekip_cevabi.trim().slice(0, 4000),
        fiyat: o.fiyat_iceriyor === true, sonMesajId: sonEkip.id, durum: "oneri",
      });
  } catch (e) {
    console.error("[wa-asistan] öğrenme", sohbetId, e instanceof Anthropic.APIError ? e.message : e);
  }
}

// ── Panel ──────────────────────────────────────────────────────────────────

export async function listExamples() {
  await ensureTables();
  return db()
    .select({ o: ornekler, onaylayan: schema.kullanicilar.adSoyad })
    .from(ornekler)
    .leftJoin(schema.kullanicilar, eq(schema.kullanicilar.id, ornekler.kullaniciId))
    .where(ne(ornekler.durum, "reddedildi"))
    .orderBy(asc(ornekler.durum), desc(ornekler.id))
    .limit(300);
}

/** Öneriyi düzenleyip onaylar ya da reddeder; onaylı örnek pasifleştirilebilir */
export async function updateExample(
  userId: number,
  id: number,
  v: { musteriMesaji?: string; dogruCevap?: string; urunKodu?: string | null; durum?: string; aktif?: boolean },
): Promise<{ ok: true } | { ok: false; hata: string }> {
  await ensureTables();
  const set: Partial<typeof ornekler.$inferInsert> = {};
  if (v.musteriMesaji !== undefined) set.musteriMesaji = String(v.musteriMesaji).trim().slice(0, 2000);
  if (v.dogruCevap !== undefined) set.dogruCevap = String(v.dogruCevap).trim().slice(0, 4000);
  if (v.urunKodu !== undefined) set.urunKodu = v.urunKodu ? String(v.urunKodu).slice(0, 60) : null;
  if (set.musteriMesaji === "" || set.dogruCevap === "") return { ok: false, hata: "Soru ve cevap boş olamaz." };
  const durum = schema.WA_ORNEK_DURUMLARI.find((d) => d === v.durum);
  if (durum) {
    set.durum = durum;
    set.aktif = durum === "onayli";
    set.kullaniciId = userId;
  }
  if (v.aktif !== undefined && !durum) set.aktif = v.aktif === true;
  if (!Object.keys(set).length) return { ok: true };
  const [r] = await db().update(ornekler).set(set).where(eq(ornekler.id, id));
  return r.affectedRows ? { ok: true } : { ok: false, hata: "Örnek bulunamadı." };
}
