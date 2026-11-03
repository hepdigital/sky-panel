"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth";
import { resyncHistory, saveSite, syncSite, testSite, type SiteInput } from "@/server/sites";

type Result = { ok: true; id?: number; adet?: number } | { ok: false; hata: string };

export async function siteKaydet(input: SiteInput): Promise<Result> {
  await requireAdmin();
  const r = await saveSite(input);
  if (r.ok) revalidatePath("/panel/siteler");
  return r;
}

export async function siteTest(id: number): Promise<Result> {
  await requireAdmin();
  return testSite(Number(id));
}

/** Elle eşitleme; "bastan" seçilirse imleç sıfırlanır ve tüm siparişler yeniden çekilir */
export async function siteEsitle(id: number): Promise<Result> {
  await requireAdmin();
  const r = await syncSite(Number(id));
  revalidatePath("/panel/siteler");
  revalidatePath("/panel/siparisler");
  return r.ok ? { ok: true, adet: r.count } : { ok: false, hata: r.hata };
}

/** Pazaryeri: sipariş geçmişini baştan çeker (Trendyol son 90 gün) */
export async function siteGecmisCek(id: number): Promise<Result> {
  await requireAdmin();
  const r = await resyncHistory(Number(id));
  revalidatePath("/panel/siteler");
  revalidatePath("/panel/siparisler");
  return r.ok ? { ok: true, adet: r.count } : { ok: false, hata: r.hata };
}
