"use server";

import { revalidatePath } from "next/cache";
import { getSeller } from "@/server/auth";
import { syncStale } from "@/server/sites";
import { updateRequest } from "@/server/site-requests";

type Result = { ok: true } | { ok: false; hata: string };

export async function talepGuncelle(id: number, change: { durum?: string; not?: string }): Promise<Result> {
  const me = await getSeller();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  const r = await updateRequest(me, Number(id), change);
  revalidatePath("/panel/talepler");
  revalidatePath("/panel", "layout");
  return r;
}

/** "Yenile": siteleri hemen yoklar (yeni talepler ve siparişler) */
export async function talepleriYenile(): Promise<Result> {
  const me = await getSeller();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  await syncStale(0);
  revalidatePath("/panel/talepler");
  return { ok: true };
}
