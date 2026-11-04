import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { isAdmin, type Me } from "./auth";
import { db, schema } from "./db";
import { removeTaskFile, saveTaskFile } from "./files";
import { notify } from "./push";

const { gorevler, gorevKayitlari, gorevAtananlar, gorevDosyalari, gorevTekrarlari, kullanicilar, musteriler, teklifler, siparisler } = schema;
export type TaskStatus = (typeof schema.GOREV_DURUMLARI)[number];
export type TaskPriority = (typeof schema.GOREV_ONCELIKLERI)[number];
export type TaskMode = (typeof schema.GOREV_TAMAMLAMA)[number];

const olusturan = alias(kullanicilar, "olusturan");

/* ───────────── kurulum ───────────── */

// Görev tabloları ilk kullanımda kurulur (canlıda drizzle push yok). Eski tek atanan (atanan_id) bir kez gorev_atananlar'a taşınır.
let ready: Promise<unknown> | null = null;
export const ensureTaskSchema = (): Promise<unknown> =>
  (ready ??= (async () => {
    const [cols] = (await db().execute(
      sql`SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gorevler'`,
    )) as unknown as [{ c: string }[]];
    const have = new Set(cols.map((r) => r.c));
    await db().execute(
      sql.raw(`CREATE TABLE IF NOT EXISTS gorev_tekrarlari (
        id int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
        baslik varchar(200) NOT NULL,
        aciklama text NULL,
        oncelik enum('dusuk','normal','yuksek','acil') NOT NULL DEFAULT 'normal',
        tamamlama enum('ortak','kisi') NOT NULL DEFAULT 'ortak',
        atananlar varchar(500) NOT NULL DEFAULT '[]',
        olusturan_id int unsigned NULL,
        siklik enum('hafta','ay') NOT NULL DEFAULT 'hafta',
        gunler varchar(120) NOT NULL DEFAULT '[]',
        aktif tinyint(1) NOT NULL DEFAULT 1,
        son_uretim date NULL,
        olusturma timestamp NOT NULL DEFAULT current_timestamp(),
        CONSTRAINT gorev_tekrarlari_olusturan_id_kullanicilar_id_fk FOREIGN KEY (olusturan_id) REFERENCES kullanicilar (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`),
    );
    await db().execute(
      sql.raw(`CREATE TABLE IF NOT EXISTS gorev_atananlar (
        gorev_id int unsigned NOT NULL,
        kullanici_id int unsigned NOT NULL,
        tamamlanma timestamp NULL,
        PRIMARY KEY (gorev_id, kullanici_id),
        KEY ga_kullanici (kullanici_id),
        CONSTRAINT gorev_atananlar_gorev_id_gorevler_id_fk FOREIGN KEY (gorev_id) REFERENCES gorevler (id) ON DELETE CASCADE,
        CONSTRAINT gorev_atananlar_kullanici_id_kullanicilar_id_fk FOREIGN KEY (kullanici_id) REFERENCES kullanicilar (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`),
    );
    await db().execute(
      sql.raw(`CREATE TABLE IF NOT EXISTS gorev_dosyalari (
        id int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
        gorev_id int unsigned NOT NULL,
        kayit_id int unsigned NULL,
        kullanici_id int unsigned NULL,
        ad varchar(200) NOT NULL,
        dosya varchar(80) NOT NULL,
        tur varchar(100) NOT NULL,
        boyut int unsigned NOT NULL,
        olusturma timestamp NOT NULL DEFAULT current_timestamp(),
        KEY gd_gorev (gorev_id),
        KEY gd_kayit (kayit_id),
        CONSTRAINT gorev_dosyalari_gorev_id_gorevler_id_fk FOREIGN KEY (gorev_id) REFERENCES gorevler (id) ON DELETE CASCADE,
        CONSTRAINT gorev_dosyalari_kayit_id_gorev_kayitlari_id_fk FOREIGN KEY (kayit_id) REFERENCES gorev_kayitlari (id) ON DELETE CASCADE,
        CONSTRAINT gorev_dosyalari_kullanici_id_kullanicilar_id_fk FOREIGN KEY (kullanici_id) REFERENCES kullanicilar (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`),
    );
    if (!have.has("tamamlama")) {
      await db().execute(sql.raw("ALTER TABLE gorevler ADD COLUMN tamamlama enum('ortak','kisi') NOT NULL DEFAULT 'ortak' AFTER durum"));
      // Eski görevlerin tek atananı yeni tabloya (yalnızca bu ilk kurulumda)
      await db().execute(
        sql.raw("INSERT IGNORE INTO gorev_atananlar (gorev_id, kullanici_id, tamamlanma) SELECT id, atanan_id, IF(durum = 'tamam', tamamlanma, NULL) FROM gorevler WHERE atanan_id IS NOT NULL"),
      );
    }
    if (!have.has("tekrar_id")) {
      await db().execute(sql.raw("ALTER TABLE gorevler ADD COLUMN tekrar_id int unsigned NULL AFTER tamamlama"));
      await db().execute(sql.raw("ALTER TABLE gorevler ADD CONSTRAINT gorevler_tekrar_id_gorev_tekrarlari_id_fk FOREIGN KEY (tekrar_id) REFERENCES gorev_tekrarlari (id) ON DELETE SET NULL"));
      await db().execute(sql.raw("ALTER TABLE gorevler ADD UNIQUE KEY gorev_tekrar_gun (tekrar_id, bitis)"));
    }
    if (!have.has("hatirlatma")) await db().execute(sql.raw("ALTER TABLE gorevler ADD COLUMN hatirlatma timestamp NULL AFTER tekrar_id"));
  })().catch((e) => {
    ready = null;
    throw e;
  }));

