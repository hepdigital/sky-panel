import "server-only";
import { and, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import { pdfFileName, type PdfData } from "@/lib/terminal/calc";
import { costOf } from "@/lib/terminal/cost";
import { parseState } from "@/lib/terminal/state";
import { isAdmin, randomToken, type Me } from "./auth";
import { brandCard, canUseBrand } from "./brands";
import { getCatalog, getCosts } from "./catalog";
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
  /** Müşterinin son teklifindeki kanal (yeni teklifte hazır gelir) */
  kanalId: number | null;
};

export async function searchCustomers(me: Me, q: string): Promise<CustomerHit[]> {
  if (q.trim().length < 2) return [];
  const l = likeOf(q.trim());
  const rows = await db()
    .select({
      id: musteriler.id, firma: musteriler.firma, yetkili: musteriler.yetkili, telefon: musteriler.telefon, eposta: musteriler.eposta, g: schema.iskontoGruplari,
      kanalId: sql<number | null>`(SELECT ${teklifler.kanalId} FROM ${teklifler} WHERE ${teklifler.musteriId} = ${musteriler.id} AND ${teklifler.kanalId} IS NOT NULL ORDER BY ${teklifler.id} DESC LIMIT 1)`,
    })
    .from(musteriler)
    .leftJoin(schema.iskontoGruplari, eq(schema.iskontoGruplari.id, musteriler.iskontoGrubuId))
    .where(and(ownCustomers(me), or(like(musteriler.firma, l), like(musteriler.yetkili, l), like(musteriler.telefon, l))))
    .orderBy(musteriler.firma)
    .limit(8);
  return rows.map(({ g, ...r }) => ({ ...r, kanalId: r.kanalId === null ? null : Number(r.kanalId), grup: g ? { ad: g.ad, liste: g.fiyatListesi, oran: g.oran } : null }));
}

export type SaveInput = {
  veri: PdfData;
  durum: unknown;
  musteri: { id: number | null; firma: string; yetkili: string; telefon: string; eposta: string } | null;
  /** Geçerlilik (gün): teklif linki bu süre sonunda kabul almaz */
  gun: number;
  /** Müşterinin geldiği kanal (zorunlu; aktif kanallardan) */
  kanalId: number | null;
  /** Teklifi veren marka (kullanıcının satabildiği markalardan) */
  markaId: number | null;
};

const clip = (v: string | undefined, max: number) => (v?.trim() ? v.trim().slice(0, max) : null);

/** Kullanıcıya olduğu gibi gösterilen kayıt hatası */
export class QuoteError extends Error {}

/**
 * Maliyet: sunucudaki fiyat ve maliyetlerle hesaplanır (tarayıcıdan gelen tutara güvenilmez). Satışçı, birim fiyatı
 * (iskontolar sonrası) maliyetin altına düşen teklifi kaydedemez; maliyet rakamı ona söylenmez. Yönetici uyarıyı terminalde görür.
 */
async function quoteCost(me: Me, durum: unknown, markaId: number) {
  const q = parseState(durum);
  if (!q) return { maliyet: null, eksik: true };
  const [catalog, costs] = await Promise.all([getCatalog(markaId), getCosts()]);
  const c = costOf(q, catalog, costs);
  if (c.alti.length && !isAdmin(me))
    throw new QuoteError(`Fiyat izin verilen alt sınırın altında: ${c.alti.join(", ")}. İndirimi azaltın, perakende listeye geçin ya da yöneticinize danışın.`);
  return { maliyet: c.maliyet, eksik: c.eksik };
}

/**
 * Teklifi oturumdaki satışçı adına kaydeder. Müşteri: seçilen kayıt ya da (satışçının carileri içinde) aynı adlı kayıt
 * kullanılır, yoksa yenisi açılır ve sahibi bu satışçı olur; kayıtlı müşterinin boş iletişim alanları tekliften doldurulur.
 * Numara marka ve yıl içinde sıralıdır (SKY-2026-1012, GT-2026-1001). Şirket bilgisi tarayıcıdan gelene değil,
 * veritabanındaki marka kartına göre veriye yazılır. Müşteriye gidecek link kodu baştan üretilir.
 */
