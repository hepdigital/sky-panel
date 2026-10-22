"use server";

import { revalidatePath } from "next/cache";
import { respond } from "@/server/quote-flow";

/** Müşterinin teklif linkinden yanıtı: kabul ya da revizyon isteği */
export async function teklifYanit(token: string, kabul: boolean, ad: string, not: string) {
  const r = await respond(String(token), !!kabul, String(ad ?? ""), String(not ?? ""));
  revalidatePath(`/t/${token}`);
  return r;
}
