"use server";

import { eq } from "drizzle-orm";
import { getMe, passwordProblem, setOwnPassword, verifyPassword } from "@/server/auth";
import { db, schema } from "@/server/db";

export type PasswordState = { hata?: string; ok?: true } | undefined;

/**
 * Kullanıcı kendi şifresini değiştirir. Profilde mevcut şifre sorulur; geçici şifreyle yeni girilmişse (ilk giriş,
 * yöneticinin sıfırlaması) sorulmaz. Başarıda bu oturum açık kalır, diğer oturumlar kapanır.
 */
export async function sifreDegistir(_: PasswordState, form: FormData): Promise<PasswordState> {
  const me = await getMe();
  if (!me) return { hata: "Oturum kapanmış, yeniden giriş yapın." };
  const yeni = String(form.get("yeni") ?? "");
  const k = schema.kullanicilar;
  const [u] = await db().select({ sifreHash: k.sifreHash }).from(k).where(eq(k.id, me.id));
  if (!u) return { hata: "Hesap bulunamadı." };
  if (!me.sifreDegismeli && !(await verifyPassword(String(form.get("mevcut") ?? ""), u.sifreHash))) return { hata: "Mevcut şifre hatalı." };
  const sorun = passwordProblem(yeni);
  if (sorun) return { hata: sorun };
  if (yeni !== String(form.get("tekrar") ?? "")) return { hata: "Yeni şifre ile tekrarı aynı değil." };
  if (await verifyPassword(yeni, u.sifreHash)) return { hata: "Yeni şifre eskisinden farklı olmalı." };
  await setOwnPassword(me.id, yeni);
  return { ok: true };
}