/* ───────────── görünürlük ───────────── */

const assignedTo = (id: number) => sql`EXISTS (SELECT 1 FROM ${gorevAtananlar} WHERE ${gorevAtananlar.gorevId} = ${gorevler.id} AND ${gorevAtananlar.kullaniciId} = ${id})`;
/** Kişi kendisine atanan ve kendi oluşturduğu görevleri görür; yönetici hepsini */
const visible = (me: Me) => (isAdmin(me) ? undefined : or(assignedTo(me.id), eq(gorevler.olusturanId, me.id)));
/** Düzenleme: oluşturan, atanan ya da yönetici (görünürlükle aynı) */
const canTouch = visible;

const clip = (v: string | null | undefined, max: number) => (v?.trim() ? v.trim().slice(0, max) : null);
const dateOf = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

const listFields = {
  id: gorevler.id, baslik: gorevler.baslik, durum: gorevler.durum, oncelik: gorevler.oncelik, bitis: gorevler.bitis, tamamlama: gorevler.tamamlama,
  tekrarId: gorevler.tekrarId, olusturanId: gorevler.olusturanId, olusturan: olusturan.adSoyad,
  musteriId: gorevler.musteriId, musteri: musteriler.firma, teklifId: gorevler.teklifId, teklifNo: teklifler.no,
  siparisId: gorevler.siparisId, siparisNo: siparisler.no, olusturma: gorevler.olusturma, tamamlanma: gorevler.tamamlanma,
  yorum: sql<number>`(SELECT COUNT(*) FROM ${gorevKayitlari} WHERE ${gorevKayitlari.gorevId} = ${gorevler.id} AND ${gorevKayitlari.tip} = 'yorum')`.mapWith(Number),
  dosya: sql<number>`(SELECT COUNT(*) FROM ${gorevDosyalari} WHERE ${gorevDosyalari.gorevId} = ${gorevler.id})`.mapWith(Number),
};

function baseList() {
  return db()
    .select(listFields)
    .from(gorevler)
    .leftJoin(olusturan, eq(olusturan.id, gorevler.olusturanId))
    .leftJoin(musteriler, eq(musteriler.id, gorevler.musteriId))
    .leftJoin(teklifler, eq(teklifler.id, gorevler.teklifId))
    .leftJoin(siparisler, eq(siparisler.id, gorevler.siparisId));
}

export type Assignee = { id: number; ad: string; tamam: boolean };

/** Listelenen görevlerin atananları (tek sorgu) */
async function withAssignees<T extends { id: number }>(rows: T[]) {
  if (!rows.length) return rows.map((r) => ({ ...r, atananlar: [] as Assignee[] }));
  const list = await db()
    .select({ gorevId: gorevAtananlar.gorevId, id: kullanicilar.id, ad: kullanicilar.adSoyad, tamamlanma: gorevAtananlar.tamamlanma })
    .from(gorevAtananlar)
    .innerJoin(kullanicilar, eq(kullanicilar.id, gorevAtananlar.kullaniciId))
    .where(inArray(gorevAtananlar.gorevId, rows.map((r) => r.id)))
    .orderBy(asc(kullanicilar.adSoyad));
  return rows.map((r) => ({ ...r, atananlar: list.filter((a) => a.gorevId === r.id).map((a) => ({ id: a.id, ad: a.ad, tamam: !!a.tamamlanma })) }));
}

const ORDER = [sql`${gorevler.bitis} IS NULL`, asc(gorevler.bitis), sql`FIELD(${gorevler.oncelik}, 'acil', 'yuksek', 'normal', 'dusuk')`, desc(gorevler.id)];

export type TaskFilter = { kapsam: "bana" | "atadiklarim" | "tumu"; kisi: number | null; tamamlananlar: boolean };

