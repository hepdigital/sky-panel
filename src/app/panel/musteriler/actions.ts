"use server";

import { revalidatePath } from "next/cache";
import { getSeller, isAdmin } from "@/server/auth";
import { deleteGroup, saveCustomer, saveGroup, type CustomerInput } from "@/server/customers";

type Result = { ok: true; id?: number } | { ok: false; hata: string };

export async function musteriKaydet(input: CustomerInput): Promise<Result> {
  const me = await getSeller();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  const r = await saveCustomer(me, input);
  if (r.ok) {
    revalidatePath("/panel/musteriler");
    revalidatePath(`/panel/musteriler/${r.id}`);
  }
  return r;
}

/** İskonto grupları yalnızca yöneticinindir */
export async function grupKaydet(g: { id: number | null; ad: string; fiyatListesi: string; oran: number; aciklama: string }): Promise<Result> {
  const me = await getSeller();
  if (!me || !isAdmin(me)) return { ok: false, hata: "İskonto gruplarını yalnızca yönetici düzenler." };
  const r = await saveGroup(g);
  if (r.ok) revalidatePath("/panel/musteriler");
  return r;
}

export async function grupSil(id: number): Promise<Result> {
  const me = await getSeller();
  if (!me || !isAdmin(me)) return { ok: false, hata: "İskonto gruplarını yalnızca yönetici düzenler." };
  await deleteGroup(id);
  revalidatePath("/panel/musteriler");
  return { ok: true };
}