export async function saveQuote(me: Me, input: SaveInput) {
  const { veri } = input;
  if (!veri?.kalemler?.length) throw new Error("Teklifte kalem yok.");
  const [kanal] = input.kanalId
    ? await db().select({ id: schema.kanallar.id }).from(schema.kanallar).where(and(eq(schema.kanallar.id, input.kanalId), eq(schema.kanallar.aktif, true)))
    : [];
  if (!kanal) throw new Error("Kanal seçin.");
  const marka = input.markaId ? await canUseBrand(me, input.markaId) : null;
  if (!marka) throw new Error("Marka seçin.");
  const cost = await quoteCost(me, input.durum, marka.id);
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
        const [r] = await tx.insert(musteriler).values({ firma, yetkili, telefon, eposta, sahipId: me.id, olusturan: me.adSoyad, markaId: marka.id }).$returningId();
        musteriId = r.id;
      }
    }

    const yil = new Date().getFullYear();
    const [{ max }] = await tx
      .select({ max: sql<number>`COALESCE(MAX(${teklifler.sira}), ${SIRA_BASLANGIC})` })
      .from(teklifler)
      .where(and(eq(teklifler.markaId, marka.id), eq(teklifler.yil, yil)))
      .for("update");
    const sira = Number(max) + 1;
    const no = `${marka.teklifOnEki}-${yil}-${String(sira).padStart(4, "0")}`;
    const musteriAdi = veri.musteri.trim() || firma;
    const stored = { ...veri, no, dosyaAdi: pdfFileName(no, musteriAdi ?? ""), firma: brandCard(marka) };
    const gun = Math.max(0, Math.min(365, Math.round(input.gun) || 0));

    const [r] = await tx
      .insert(teklifler)
      .values({
        no, yil, sira, musteriId,
        kullaniciId: me.id,
        kanalId: kanal.id,
        markaId: marka.id,
        kullanici: me.adSoyad,
        musteriAdi,
        fiyatTipi: veri.toptan ? "toptan" : "perakende",
        kalemSayisi: veri.kalemler.length,
        tutarKdvHaric: Math.round(veri.araToplam * 100) / 100,
        tutarKdvDahil: Math.round(veri.genelToplam * 100) / 100,
        maliyet: cost.maliyet,
        maliyetEksik: cost.eksik,
        veri: JSON.stringify(stored),
        durum: input.durum ? JSON.stringify(input.durum) : null,
        token: randomToken(24),
        gecerlilik: gun ? new Date(Date.now() + gun * 86_400_000) : null,
      })
      .$returningId();
    return { id: r.id, no, dosyaAdi: stored.dosyaAdi, musteriId };
  });
}

/** markaId: yalnızca o markanın teklifleri (null = hepsi) */
export async function listQuotes(me: Me, q: string, markaId: number | null = null) {
  const search: SQL | undefined = q.trim()
    ? or(like(teklifler.no, likeOf(q)), like(teklifler.musteriAdi, likeOf(q)), like(teklifler.kullanici, likeOf(q)))
    : undefined;
  return db()
    .select({
      id: teklifler.id, no: teklifler.no, olusturma: teklifler.olusturma, musteriId: teklifler.musteriId,
      musteri: teklifler.musteriAdi, kullanici: sql<string | null>`COALESCE(${kullanicilar.adSoyad}, ${teklifler.kullanici})`, kanal: schema.kanallar.ad,
      marka: schema.markalar.ad, markaRenk: schema.markalar.renk,
      fiyatTipi: teklifler.fiyatTipi, asama: teklifler.asama, ilkGorulme: teklifler.ilkGorulme,
      kalemSayisi: teklifler.kalemSayisi, haric: teklifler.tutarKdvHaric, dahil: teklifler.tutarKdvDahil,
    })
    .from(teklifler)
    .leftJoin(kullanicilar, eq(kullanicilar.id, teklifler.kullaniciId))
    .leftJoin(schema.kanallar, eq(schema.kanallar.id, teklifler.kanalId))
    .leftJoin(schema.markalar, eq(schema.markalar.id, teklifler.markaId))
    .where(and(ownQuotes(me), search, markaId ? eq(teklifler.markaId, markaId) : undefined))
    .orderBy(desc(teklifler.id))
    .limit(200);
}

/** Teklif ayrıntısı; satışçı başkasının teklifini göremez (null döner) */
export async function getQuote(me: Me, id: number) {
  const [row] = await db()
    .select({ t: teklifler, kanal: schema.kanallar.ad, marka: schema.markalar.ad })
    .from(teklifler)
    .leftJoin(schema.kanallar, eq(schema.kanallar.id, teklifler.kanalId))
    .leftJoin(schema.markalar, eq(schema.markalar.id, teklifler.markaId))
    .where(and(eq(teklifler.id, id), ownQuotes(me)));
  if (!row) return null;
  const t = { ...row.t, kanal: row.kanal, marka: row.marka };
  return { ...t, veri: JSON.parse(t.veri) as PdfData, durum: t.durum ? (JSON.parse(t.durum) as unknown) : null };
}
