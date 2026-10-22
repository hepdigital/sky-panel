"use server";

import { revalidatePath } from "next/cache";
import { getMe, isAdmin } from "@/server/auth";
import { moveCategory, moveProduct, saveCategory, saveProduct, setProductPrice, type CategoryInput, type ProductInput } from "@/server/catalog";
import { saveWebp } from "@/server/files";

type Result = { ok: true } | { ok: false; hata: string };

/** Ürün ve fiyat değişince hem Ürünler ekranı hem teklif ekranı (katalog) yenilenir */
function refresh() {
  revalidatePath("/panel/urunler");
  revalidatePath("/panel/teklifler/yeni");
}

export async function urunKaydet(input: ProductInput): Promise<Result> {
  const me = await getMe();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  const r = await saveProduct(me, input);
  if (r.ok) refresh();
  return r.ok ? { ok: true } : r;
}

export async function urunFiyat(id: number, toptan: number | null, perakende: number | null): Promise<Result> {
  const me = await getMe();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  if (!(await setProductPrice(me, id, toptan, perakende))) return { ok: false, hata: "Bu ürünün fiyatını değiştirme yetkiniz yok." };
  refresh();
  return { ok: true };
}

/** Tarayıcıda küçültülüp webp'e çevrilen görsel (base64) */
export async function urunGorselYukle(base64: string): Promise<{ ok: true; yol: string } | { ok: false; hata: string }> {
  const me = await getMe();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  try {
    return { ok: true, yol: await saveWebp("urun", Buffer.from(String(base64), "base64")) };
  } catch (e) {
    return { ok: false, hata: e instanceof Error ? e.message : "Görsel yüklenemedi." };
  }
}

export async function urunTasi(id: number, yon: -1 | 1): Promise<Result> {
  const me = await getMe();
  if (!me || !isAdmin(me)) return { ok: false, hata: "Yalnızca yönetici sıralayabilir." };
  await moveProduct(me, id, yon === -1 ? -1 : 1);
  refresh();
  return { ok: true };
}

export async function kategoriKaydet(input: CategoryInput): Promise<Result> {
  const me = await getMe();
  if (!me || !isAdmin(me)) return { ok: false, hata: "Kategorileri yalnızca yönetici düzenler." };
  const r = await saveCategory(input);
  if (r.ok) refresh();
  return r;
}

export async function kategoriTasi(id: number, yon: -1 | 1): Promise<Result> {
  const me = await getMe();
  if (!me || !isAdmin(me)) return { ok: false, hata: "Kategorileri yalnızca yönetici düzenler." };
  await moveCategory(id, yon === -1 ? -1 : 1);
  refresh();
  return { ok: true };
}
