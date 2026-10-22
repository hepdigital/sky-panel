"use server";

import { eq, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { createSession, destroySession, verifyPassword } from "@/server/auth";
import { db, schema } from "@/server/db";

export type LoginState = { hata?: string } | undefined;

/** Personel girişi: kullanıcı adı ya da e-posta + şifre */
export async function girisYap(_: LoginState, form: FormData): Promise<LoginState> {
  const ad = String(form.get("kullanici") ?? "").trim().toLowerCase();
  const sifre = String(form.get("sifre") ?? "");
  if (!ad || !sifre) return { hata: "Kullanıcı adı ve şifre gerekli." };
  const k = schema.kullanicilar;
  const [u] = await db()
    .select({ id: k.id, sifreHash: k.sifreHash, aktif: k.aktif })
    .from(k)
    .where(or(eq(k.kullaniciAdi, ad), eq(k.eposta, ad)))
    .limit(1);
  if (!u || !u.aktif || !(await verifyPassword(sifre, u.sifreHash))) return { hata: "Kullanıcı adı ya da şifre hatalı." };
  await createSession(u.id);
  redirect("/panel");
}

export async function cikisYap() {
  await destroySession();
  redirect("/giris");
}
