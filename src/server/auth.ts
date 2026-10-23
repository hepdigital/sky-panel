import "server-only";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { db, schema } from "./db";
import { COOKIE, RENEW_BELOW_DAYS, SESSION_DAYS, sessionCookie } from "./session-cookie";

// Personel girişi: kullanıcı adı (ya da e-posta) + şifre, oturum veritabanında.
// Çerezde rastgele anahtar durur, veritabanında yalnızca SHA-256 özeti saklanır.

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;


export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, saltB64, keyB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scryptAsync(password, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(key, expected);
}

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export async function createSession(userId: number) {
  const token = randomToken();
  const bitis = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db().insert(schema.oturumlar).values({ tokenHash: sha256(token), kullaniciId: userId, bitis });
  await db().update(schema.kullanicilar).set({ sonGiris: new Date() }).where(eq(schema.kullanicilar.id, userId));
  (await cookies()).set(COOKIE, token, sessionCookie(bitis));
  // Süresi dolan oturumlar ara ara temizlenir
  if (Math.random() < 0.05) await db().delete(schema.oturumlar).where(lt(schema.oturumlar.bitis, new Date()));
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db().delete(schema.oturumlar).where(eq(schema.oturumlar.tokenHash, sha256(token)));
  store.delete(COOKIE);
}

export type Me = { id: number; kullaniciAdi: string; adSoyad: string; eposta: string | null; telefon: string | null; rol: "yonetici" | "satis" | "personel" };

/** Oturumdaki kullanıcı (yoksa null). Aynı istekte bir kez okunur. */
export const getMe = cache(async (): Promise<Me | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  // Oturum her gerçek istekte doğrulanır (süre kontrolü ön-render sırasında yapılamaz)
  await connection();
  const k = schema.kullanicilar;
  const [row] = await db()
    .select({ id: k.id, kullaniciAdi: k.kullaniciAdi, adSoyad: k.adSoyad, eposta: k.eposta, telefon: k.telefon, rol: k.rol, bitis: schema.oturumlar.bitis })
    .from(schema.oturumlar)
    .innerJoin(k, eq(k.id, schema.oturumlar.kullaniciId))
    .where(and(eq(schema.oturumlar.tokenHash, sha256(token)), gt(schema.oturumlar.bitis, new Date()), eq(k.aktif, true)));
  if (!row) return null;
  const { bitis, ...me } = row;
  // Kullandıkça uzar (en çok ayda bir yazılır)
  if (bitis.getTime() - Date.now() < RENEW_BELOW_DAYS * 86_400_000)
    await db().update(schema.oturumlar).set({ bitis: new Date(Date.now() + SESSION_DAYS * 86_400_000) }).where(eq(schema.oturumlar.tokenHash, sha256(token)));
  return me;
});

export async function requireMe() {
  const me = await getMe();
  if (!me) redirect("/giris");
  return me;
}

export async function requireAdmin() {
  const me = await requireMe();
  if (me.rol !== "yonetici") redirect("/panel");
  return me;
}

/** Satışçı yalnızca kendi kayıtlarını görür; yönetici hepsini */
export const isAdmin = (me: Me) => me.rol === "yonetici";
/** Teklif, sipariş, müşteri ve ürün ekranları yönetici ve satışçıya açıktır; personel yalnızca görevleri kullanır */
export const canSell = (me: Me) => me.rol === "yonetici" || me.rol === "satis";

/** Satış ekranları: personel görevlerine yönlendirilir */
export async function requireSeller() {
  const me = await requireMe();
  if (!canSell(me)) redirect("/panel/gorevler");
  return me;
}

/** Satış işlemleri (sunucu eylemleri): oturum yoksa ya da personelse null */
export async function getSeller() {
  const me = await getMe();
  return me && canSell(me) ? me : null;
}
