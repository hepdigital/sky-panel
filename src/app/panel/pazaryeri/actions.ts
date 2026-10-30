"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth";
import {
  categoryAttributes, checkListings, deleteItem, nextBarcode, pushPriceStock, refreshCategories, saveItem, saveSettings, searchBrands, searchCategories, sendListings,
  type ChannelSettings, type ItemInput,
} from "@/server/marketplaces/listing";

type Fail = { ok: false; hata: string };
const fail = (e: unknown): Fail => ({ ok: false, hata: e instanceof Error ? (e.name === "TimeoutError" ? "Pazaryeri zamanında yanıt vermedi." : e.message) : "İşlem yapılamadı." });
const done = () => revalidatePath("/panel/pazaryeri");

export async function pyUrunKaydet(input: ItemInput) {
  await requireAdmin();
  const r = await saveItem(input).catch(fail);
  if (r.ok) done();
  return r;
}

export async function pyUrunSil(id: number) {
  await requireAdmin();
  try {
    const r = await deleteItem(Number(id));
    done();
    return { ok: true as const, ...r };
  } catch (e) {
    return fail(e);
  }
}

export async function pyBarkod() {
  await requireAdmin();
  try {
    return { ok: true as const, barkod: await nextBarcode() };
  } catch (e) {
    return fail(e);
  }
}

export async function pyKategoriAra(siteId: number, q: string) {
  await requireAdmin();
  try {
    return { ok: true as const, liste: await searchCategories(Number(siteId), String(q).slice(0, 80)) };
  } catch (e) {
    return fail(e);
  }
}

export async function pyKategoriYenile(siteId: number) {
  await requireAdmin();
  try {
    const adet = await refreshCategories(Number(siteId));
    done();
    return { ok: true as const, adet };
  } catch (e) {
    return fail(e);
  }
}

export async function pyOzellikler(siteId: number, kategoriId: number) {
  await requireAdmin();
  try {
    return { ok: true as const, liste: await categoryAttributes(Number(siteId), Number(kategoriId)) };
  } catch (e) {
    return fail(e);
  }
}

export async function pyMarkaAra(siteId: number, q: string) {
  await requireAdmin();
  try {
    return { ok: true as const, liste: await searchBrands(Number(siteId), String(q).slice(0, 60)) };
  } catch (e) {
    return fail(e);
  }
}

/** Bekleyen (taslak/hatalı) listelemeleri gönderir; urunIds verilirse yalnızca onları */
export async function pyGonder(siteId: number, urunIds?: number[]) {
  const me = await requireAdmin();
  try {
    const r = await sendListings(Number(siteId), me.adSoyad, urunIds?.map(Number));
    done();
    return { ok: true as const, ...r };
  } catch (e) {
    return fail(e);
  }
}

/** Gönderim sonuçları, onaylar ve değişen fiyat/stok */
export async function pyDurumYenile(siteId: number) {
  const me = await requireAdmin();
  try {
    await checkListings(Number(siteId));
    const fiyatStok = await pushPriceStock(Number(siteId), me.adSoyad);
    done();
    return { ok: true as const, fiyatStok };
  } catch (e) {
    done();
    return fail(e);
  }
}

export async function pyAyarKaydet(siteId: number, s: ChannelSettings) {
  await requireAdmin();
  try {
    await saveSettings(Number(siteId), s);
    done();
    return { ok: true as const };
  } catch (e) {
    return fail(e);
  }
}
