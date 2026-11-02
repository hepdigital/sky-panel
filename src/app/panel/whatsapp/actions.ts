"use server";

import { revalidatePath } from "next/cache";
import { getSeller } from "@/server/auth";
import { waEnabled } from "@/server/whatsapp/config";
import { closeChat, sendFromPanel, takeOver } from "@/server/whatsapp/store";

type Result = { ok: true } | { ok: false; hata: string };

async function seller() {
  if (!waEnabled()) return null;
  return getSeller();
}

const refresh = () => {
  revalidatePath("/panel/whatsapp");
  revalidatePath("/panel", "layout");
};

export async function waGonder(id: number, metin: string): Promise<Result> {
  const me = await seller();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  const r = await sendFromPanel(me, Number(id), String(metin ?? ""));
  refresh();
  return r;
}

export async function waDevral(id: number): Promise<Result> {
  const me = await seller();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  await takeOver(me, Number(id));
  refresh();
  return { ok: true };
}

export async function waKapat(id: number): Promise<Result> {
  const me = await seller();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  await closeChat(Number(id));
  refresh();
  return { ok: true };
}
