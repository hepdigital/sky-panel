"use server";

import { revalidatePath } from "next/cache";
import type { Paket, Tariff } from "@/lib/cargo-tariff";
import { getSeller, isAdmin } from "@/server/auth";
import { savePackages, saveTariff } from "@/server/shipping";

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

/** Modüler gazebo parçalarının koli ölçüleri (yalnızca yönetici) */
export async function kargoPaketKaydet(list: Record<string, Paket | null>): Promise<Result> {
  const me = await getSeller();
  if (!me || !isAdmin(me)) return { ok: false, hata: "Koli ölçülerini yalnızca yönetici değiştirir." };
  await savePackages(Object.fromEntries(Object.entries(list ?? {}).filter(([k]) => !k.startsWith("u|"))));
  refresh();
  return { ok: true };
}
