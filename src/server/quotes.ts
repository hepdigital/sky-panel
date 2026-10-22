import "server-only";
import { and, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import { pdfFileName, type PdfData } from "@/lib/terminal/calc";
import { isAdmin, randomToken, type Me } from "./auth";
import { db, schema } from "./db";

const { musteriler, teklifler, kullanicilar } = schema;

/** Kayıtlı teklifler bu sıradan sonra numaralanır (ilk teklif SKY-2026-1001; terminaldeki numaralarla aynı kural) */
const SIRA_BASLANGIC = 1000;

/** LIKE araması: kullanıcının yazdığı %, _ ve \ karakterleri joker değil, düz karakter sayılır */
const likeOf = (q: string) => `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;

/** Görünürlük: satışçı yalnızca kendi kayıtlarını görür; yönetici hepsini */
const ownQuotes = (me: Me) => (isAdmin(me) ? undefined : eq(teklifler.kullaniciId, me.id));
const ownCustomers = (me: Me) => (isAdmin(me) ? undefined : eq(musteriler.sahipId, me.id));

export type CustomerHit = {
  id: number;
  firma: string;
  yetkili: string | null;
  telefon: string | null;
  eposta: string | null;
  /** Müşterinin iskonto grubu: seçilince teklife fiyat listesi ve genel iskonto olarak uygulanır */
  grup: { ad: string; liste: "perakende" | "toptan"; oran: number } | null;
};

export async function searchCustomers(me: Me, q: string): Promise<CustomerHit[]> {
  if (q.trim().length < 2) return [];
  const l = likeOf(q.trim());
  const rows = await db()
    .select({ id: musteriler.id, firma: musteriler.firma, yetkili: musteriler.yetkili, telefon: musteriler.telefon, eposta: musteriler.eposta, g: schema.iskontoGruplari })
    .from(musteriler)
    .leftJoin(schema.iskontoGruplari, eq(schema.iskontoGruplari.id, musteriler.iskontoGrubuId))
    .where(and(ownCustomers(me), or(like(musteriler.firma, l), like(musteriler.yetkili, l), like(musteriler.telefon, l))))
    .orderBy(musteriler.firma)
    .limit(8);
  return rows.map(({ g, ...r }) => ({ ...r, grup: g ? { ad: g.ad, liste: g.fiyatListesi, oran: g.oran } : null }));
}

export type SaveInput = {
  veri: PdfData;
  durum: unknown;
  musteri: { id: number | null; firma: string; yetkili: string; telefon: string; eposta: string } | null;
  /** Geçerlilik (gün): teklif linki bu süre sonunda kabul almaz */
  gun: number;
};

const clip = (v: string | undefined, max: number) => (v?.trim() ? v.trim().slice(0, max) : null);

/**
 * Teklifi oturumdaki satışçı adına kaydeder. Müşteri: seçilen kayıt ya da (satışçının carileri içinde) aynı adlı kayıt
 * kullanılır, yoksa yenisi açılır ve sahibi bu satışçı olur; kayıtlı müşterinin boş iletişim alanları tekliften doldurulur.
 * Numara yıl içinde sıralıdır. Müşteriye gidecek link kodu baştan üretilir.
 */
export async function saveQuote(me: Me, input: SaveInput) {
  const { veri } = input;
  if (!veri?.kalemler?.length) throw new Error("Teklifte kalem yok.");
  return db().transaction(async (tx) => {
    let musteriId: number | null = null;
    const m = input.musteri;
    const firma = clip(m?.firma, 200);
    if (m && firma) {
      const [found] = m.id
        ? await tx.select({ id: musteriler.id }).from(musteriler).where(and(eq(musteriler.id, m.id), ownCustomers(me)))
        : await tx.select({ id: musteriler.id }).from(musteriler).where(and(eq(musteriler.firma, firma), ownCustomers(me))).limit(1);
      const yetkili = clip(m.yetkili, 120);
      const telefon = clip(m.telefon, 40);
      const eposta = clip(m.eposta, 160);
      if (found) {
        musteriId = found.id;
        await tx
          .update(musteriler)
          .set({
            yetkili: sql`COALESCE(NULLIF(${musteriler.yetkili}, ''), ${yetkili})`,
            telefon: sql`COALESCE(NULLIF(${musteriler.telefon}, ''), ${telefon})`,
            eposta: sql`COALESCE(NULLIF(${musteriler.eposta}, ''), ${eposta})`,
          })
          .where(eq(musteriler.id, musteriId));
      } else {
        const [r] = await tx.insert(musteriler).values({ firma, yetkili, telefon, eposta, sahipId: me.id, olusturan: me.adSoyad }).$returningId();
        musteriId = r.id;
      }
    }

    const yil = new Date().getFullYear();
    const [{ max }] = await tx
      .select({ max: sql<number>`COALESCE(MAX(${teklifler.sira}), ${SIRA_BASLANGIC})` })
      .from(teklifler)
      .where(eq(teklifler.yil, yil))
      .for("update");
    const sira = Number(max) + 1;
    const no = `SKY-${yil}-${String(sira).padStart(4, "0")}`;
    const musteriAdi = veri.musteri.trim() || firma;
    const stored = { ...veri, no, dosyaAdi: pdfFileName(no, musteriAdi ?? "") };
    const gun = Math.max(0, Math.min(365, Math.round(input.gun) || 0));

    const [r] = await tx
      .insert(teklifler)
      .values({
        no, yil, sira, musteriId,
        kullaniciId: me.id,
        kullanici: me.adSoyad,
        musteriAdi,
        fiyatTipi: veri.toptan ? "toptan" : "perakende",
        kalemSayisi: veri.kalemler.length,
        tutarKdvHaric: Math.round(veri.araToplam * 100) / 100,
        tutarKdvDahil: Math.round(veri.genelToplam * 100) / 100,
        veri: JSON.stringify(stored),
        durum: input.durum ? JSON.stringify(input.durum) : null,
        token: randomToken(24),
        gecerlilik: gun ? new Date(Date.now() + gun * 86_400_000) : null,
      })
      .$returningId();
    return { id: r.id, no, dosyaAdi: stored.dosyaAdi, musteriId };
  });
}

export async function listQuotes(me: Me, q: string) {
  const search: SQL | undefined = q.trim()
    ? or(like(teklifler.no, likeOf(q)), like(teklifler.musteriAdi, likeOf(q)), like(teklifler.kullanici, likeOf(q)))
    : undefined;
  return db()
    .select({
      id: teklifler.id, no: teklifler.no, olusturma: teklifler.olusturma, musteriId: teklifler.musteriId,
      musteri: teklifler.musteriAdi, kullanici: sql<string | null>`COALESCE(${kullanicilar.adSoyad}, ${teklifler.kullanici})`,
      fiyatTipi: teklifler.fiyatTipi, asama: teklifler.asama, ilkGorulme: teklifler.ilkGorulme,
      kalemSayisi: teklifler.kalemSayisi, haric: teklifler.tutarKdvHaric, dahil: teklifler.tutarKdvDahil,
    })
    .from(teklifler)
    .leftJoin(kullanicilar, eq(kullanicilar.id, teklifler.kullaniciId))
    .where(and(ownQuotes(me), search))
    .orderBy(desc(teklifler.id))
    .limit(200);
}

/** Teklif ayrıntısı; satışçı başkasının teklifini göremez (null döner) */
export async function getQuote(me: Me, id: number) {
  const [t] = await db().select().from(teklifler).where(and(eq(teklifler.id, id), ownQuotes(me)));
  if (!t) return null;
  return { ...t, veri: JSON.parse(t.veri) as PdfData, durum: t.durum ? (JSON.parse(t.durum) as unknown) : null };
}
