"use server";

import { revalidatePath } from "next/cache";
import { getSeller } from "@/server/auth";
import { cancelPaymentLink, createPaymentLink, installmentTable, type NewPaymentLink } from "@/server/payment-links";

export async function odemeLinkiOlustur(input: NewPaymentLink) {
  const me = await getSeller();
  if (!me) return { ok: false as const, hata: "Oturum kapanmış." };
  const r = await createPaymentLink(me, input);
  revalidatePath("/panel/odeme-linkleri");
  return r;
}

export async function odemeLinkiIptal(id: number) {
  const me = await getSeller();
  if (!me) return { ok: false as const, hata: "Oturum kapanmış." };
  const r = await cancelPaymentLink(me, Number(id));
  revalidatePath("/panel/odeme-linkleri");
  return r;
}

export async function taksitTablosu(siteId: number, tutar: number) {
  const me = await getSeller();
  if (!me) return { ok: false as const, hata: "Oturum kapanmış." };
  return installmentTable(me, Number(siteId), Number(tutar));
}
