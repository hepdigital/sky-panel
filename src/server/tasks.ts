import "server-only";
import { and, asc, desc, eq, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { isAdmin, type Me } from "./auth";
import { db, schema } from "./db";

const { gorevler, gorevKayitlari, kullanicilar, musteriler, teklifler, siparisler } = schema;
export type TaskStatus = (typeof schema.GOREV_DURUMLARI)[number];
export type TaskPriority = (typeof schema.GOREV_ONCELIKLERI)[number];

const atanan = alias(kullanicilar, "atanan");
const olusturan = alias(kullanicilar, "olusturan");

/** Kişi kendisine atanan ve kendi oluşturduğu görevleri görür; yönetici hepsini */
const visible = (me: Me) => (isAdmin(me) ? undefined : or(eq(gorevler.atananId, me.id), eq(gorevler.olusturanId, me.id)));
/** Düzenleme: oluşturan, atanan ya da yönetici (görünürlükle aynı) */
const canTouch = visible;

const clip = (v: string | null | undefined, max: number) => (v?.trim() ? v.trim().slice(0, max) : null);
const dateOf = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

const listFields = {
  id: gorevler.id, baslik: gorevler.baslik, durum: gorevler.durum, oncelik: gorevler.oncelik, bitis: gorevler.bitis,
  atananId: gorevler.atananId, atanan: atanan.adSoyad, olusturanId: gorevler.olusturanId, olusturan: olusturan.adSoyad,
  musteriId: gorevler.musteriId, musteri: musteriler.firma, teklifId: gorevler.teklifId, teklifNo: teklifler.no,
  siparisId: gorevler.siparisId, siparisNo: siparisler.no, olusturma: gorevler.olusturma, tamamlanma: gorevler.tamamlanma,
  yorum: sql<number>`(SELECT COUNT(*) FROM ${gorevKayitlari} WHERE ${gorevKayitlari.gorevId} = ${gorevler.id} AND ${gorevKayitlari.tip} = 'yorum')`.mapWith(Number),
};

function baseList() {
  return db()
    .select(listFields)
    .from(gorevler)
    .leftJoin(atanan, eq(atanan.id, gorevler.atananId))
    .leftJoin(olusturan, eq(olusturan.id, gorevler.olusturanId))
    .leftJoin(musteriler, eq(musteriler.id, gorevler.musteriId))
    .leftJoin(teklifler, eq(teklifler.id, gorevler.teklifId))
    .leftJoin(siparisler, eq(siparisler.id, gorevler.siparisId));
}

export type TaskFilter = { kapsam: "bana" | "atadiklarim" | "tumu"; kisi: number | null; tamamlananlar: boolean };

export async function listTasks(me: Me, f: TaskFilter) {
  const conds: (SQL | undefined)[] = [visible(me)];
  if (f.kapsam === "bana") conds.push(eq(gorevler.atananId, me.id));
  if (f.kapsam === "atadiklarim") conds.push(and(eq(gorevler.olusturanId, me.id), or(ne(gorevler.atananId, me.id), sql`${gorevler.atananId} IS NULL`)));
  if (f.kisi) conds.push(eq(gorevler.atananId, f.kisi));
  // Tamamlananlar: son 30 gün (açıkça istenmedikçe)
  if (!f.tamamlananlar) conds.push(or(ne(gorevler.durum, "tamam"), sql`${gorevler.tamamlanma} > NOW() - INTERVAL 30 DAY`));
  return baseList()
    .where(and(...conds))
    .orderBy(sql`${gorevler.bitis} IS NULL`, asc(gorevler.bitis), sql`FIELD(${gorevler.oncelik}, 'acil', 'yuksek', 'normal', 'dusuk')`, desc(gorevler.id))
    .limit(500);
}

/** Dashboard: bana atanan açık görevler */
export async function myOpenTasks(me: Me, limit = 6) {
  return baseList()
    .where(and(eq(gorevler.atananId, me.id), ne(gorevler.durum, "tamam")))
    .orderBy(sql`${gorevler.bitis} IS NULL`, asc(gorevler.bitis), sql`FIELD(${gorevler.oncelik}, 'acil', 'yuksek', 'normal', 'dusuk')`, desc(gorevler.id))
    .limit(limit);
}

/** Menüdeki sayaç: bana atanan açık görev sayısı */
export async function openTaskCount(me: Me) {
  const [r] = await db()
    .select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(gorevler)
    .where(and(eq(gorevler.atananId, me.id), ne(gorevler.durum, "tamam")));
  return r?.n ?? 0;
}

export async function getTask(me: Me, id: number) {
  const [t] = await baseList().where(and(eq(gorevler.id, id), visible(me)));
  if (!t) return null;
  const [{ aciklama }] = await db().select({ aciklama: gorevler.aciklama }).from(gorevler).where(eq(gorevler.id, id));
  const kayitlar = await db()
    .select({ id: gorevKayitlari.id, tip: gorevKayitlari.tip, metin: gorevKayitlari.metin, olusturma: gorevKayitlari.olusturma, kisi: kullanicilar.adSoyad, kisiId: gorevKayitlari.kullaniciId })
    .from(gorevKayitlari)
    .leftJoin(kullanicilar, eq(kullanicilar.id, gorevKayitlari.kullaniciId))
    .where(eq(gorevKayitlari.gorevId, id))
    .orderBy(asc(gorevKayitlari.id));
  return { ...t, aciklama, kayitlar };
}

/** Görev atanabilecek aktif kullanıcılar */
export async function assignees() {
  return db()
    .select({ id: kullanicilar.id, adSoyad: kullanicilar.adSoyad, rol: kullanicilar.rol })
    .from(kullanicilar)
    .where(eq(kullanicilar.aktif, true))
    .orderBy(asc(kullanicilar.adSoyad));
}

export type TaskInput = {
  id: number | null;
  baslik: string;
  aciklama: string;
  atananId: number | null;
  oncelik: string;
  bitis: string | null;
  musteriId?: number | null;
  teklifId?: number | null;
  siparisId?: number | null;
};

const DURUM_AD: Record<TaskStatus, string> = { yapilacak: "Yapılacak", devam: "Devam ediyor", bekliyor: "Beklemede", tamam: "Tamamlandı" };
const prio = (v: string): TaskPriority => (schema.GOREV_ONCELIKLERI.find((x) => x === v) ?? "normal");

async function log(gorevId: number, me: Me, metin: string, tip: "yorum" | "olay" = "olay") {
  await db().insert(gorevKayitlari).values({ gorevId, kullaniciId: me.id, tip, metin });
}

async function nameOf(id: number | null) {
  if (!id) return "kimse";
  const [u] = await db().select({ ad: kullanicilar.adSoyad }).from(kullanicilar).where(eq(kullanicilar.id, id));
  return u?.ad ?? "kimse";
}

/** Yeni görev ya da düzenleme; atanan değişirse akışa yazılır */
export async function saveTask(me: Me, t: TaskInput): Promise<{ ok: true; id: number } | { ok: false; hata: string }> {
  const baslik = clip(t.baslik, 200);
  if (!baslik) return { ok: false, hata: "Görev başlığı gerekli." };
  let atananId = t.atananId || null;
  if (atananId) {
    const [u] = await db().select({ id: kullanicilar.id }).from(kullanicilar).where(and(eq(kullanicilar.id, atananId), eq(kullanicilar.aktif, true)));
    if (!u) atananId = null;
  }
  const values = { baslik, aciklama: clip(t.aciklama, 10000), atananId, oncelik: prio(t.oncelik), bitis: dateOf(t.bitis) };
  if (t.id) {
    const [old] = await db().select({ atananId: gorevler.atananId }).from(gorevler).where(and(eq(gorevler.id, t.id), canTouch(me)));
    if (!old) return { ok: false, hata: "Görev bulunamadı." };
    await db().update(gorevler).set(values).where(eq(gorevler.id, t.id));
    if (old.atananId !== atananId) await log(t.id, me, `Görevi ${await nameOf(atananId)} kişisine atadı`);
    return { ok: true, id: t.id };
  }
  const [r] = await db()
    .insert(gorevler)
    .values({ ...values, olusturanId: me.id, musteriId: t.musteriId || null, teklifId: t.teklifId || null, siparisId: t.siparisId || null })
    .$returningId();
  await log(r.id, me, atananId && atananId !== me.id ? `Görevi oluşturdu ve ${await nameOf(atananId)} kişisine atadı` : "Görevi oluşturdu");
  return { ok: true, id: r.id };
}

export async function setTaskStatus(me: Me, id: number, durum: TaskStatus) {
  const [old] = await db().select({ durum: gorevler.durum }).from(gorevler).where(and(eq(gorevler.id, id), canTouch(me)));
  if (!old) return false;
  if (old.durum === durum) return true;
  await db()
    .update(gorevler)
    .set({ durum, tamamlanma: durum === "tamam" ? new Date() : null })
    .where(eq(gorevler.id, id));
  await log(id, me, `Durumu “${DURUM_AD[durum]}” yaptı`);
  return true;
}

export async function addComment(me: Me, id: number, metin: string) {
  const text = clip(metin, 5000);
  if (!text) return false;
  const [t] = await db().select({ id: gorevler.id }).from(gorevler).where(and(eq(gorevler.id, id), canTouch(me)));
  if (!t) return false;
  await log(id, me, text, "yorum");
  return true;
}

/** Silme: oluşturan ya da yönetici */
export async function deleteTask(me: Me, id: number) {
  const r = await db()
    .delete(gorevler)
    .where(and(eq(gorevler.id, id), isAdmin(me) ? undefined : eq(gorevler.olusturanId, me.id)));
  return r[0].affectedRows > 0;
}

/** Bağlantı başlığı (görev oluştururken "ilgili kayıt" gösterimi) */
export async function relatedLabel(me: Me, rel: { musteriId?: number | null; teklifId?: number | null; siparisId?: number | null }) {
  if (rel.teklifId) {
    const [t] = await db().select({ no: teklifler.no, m: teklifler.musteriAdi }).from(teklifler).where(and(eq(teklifler.id, rel.teklifId), isAdmin(me) ? undefined : eq(teklifler.kullaniciId, me.id)));
    return t ? `Teklif ${t.no}${t.m ? ` · ${t.m}` : ""}` : null;
  }
  if (rel.siparisId) {
    const [s] = await db().select({ no: siparisler.no, m: siparisler.musteriAdi }).from(siparisler).where(and(eq(siparisler.id, rel.siparisId), isAdmin(me) ? undefined : eq(siparisler.kullaniciId, me.id)));
    return s ? `Sipariş ${s.no}${s.m ? ` · ${s.m}` : ""}` : null;
  }
  if (rel.musteriId) {
    const [m] = await db().select({ firma: musteriler.firma }).from(musteriler).where(and(eq(musteriler.id, rel.musteriId), isAdmin(me) ? undefined : eq(musteriler.sahipId, me.id)));
    return m ? `Müşteri · ${m.firma}` : null;
  }
  return null;
}

