"use server";

import { revalidatePath } from "next/cache";
import { getSeller } from "@/server/auth";
import { SIPARIS_DURUMLARI } from "@/server/db/schema";
import { convertQuote, setOrderStatus } from "@/server/orders";

type Result = { ok: true; id?: number } | { ok: false; hata: string };

/** Onaylanan teklifi siparişe dönüştürür; sipariş sayfasına yönlendirmek için sipariş kimliği döner */
export async function siparisOlustur(teklifId: number): Promise<Result> {
  const me = await getSeller();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  const r = await convertQuote(me, teklifId);
  revalidatePath(`/panel/teklifler/${teklifId}`);
  return r;
}

export async function siparisDurumu(id: number, durum: string, notlar?: string): Promise<Result> {
  const me = await getSeller();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  const d = SIPARIS_DURUMLARI.find((x) => x === durum);
  if (!d) return { ok: false, hata: "Geçersiz durum." };
  if (!(await setOrderStatus(me, id, d, notlar))) return { ok: false, hata: "Sipariş bulunamadı." };
  revalidatePath(`/panel/siparisler/${id}`);
  revalidatePath("/panel/siparisler");
  return { ok: true };
}
