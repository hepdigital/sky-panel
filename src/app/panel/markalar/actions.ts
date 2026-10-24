"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth";
import { saveBrand, setBrandUsers, setUserBrands, type BrandInput } from "@/server/brands";
import { saveWebp } from "@/server/files";

type Result = { ok: true; id?: number } | { ok: false; hata: string };

export async function markaKaydet(input: BrandInput): Promise<Result> {
  await requireAdmin();
  const r = await saveBrand(input);
  if (r.ok) {
    revalidatePath("/panel/markalar");
    revalidatePath(`/panel/markalar/${r.id}`);
    revalidatePath("/panel/teklifler/yeni");
  }
  return r;
}

/** Tarayıcıda webp'e çevrilen logo (base64) */
export async function markaLogoYukle(base64: string): Promise<{ ok: true; yol: string } | { ok: false; hata: string }> {
  await requireAdmin();
  try {
    return { ok: true, yol: await saveWebp("marka", Buffer.from(String(base64), "base64")) };
  } catch (e) {
    return { ok: false, hata: e instanceof Error ? e.message : "Logo yüklenemedi." };
  }
}

/** Satışçının markaları; boş liste = tüm markalar */
export async function kullaniciMarkalari(userId: number, markaIds: number[]): Promise<Result> {
  await requireAdmin();
  await setUserBrands(Number(userId), (markaIds ?? []).map(Number).filter((n) => n > 0));
  revalidatePath("/panel/kullanicilar");
  return { ok: true };
}

/** Marka sayfası: bu markayla satış yapabilecek satışçılar */
export async function markaSatiscilari(markaId: number, userIds: number[]): Promise<Result> {
  await requireAdmin();
  await setBrandUsers(Number(markaId), (userIds ?? []).map(Number).filter((n) => n > 0));
  revalidatePath(`/panel/markalar/${markaId}`);
  revalidatePath("/panel/kullanicilar");
  return { ok: true };
}