export async function listTasks(me: Me, f: TaskFilter) {
  await ensureTaskSchema();
  const conds: (SQL | undefined)[] = [visible(me)];
  if (f.kapsam === "bana") conds.push(assignedTo(me.id));
  if (f.kapsam === "atadiklarim")
    conds.push(and(eq(gorevler.olusturanId, me.id), sql`EXISTS (SELECT 1 FROM ${gorevAtananlar} WHERE ${gorevAtananlar.gorevId} = ${gorevler.id} AND ${gorevAtananlar.kullaniciId} <> ${me.id})`));
  if (f.kisi) conds.push(assignedTo(f.kisi));
  // Tamamlananlar: son 30 gün (açıkça istenmedikçe)
  if (!f.tamamlananlar) conds.push(or(ne(gorevler.durum, "tamam"), sql`${gorevler.tamamlanma} > NOW() - INTERVAL 30 DAY`));
  return withAssignees(await baseList().where(and(...conds)).orderBy(...ORDER).limit(500));
}

/** Bana atanan ve benim payım bitmemiş açık görevler */
const myOpen = (me: Me) =>
  and(
    ne(gorevler.durum, "tamam"),
    sql`EXISTS (SELECT 1 FROM ${gorevAtananlar} WHERE ${gorevAtananlar.gorevId} = ${gorevler.id} AND ${gorevAtananlar.kullaniciId} = ${me.id} AND ${gorevAtananlar.tamamlanma} IS NULL)`,
  );

/** Dashboard: bana atanan açık görevler */
export async function myOpenTasks(me: Me, limit = 6) {
  await ensureTaskSchema();
  return withAssignees(await baseList().where(myOpen(me)).orderBy(...ORDER).limit(limit));
}

/** Menüdeki sayaç: bana atanan açık görev sayısı */
export async function openTaskCount(me: Me) {
  await ensureTaskSchema();
  const [r] = await db()
    .select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(gorevler)
    .where(myOpen(me));
  return r?.n ?? 0;
}

export type TaskFile = { id: number; ad: string; tur: string; boyut: number; kayitId: number | null; kisiId: number | null };

export async function getTask(me: Me, id: number) {
  await ensureTaskSchema();
  const [row] = await baseList().where(and(eq(gorevler.id, id), visible(me)));
  if (!row) return null;
  const [t] = await withAssignees([row]);
  const [{ aciklama }] = await db().select({ aciklama: gorevler.aciklama }).from(gorevler).where(eq(gorevler.id, id));
  const kayitlar = await db()
    .select({ id: gorevKayitlari.id, tip: gorevKayitlari.tip, metin: gorevKayitlari.metin, olusturma: gorevKayitlari.olusturma, kisi: kullanicilar.adSoyad, kisiId: gorevKayitlari.kullaniciId })
    .from(gorevKayitlari)
    .leftJoin(kullanicilar, eq(kullanicilar.id, gorevKayitlari.kullaniciId))
    .where(eq(gorevKayitlari.gorevId, id))
    .orderBy(asc(gorevKayitlari.id));
  const dosyalar: TaskFile[] = await db()
    .select({ id: gorevDosyalari.id, ad: gorevDosyalari.ad, tur: gorevDosyalari.tur, boyut: gorevDosyalari.boyut, kayitId: gorevDosyalari.kayitId, kisiId: gorevDosyalari.kullaniciId })
    .from(gorevDosyalari)
    .where(eq(gorevDosyalari.gorevId, id))
    .orderBy(asc(gorevDosyalari.id));
  return { ...t, aciklama, kayitlar, dosyalar };
}

/** Görev atanabilecek aktif kullanıcılar */
export async function assignees() {
  return db()
    .select({ id: kullanicilar.id, adSoyad: kullanicilar.adSoyad, rol: kullanicilar.rol })
    .from(kullanicilar)
    .where(eq(kullanicilar.aktif, true))
    .orderBy(asc(kullanicilar.adSoyad));
}

/* ───────────── kayıt ───────────── */

export type Repeat = { siklik: "hafta" | "ay"; gunler: number[] };

export type TaskInput = {
  id: number | null;
  baslik: string;
  aciklama: string;
  atananlar: number[];
  tamamlama: string;
  oncelik: string;
  bitis: string | null;
  musteriId?: number | null;
  teklifId?: number | null;
  siparisId?: number | null;
  /** Yalnızca yeni görevde: sabit günlerde tekrarlansın */
  tekrar?: Repeat | null;
};

const DURUM_AD: Record<TaskStatus, string> = { yapilacak: "Yapılacak", devam: "Devam ediyor", bekliyor: "Beklemede", tamam: "Tamamlandı" };
const prio = (v: string): TaskPriority => schema.GOREV_ONCELIKLERI.find((x) => x === v) ?? "normal";
const modeOf = (v: string): TaskMode => (v === "kisi" ? "kisi" : "ortak");

