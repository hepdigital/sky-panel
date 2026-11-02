"use server";

import { revalidatePath } from "next/cache";
import { getSeller } from "@/server/auth";
import { syncStale } from "@/server/sites";
import { updateRequest } from "@/server/site-requests";
import { updateWaRequest } from "@/server/whatsapp/requests";

type Result = { ok: true } | { ok: false; hata: string };

export async function talepGuncelle(id: number, change: { durum?: string; not?: string }, kaynak: "site" | "whatsapp" = "site"): Promise<Result> {
  const me = await getSeller();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  const r = kaynak === "whatsapp" ? await updateWaRequest(me, Number(id), change) : await updateRequest(me, Number(id), change);
  revalidatePath("/panel/talepler");
  revalidatePath("/panel/siparisler");
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
