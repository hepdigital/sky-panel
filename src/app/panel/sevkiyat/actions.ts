"use server";

import { revalidatePath } from "next/cache";
import type { Paket, Tariff } from "@/lib/cargo-tariff";
import { getSeller, isAdmin } from "@/server/auth";
import { linkShipment, savePackages, saveTariff, saveYurtici, syncYurtici } from "@/server/shipping";

type Result = { ok: true } | { ok: false; hata: string };

/** Kargo hesabı kullanan ekranlar: Sevkiyat, ürünler, gazebo fiyatları ve teklif ekranı */
function refresh() {
  for (const p of ["/panel/sevkiyat", "/panel/urunler", "/panel/urunler/gazebo", "/panel/satis-urunleri", "/panel/teklifler/yeni"]) revalidatePath(p);
}

export async function kargoTarifeKaydet(t: Tariff): Promise<Result> {
  const me = await getSeller();
  if (!me || !isAdmin(me)) return { ok: false, hata: "Kargo tarifesini yalnızca yönetici değiştirir." };
  const r = await saveTariff(t);
  if (r.ok) refresh();
  return r;
}

/** Yurtiçi web servis kullanıcısı: test edilip kaydedilir (şifre boşsa kayıtlı şifre) */
export async function yurticiKaydet(kullanici: string, sifre: string): Promise<Result> {
  const me = await getSeller();
  if (!me || !isAdmin(me)) return { ok: false, hata: "Yurtiçi bağlantısını yalnızca yönetici ayarlar." };
  const r = await saveYurtici(String(kullanici ?? ""), String(sifre ?? ""));
  if (r.ok) revalidatePath("/panel/sevkiyat");
  return r;
}

/** Gönderileri Yurtiçi'den yeniden çeker (salt okuma) */
export async function yurticiEsitle(): Promise<{ ok: true; count: number } | { ok: false; hata: string }> {
  const me = await getSeller();
  if (!me || !isAdmin(me)) return { ok: false, hata: "Yalnızca yönetici eşitler." };
  const r = await syncYurtici();
  revalidatePath("/panel/sevkiyat");
  return r;
}

/** Gönderinin sipariş bağlantısı (null: yanlış eşleşmeyi kaldırır) */
export async function gonderiBagla(id: number, siparisId: number | null): Promise<Result> {
  const me = await getSeller();
  if (!me || !isAdmin(me)) return { ok: false, hata: "Yalnızca yönetici değiştirir." };
  await linkShipment(Number(id), siparisId ? Number(siparisId) : null);
  revalidatePath("/panel/sevkiyat");
  return { ok: true };
}

/** Modüler gazebo parçalarının koli ölçüleri (yalnızca yönetici) */
export async function kargoPaketKaydet(list: Record<string, Paket | null>): Promise<Result> {
  const me = await getSeller();
  if (!me || !isAdmin(me)) return { ok: false, hata: "Koli ölçülerini yalnızca yönetici değiştirir." };
  await savePackages(Object.fromEntries(Object.entries(list ?? {}).filter(([k]) => !k.startsWith("u|"))));
  refresh();
  return { ok: true };
}
