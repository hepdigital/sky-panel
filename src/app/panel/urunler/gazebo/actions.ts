"use server";

import { revalidatePath } from "next/cache";
import { getSeller, isAdmin } from "@/server/auth";
import { canUseBrand } from "@/server/brands";
import { saveGazeboEdits } from "@/server/gazebo-prices";

/** Modüler gazebo fiyatları: bir kapsamın (ortak / marka / maliyet) tüm düzeltmeleri; yalnızca yönetici */
export async function gazeboFiyatKaydet(kapsam: "ortak" | "maliyet" | number, edits: Record<string, unknown>): Promise<{ ok: true } | { ok: false; hata: string }> {
  const me = await getSeller();
  if (!me || !isAdmin(me)) return { ok: false, hata: "Gazebo fiyatlarını yalnızca yönetici değiştirir." };
  if (typeof kapsam === "number" && !(await canUseBrand(me, kapsam))) return { ok: false, hata: "Marka bulunamadı." };
  if (typeof kapsam !== "number" && kapsam !== "ortak" && kapsam !== "maliyet") return { ok: false, hata: "Geçersiz kapsam." };
  await saveGazeboEdits(kapsam, edits && typeof edits === "object" ? edits : {});
  revalidatePath("/panel/urunler/gazebo");
  revalidatePath("/panel/teklifler/yeni");
  return { ok: true };
}