async function log(gorevId: number, me: Me | null, metin: string, tip: "yorum" | "olay" = "olay") {
  const [r] = await db().insert(gorevKayitlari).values({ gorevId, kullaniciId: me?.id ?? null, tip, metin }).$returningId();
  return r.id;
}

/** Aktif kullanıcılardan geçerli olanlar (tekrarsız, sırası korunur) */
async function validUsers(ids: number[]) {
  const uniq = [...new Set(ids.map(Number).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 30);
  if (!uniq.length) return [];
  const rows = await db().select({ id: kullanicilar.id }).from(kullanicilar).where(and(inArray(kullanicilar.id, uniq), eq(kullanicilar.aktif, true)));
  const ok = new Set(rows.map((r) => r.id));
  return uniq.filter((x) => ok.has(x));
}

async function namesOf(ids: number[]) {
  if (!ids.length) return "kimse";
  const rows = await db().select({ id: kullanicilar.id, ad: kullanicilar.adSoyad }).from(kullanicilar).where(inArray(kullanicilar.id, ids));
  return ids.map((i) => rows.find((r) => r.id === i)?.ad ?? "?").join(", ");
}

async function assigneeIds(gorevId: number) {
  return (await db().select({ id: gorevAtananlar.kullaniciId }).from(gorevAtananlar).where(eq(gorevAtananlar.gorevId, gorevId))).map((r) => r.id);
}

/** Yeni atananlara uygulama bildirimi (kendine atadıysa gitmez) */
function notifyAssigned(me: Me | null, id: number, baslik: string, ids: number[], title?: string) {
  if (ids.length) void notify("gorev", ids, { title: title ?? `Yeni görev · ${me?.adSoyad ?? "SKY Panel"}`, body: baslik, url: `/panel/gorevler/${id}`, tag: `gorev-${id}` }, me?.id);
}

async function setAssignees(gorevId: number, ids: number[]) {
  const old = await assigneeIds(gorevId);
  const gone = old.filter((x) => !ids.includes(x));
  const added = ids.filter((x) => !old.includes(x));
  if (gone.length) await db().delete(gorevAtananlar).where(and(eq(gorevAtananlar.gorevId, gorevId), inArray(gorevAtananlar.kullaniciId, gone)));
  if (added.length) await db().insert(gorevAtananlar).values(added.map((k) => ({ gorevId, kullaniciId: k })));
  await db().update(gorevler).set({ atananId: ids[0] ?? null }).where(eq(gorevler.id, gorevId));
  return { added, changed: gone.length > 0 || added.length > 0 };
}

/** Yeni görev ya da düzenleme; atananlar değişirse akışa yazılır. Tekrarlı yeni görev: tanım kaydedilir, bugünün görevi hemen üretilir. */
export async function saveTask(me: Me, t: TaskInput): Promise<{ ok: true; id: number | null; tekrarId?: number } | { ok: false; hata: string }> {
  await ensureTaskSchema();
  const baslik = clip(t.baslik, 200);
  if (!baslik) return { ok: false, hata: "Görev başlığı gerekli." };
  const ids = await validUsers(t.atananlar ?? []);
  const tamamlama = ids.length > 1 ? modeOf(t.tamamlama) : "ortak";
  const values = { baslik, aciklama: clip(t.aciklama, 10000), oncelik: prio(t.oncelik), tamamlama };

  if (!t.id && t.tekrar) {
    const rep = repeatOf(t.tekrar);
    if (!rep) return { ok: false, hata: "Tekrar için en az bir gün seçin." };
    if (!ids.length) return { ok: false, hata: "Tekrarlayan görev için en az bir kişi seçin." };
    const [r] = await db()
      .insert(gorevTekrarlari)
      .values({ ...values, atananlar: JSON.stringify(ids), olusturanId: me.id, siklik: rep.siklik, gunler: JSON.stringify(rep.gunler), sonUretim: addDays(trToday(), -1) })
      .$returningId();
    await runTemplates(r.id);
    return { ok: true, id: null, tekrarId: r.id };
  }

  if (t.id) {
    const [old] = await db().select({ id: gorevler.id }).from(gorevler).where(and(eq(gorevler.id, t.id), canTouch(me)));
    if (!old) return { ok: false, hata: "Görev bulunamadı." };
    await db().update(gorevler).set({ ...values, bitis: dateOf(t.bitis) }).where(eq(gorevler.id, t.id));
    const { added, changed } = await setAssignees(t.id, ids);
    if (changed) await log(t.id, me, ids.length ? `Görevi ${await namesOf(ids)} kişisine atadı` : "Atananları kaldırdı");
    notifyAssigned(me, t.id, baslik, added);
    return { ok: true, id: t.id };
  }
  const [r] = await db()
    .insert(gorevler)
    .values({ ...values, bitis: dateOf(t.bitis), olusturanId: me.id, musteriId: t.musteriId || null, teklifId: t.teklifId || null, siparisId: t.siparisId || null })
    .$returningId();
  await setAssignees(r.id, ids);
  await log(r.id, me, ids.length && !(ids.length === 1 && ids[0] === me.id) ? `Görevi oluşturdu ve ${await namesOf(ids)} kişisine atadı` : "Görevi oluşturdu");
  notifyAssigned(me, r.id, baslik, ids);
  return { ok: true, id: r.id };
}

/**
 * Durum değişikliği. Kişi başı görevde atanan "tamamlandı" derse yalnızca kendi payı biter; herkes bitirince görev tamamlanır.
 * Oluşturan ya da yönetici (atanan değilse) tamamlarsa görev herkes için biter.
 */
export async function setTaskStatus(me: Me, id: number, durum: TaskStatus): Promise<{ ok: true; mesaj?: string } | null> {
  await ensureTaskSchema();
  const [t] = await db()
    .select({ durum: gorevler.durum, tamamlama: gorevler.tamamlama, olusturanId: gorevler.olusturanId, baslik: gorevler.baslik })
    .from(gorevler)
    .where(and(eq(gorevler.id, id), canTouch(me)));
  if (!t) return null;
  const list = await db().select({ id: gorevAtananlar.kullaniciId, tamamlanma: gorevAtananlar.tamamlanma }).from(gorevAtananlar).where(eq(gorevAtananlar.gorevId, id));
  const mine = list.find((a) => a.id === me.id);
  const now = new Date();
  const notifyOwner = (title: string) => {
    if (t.olusturanId && t.olusturanId !== me.id) void notify("gorev", [t.olusturanId], { title, body: t.baslik, url: `/panel/gorevler/${id}`, tag: `gorev-${id}` }, me.id);
  };

  if (t.tamamlama === "kisi" && mine && list.length > 1) {
    const mineRow = and(eq(gorevAtananlar.gorevId, id), eq(gorevAtananlar.kullaniciId, me.id));
    if (durum === "tamam") {
      if (mine.tamamlanma) return { ok: true };
      await db().update(gorevAtananlar).set({ tamamlanma: now }).where(mineRow);
      const done = list.filter((a) => a.tamamlanma || a.id === me.id).length;
      if (done === list.length) {
        await db().update(gorevler).set({ durum: "tamam", tamamlanma: now }).where(eq(gorevler.id, id));
        await log(id, me, "Kendi payını tamamladı; herkes bitirdiği için görev tamamlandı");
        notifyOwner(`Görev tamamlandı · ${me.adSoyad} son payı bitirdi`);
        return { ok: true };
      }
      if (t.durum === "yapilacak") await db().update(gorevler).set({ durum: "devam" }).where(eq(gorevler.id, id));
      await log(id, me, `Kendi payını tamamladı (${done}/${list.length})`);
      notifyOwner(`${me.adSoyad} payını bitirdi (${done}/${list.length})`);
      return { ok: true, mesaj: `Payınız tamamlandı (${done}/${list.length}). Herkes bitirince görev tamamlanır.` };
    }
    if (mine.tamamlanma) await db().update(gorevAtananlar).set({ tamamlanma: null }).where(mineRow);
    if (t.durum === durum && !mine.tamamlanma) return { ok: true };
    await db().update(gorevler).set({ durum, tamamlanma: null }).where(eq(gorevler.id, id));
    await log(id, me, mine.tamamlanma ? `Kendi payını yeniden açtı; durumu “${DURUM_AD[durum]}” yaptı` : `Durumu “${DURUM_AD[durum]}” yaptı`);
    return { ok: true };
  }

  if (t.durum === durum) return { ok: true };
  await db()
    .update(gorevler)
    .set({ durum, tamamlanma: durum === "tamam" ? now : null })
    .where(eq(gorevler.id, id));
  if (durum === "tamam") await db().update(gorevAtananlar).set({ tamamlanma: now }).where(and(eq(gorevAtananlar.gorevId, id), isNull(gorevAtananlar.tamamlanma)));
  else if (t.durum === "tamam") await db().update(gorevAtananlar).set({ tamamlanma: null }).where(eq(gorevAtananlar.gorevId, id));
  await log(id, me, `Durumu “${DURUM_AD[durum]}” yaptı`);
  if (durum === "tamam") notifyOwner(`Görev tamamlandı · ${me.adSoyad}`);
  return { ok: true };
}

/** Yorum (ekleri varsa metin boş olabilir). Bildirim görevin diğer taraflarına (atananlar ve oluşturan) gider. */
export async function addComment(me: Me, id: number, metin: string, ekVar = false): Promise<number | null> {
  await ensureTaskSchema();
  const text = clip(metin, 5000);
  if (!text && !ekVar) return null;
  const [t] = await db()
    .select({ id: gorevler.id, baslik: gorevler.baslik, olusturanId: gorevler.olusturanId })
    .from(gorevler)
    .where(and(eq(gorevler.id, id), canTouch(me)));
  if (!t) return null;
  const kayitId = await log(id, me, text ?? "", "yorum");
  const kime = [...new Set([...(await assigneeIds(id)), t.olusturanId].filter((x): x is number => !!x))];
  const body = text ? text.replace(/\s+/g, " ").slice(0, 300) : "Dosya ekledi";
  void notify("gorev", kime, { title: `${me.adSoyad} yorum yazdı · ${t.baslik}`, body, url: `/panel/gorevler/${id}`, tag: `gorev-${id}` }, me.id);
  return kayitId;
}

/** Görev ya da yorum ekleri (yorum aynı görevin olmalı) */
export async function addFiles(me: Me, gorevId: number, kayitId: number | null, files: { name: string; type: string; data: Buffer }[]) {
  await ensureTaskSchema();
  const [t] = await db().select({ id: gorevler.id }).from(gorevler).where(and(eq(gorevler.id, gorevId), canTouch(me)));
  if (!t) throw new Error("Görev bulunamadı.");
  if (kayitId) {
    const [k] = await db().select({ id: gorevKayitlari.id }).from(gorevKayitlari).where(and(eq(gorevKayitlari.id, kayitId), eq(gorevKayitlari.gorevId, gorevId)));
    if (!k) throw new Error("Yorum bulunamadı.");
  }
  for (const f of files) {
    const s = await saveTaskFile(f.name, f.type, f.data);
    const ad = (s.tur === "image/webp" && !/\.webp$/i.test(f.name) ? f.name.replace(/\.[^.]+$/, "") + ".webp" : f.name).slice(0, 200) || "dosya";
    await db().insert(gorevDosyalari).values({ gorevId, kayitId, kullaniciId: me.id, ad, ...s });
  }
  if (!kayitId) await log(gorevId, me, files.length > 1 ? `${files.length} dosya ekledi` : "Dosya ekledi");
}

/** İndirme: görevi gören herkes */
export async function fileFor(me: Me, id: number) {
  await ensureTaskSchema();
  const [f] = await db()
    .select({ ad: gorevDosyalari.ad, dosya: gorevDosyalari.dosya, tur: gorevDosyalari.tur })
    .from(gorevDosyalari)
    .innerJoin(gorevler, eq(gorevler.id, gorevDosyalari.gorevId))
    .where(and(eq(gorevDosyalari.id, id), visible(me)));
  return f ?? null;
}

/** Eki silme: ekleyen ya da yönetici */
export async function deleteFile(me: Me, id: number) {
  await ensureTaskSchema();
  const [f] = await db()
    .select({ id: gorevDosyalari.id, dosya: gorevDosyalari.dosya, gorevId: gorevDosyalari.gorevId, ad: gorevDosyalari.ad })
    .from(gorevDosyalari)
    .where(and(eq(gorevDosyalari.id, id), isAdmin(me) ? undefined : eq(gorevDosyalari.kullaniciId, me.id)));
  if (!f) return null;
  await db().delete(gorevDosyalari).where(eq(gorevDosyalari.id, id));
  await removeTaskFile(f.dosya);
  await log(f.gorevId, me, `“${f.ad}” dosyasını sildi`);
  return f.gorevId;
}

/** Silme: oluşturan ya da yönetici; ekler diskten de silinir */
export async function deleteTask(me: Me, id: number) {
  await ensureTaskSchema();
  const where = and(eq(gorevler.id, id), isAdmin(me) ? undefined : eq(gorevler.olusturanId, me.id));
  const [t] = await db().select({ id: gorevler.id }).from(gorevler).where(where);
  if (!t) return false;
  const files = await db().select({ dosya: gorevDosyalari.dosya }).from(gorevDosyalari).where(eq(gorevDosyalari.gorevId, id));
  await db().delete(gorevler).where(eq(gorevler.id, id));
  for (const f of files) await removeTaskFile(f.dosya);
  return true;
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

/* ───────────── tekrarlayan görevler ───────────── */

// Günler Türkiye saatine göre. Görev o günün sabahı (08.00'den sonra ilk turda) üretilir ve atananlara bildirilir;
// zamanlayıcı birkaç gün çalışmadıysa kaçan günler (en çok 14 gün) gecikmiş olarak üretilir.
const TZ = "Europe/Istanbul";
export const trToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const trHour = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date())) % 24;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** 1 = Pazartesi … 7 = Pazar */
const isoDay = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay() || 7;
const lastDayOfMonth = (d: string) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).getUTCDate();
export const GENERATE_HOUR = 8;
export const REMIND_HOUR = 16;

