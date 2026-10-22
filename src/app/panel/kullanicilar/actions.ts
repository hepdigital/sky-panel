"use server";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { hashPassword, requireAdmin } from "@/server/auth";
import { db, schema } from "@/server/db";

export type UserFormState = { hata?: string; sifre?: string; mesaj?: string } | undefined;

const k = schema.kullanicilar;
/** Okunaklı, 12 karakterlik geçici şifre (yalnızca bir kez gösterilir) */
const newPassword = () => randomBytes(9).toString("base64url");
const text = (form: FormData, key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max);

/** Yeni personel hesabı; şifre otomatik üretilir */
export async function kullaniciEkle(_: UserFormState, form: FormData): Promise<UserFormState> {
  await requireAdmin();
  const kullaniciAdi = text(form, "kullaniciAdi", 60).toLowerCase();
  const adSoyad = text(form, "adSoyad", 120);
  const eposta = text(form, "eposta", 160) || null;
  const telefon = text(form, "telefon", 40) || null;
  const rol = form.get("rol") === "yonetici" ? "yonetici" : "satis";
  if (!/^[a-z0-9._-]{3,60}$/.test(kullaniciAdi)) return { hata: "Kullanıcı adı 3–60 karakter olmalı; küçük harf, rakam, nokta, tire." };
  if (!adSoyad) return { hata: "Ad soyad gerekli." };
  const [var_] = await db().select({ id: k.id }).from(k).where(eq(k.kullaniciAdi, kullaniciAdi));
  if (var_) return { hata: "Bu kullanıcı adı zaten var." };
  const sifre = newPassword();
  await db().insert(k).values({ kullaniciAdi, adSoyad, eposta, telefon, rol, sifreHash: await hashPassword(sifre) });
  revalidatePath("/panel/kullanicilar");
  return { mesaj: `${adSoyad} eklendi. Kullanıcı adı: ${kullaniciAdi}`, sifre };
}

/** Bilgileri, rolü ve aktifliği günceller; kendini pasife alamaz ya da yöneticilikten çıkaramaz */
export async function kullaniciGuncelle(_: UserFormState, form: FormData): Promise<UserFormState> {
  const me = await requireAdmin();
  const id = Number(form.get("id"));
  const adSoyad = text(form, "adSoyad", 120);
  const rol = form.get("rol") === "yonetici" ? "yonetici" : "satis";
  const aktif = form.get("aktif") === "on";
  if (!adSoyad) return { hata: "Ad soyad gerekli." };
  if (id === me.id && (!aktif || rol !== "yonetici")) return { hata: "Kendi hesabınızı pasife alamaz ya da yöneticilikten çıkaramazsınız." };
  await db()
    .update(k)
    .set({ adSoyad, rol, aktif, eposta: text(form, "eposta", 160) || null, telefon: text(form, "telefon", 40) || null })
    .where(eq(k.id, id));
  // Pasife alınan kullanıcının açık oturumları kapanır
  if (!aktif) await db().delete(schema.oturumlar).where(eq(schema.oturumlar.kullaniciId, id));
  revalidatePath("/panel/kullanicilar");
  return { mesaj: "Kaydedildi." };
}

/** Yeni geçici şifre üretir; kullanıcının açık oturumları kapanır */
export async function sifreSifirla(_: UserFormState, form: FormData): Promise<UserFormState> {
  const me = await requireAdmin();
  const id = Number(form.get("id"));
  const sifre = newPassword();
  await db().update(k).set({ sifreHash: await hashPassword(sifre) }).where(eq(k.id, id));
  // Başka kullanıcının şifresi sıfırlanınca açık oturumları kapanır (yöneticinin kendi oturumu açık kalır)
  if (id !== me.id) await db().delete(schema.oturumlar).where(eq(schema.oturumlar.kullaniciId, id));
  return { mesaj: "Yeni şifre üretildi.", sifre };
}
