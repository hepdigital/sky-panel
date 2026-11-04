"use server";

import { revalidatePath } from "next/cache";
import { getMe } from "@/server/auth";
import { removeDevice, sendTest, setPref } from "@/server/push";

export async function tercihKaydet(tur: string, acik: boolean) {
  const me = await getMe();
  if (!me) return { ok: false as const };
  await setPref(me, tur, !!acik);
  return { ok: true as const };
}

/** Kullanıcının tüm cihazlarına deneme bildirimi; kaç cihaza gittiğini döner */
export async function denemeGonder() {
  const me = await getMe();
  if (!me) return { ok: false as const, sayi: 0 };
  return { ok: true as const, sayi: await sendTest(me) };
}

export async function cihazKaldir(id: number) {
  const me = await getMe();
  if (!me) return { ok: false as const };
  await removeDevice(me, Number(id));
  revalidatePath("/panel/bildirimler");
  return { ok: true as const };
}