function repeatOf(r: Repeat | null | undefined): Repeat | null {
  if (!r) return null;
  const siklik = r.siklik === "ay" ? "ay" : "hafta";
  const max = siklik === "ay" ? 31 : 7;
  const gunler = [...new Set((r.gunler ?? []).map(Number).filter((x) => Number.isInteger(x) && x >= 1 && x <= max))].sort((a, b) => a - b);
  return gunler.length ? { siklik, gunler } : null;
}

const parseIds = (v: string) => {
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a.map(Number).filter((x) => Number.isInteger(x) && x > 0) : [];
  } catch {
    return [];
  }
};

/** Tanım o gün çalışıyor mu? Ayın 31'i gibi olmayan günler ayın son gününe kayar. */
function matches(rep: Repeat, d: string) {
  if (rep.siklik === "hafta") return rep.gunler.includes(isoDay(d));
  const day = Number(d.slice(8, 10));
  const last = lastDayOfMonth(d);
  return rep.gunler.includes(day) || (day === last && rep.gunler.some((g) => g > last));
}

type Template = typeof gorevTekrarlari.$inferSelect;

async function createInstance(tp: Template, d: string, today: string) {
  const ids = await validUsers(parseIds(tp.atananlar));
  if (!ids.length) return;
  let id: number;
  try {
    const [r] = await db()
      .insert(gorevler)
      .values({ baslik: tp.baslik, aciklama: tp.aciklama, oncelik: tp.oncelik, tamamlama: ids.length > 1 ? tp.tamamlama : "ortak", olusturanId: tp.olusturanId, tekrarId: tp.id, bitis: d, atananId: ids[0] })
      .$returningId();
    id = r.id;
  } catch (e) {
    // Aynı gün zaten üretilmiş (eşzamanlı tur)
    if (String((e as { cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code).includes("ER_DUP_ENTRY") || /Duplicate entry/.test(String(e))) return;
    throw e;
  }
  await db().insert(gorevAtananlar).values(ids.map((k) => ({ gorevId: id, kullaniciId: k })));
  await log(id, null, "Tekrarlayan görevden oluşturuldu");
  if (d === today) notifyAssigned(null, id, tp.baslik, ids, "Bugünün görevi");
}

/** Tanımların bekleyen günlerini üretir (tekrarId verilirse yalnızca o tanım) */
async function runTemplates(tekrarId?: number) {
  const today = trToday();
  const until = trHour() >= GENERATE_HOUR ? today : addDays(today, -1);
  const list = await db()
    .select()
    .from(gorevTekrarlari)
    .where(and(eq(gorevTekrarlari.aktif, true), tekrarId ? eq(gorevTekrarlari.id, tekrarId) : undefined));
  for (const tp of list) {
    const rep = repeatOf({ siklik: tp.siklik, gunler: parseIds(tp.gunler) });
    if (!rep) continue;
    let d = tp.sonUretim ? addDays(tp.sonUretim, 1) : until;
    if (d < addDays(until, -13)) d = addDays(until, -13);
    if (d > until) continue;
    for (; d <= until; d = addDays(d, 1)) if (matches(rep, d)) await createInstance(tp, d, today);
    await db().update(gorevTekrarlari).set({ sonUretim: until }).where(eq(gorevTekrarlari.id, tp.id));
  }
}

/** Son günü bugün olan açık görevler: öğleden sonra payı bitmemiş atananlara bir kez hatırlatılır */
async function remindDue() {
  if (trHour() < REMIND_HOUR) return;
  const due = await db()
    .select({ id: gorevler.id, baslik: gorevler.baslik })
    .from(gorevler)
    .where(and(eq(gorevler.bitis, trToday()), ne(gorevler.durum, "tamam"), isNull(gorevler.hatirlatma)));
  for (const t of due) {
    const [r] = await db().update(gorevler).set({ hatirlatma: new Date() }).where(and(eq(gorevler.id, t.id), isNull(gorevler.hatirlatma)));
    if (!r.affectedRows) continue;
    const kime = (await db().select({ id: gorevAtananlar.kullaniciId }).from(gorevAtananlar).where(and(eq(gorevAtananlar.gorevId, t.id), isNull(gorevAtananlar.tamamlanma)))).map((x) => x.id);
    if (kime.length) void notify("gorev", kime, { title: "Bugün son gün", body: t.baslik, url: `/panel/gorevler/${t.id}`, tag: `gorev-${t.id}` });
  }
}

let lastRun = 0;
/** Zamanlayıcı turu (cron ve panel açılışları): en çok 5 dakikada bir */
export async function runTaskSchedule() {
  if (Date.now() - lastRun < 5 * 60_000) return;
  lastRun = Date.now();
  await ensureTaskSchema();
  await runTemplates();
  await remindDue();
}

export type TemplateRow = {
  id: number;
  baslik: string;
  aciklama: string | null;
  oncelik: TaskPriority;
  tamamlama: TaskMode;
  atananlar: { id: number; ad: string }[];
  olusturanId: number | null;
  siklik: "hafta" | "ay";
  gunler: number[];
  aktif: boolean;
  sonraki: string | null;
};

/** Sonraki çalışma günü (bugün henüz üretilmediyse bugün) */
function nextRun(rep: Repeat, sonUretim: string | null) {
  let d = addDays(trToday(), 0);
  if (sonUretim && sonUretim >= d) d = addDays(sonUretim, 1);
  for (let i = 0; i < 62; i++, d = addDays(d, 1)) if (matches(rep, d)) return d;
  return null;
}

/** Tekrarlayan görev tanımları: oluşturan, atananlar ve yönetici görür */
export async function listTemplates(me: Me): Promise<TemplateRow[]> {
  await ensureTaskSchema();
  const rows = await db().select().from(gorevTekrarlari).orderBy(desc(gorevTekrarlari.aktif), asc(gorevTekrarlari.baslik));
  const users = await db().select({ id: kullanicilar.id, ad: kullanicilar.adSoyad }).from(kullanicilar);
  return rows
    .map((r) => {
      const ids = parseIds(r.atananlar);
      const rep = repeatOf({ siklik: r.siklik, gunler: parseIds(r.gunler) }) ?? { siklik: r.siklik, gunler: [] };
      return {
        id: r.id, baslik: r.baslik, aciklama: r.aciklama, oncelik: r.oncelik, tamamlama: r.tamamlama, olusturanId: r.olusturanId,
        atananlar: ids.map((i) => ({ id: i, ad: users.find((u) => u.id === i)?.ad ?? "?" })),
        siklik: rep.siklik, gunler: rep.gunler, aktif: r.aktif, sonraki: r.aktif && rep.gunler.length ? nextRun(rep, r.sonUretim) : null,
      };
    })
    .filter((r) => isAdmin(me) || r.olusturanId === me.id || r.atananlar.some((a) => a.id === me.id));
}

export type TemplateInput = { id: number; baslik: string; aciklama: string; atananlar: number[]; tamamlama: string; oncelik: string; tekrar: Repeat; aktif: boolean };

/** Tanımı düzenleme: oluşturan ya da yönetici. Değişiklik sonraki günlerden itibaren geçerli. */
export async function saveTemplate(me: Me, t: TemplateInput): Promise<{ ok: true } | { ok: false; hata: string }> {
  await ensureTaskSchema();
  const baslik = clip(t.baslik, 200);
  if (!baslik) return { ok: false, hata: "Görev başlığı gerekli." };
  const rep = repeatOf(t.tekrar);
  if (!rep) return { ok: false, hata: "Tekrar için en az bir gün seçin." };
  const ids = await validUsers(t.atananlar ?? []);
  if (!ids.length) return { ok: false, hata: "En az bir kişi seçin." };
  const [old] = await db()
    .select({ id: gorevTekrarlari.id, aktif: gorevTekrarlari.aktif })
    .from(gorevTekrarlari)
    .where(and(eq(gorevTekrarlari.id, t.id), isAdmin(me) ? undefined : eq(gorevTekrarlari.olusturanId, me.id)));
  if (!old) return { ok: false, hata: "Tekrarlayan görevi yalnızca oluşturan ya da yönetici değiştirebilir." };
  await db()
    .update(gorevTekrarlari)
    .set({
      baslik, aciklama: clip(t.aciklama, 10000), oncelik: prio(t.oncelik), tamamlama: ids.length > 1 ? modeOf(t.tamamlama) : "ortak",
      atananlar: JSON.stringify(ids), siklik: rep.siklik, gunler: JSON.stringify(rep.gunler), aktif: !!t.aktif,
      // Yeniden başlatılan tanım kaçan günleri üretmez
      ...(!old.aktif && t.aktif ? { sonUretim: addDays(trToday(), -1) } : {}),
    })
    .where(eq(gorevTekrarlari.id, t.id));
  if (t.aktif) await runTemplates(t.id);
  return { ok: true };
}

/** Tanımı silme: üretilmiş görevler kalır */
export async function deleteTemplate(me: Me, id: number) {
  await ensureTaskSchema();
  const r = await db()
    .delete(gorevTekrarlari)
    .where(and(eq(gorevTekrarlari.id, id), isAdmin(me) ? undefined : eq(gorevTekrarlari.olusturanId, me.id)));
  return r[0].affectedRows > 0;
}
