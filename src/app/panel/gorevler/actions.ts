"use server";

import { revalidatePath } from "next/cache";
import { getMe } from "@/server/auth";
import { GOREV_DURUMLARI } from "@/server/db/schema";
import { addComment, deleteTask, saveTask, setTaskStatus, type TaskInput } from "@/server/tasks";

type Result = { ok: true; id?: number } | { ok: false; hata: string };

function refresh(id?: number) {
  revalidatePath("/panel/gorevler");
  revalidatePath("/panel");
  if (id) revalidatePath(`/panel/gorevler/${id}`);
}

export async function gorevKaydet(input: TaskInput): Promise<Result> {
  const me = await getMe();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  const r = await saveTask(me, input);
  if (r.ok) refresh(r.id);
  return r;
}

export async function gorevDurumu(id: number, durum: string): Promise<Result> {
  const me = await getMe();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  const d = GOREV_DURUMLARI.find((x) => x === durum);
  if (!d) return { ok: false, hata: "Geçersiz durum." };
  if (!(await setTaskStatus(me, id, d))) return { ok: false, hata: "Görev bulunamadı." };
  refresh(id);
  return { ok: true };
}

export async function gorevYorum(id: number, metin: string): Promise<Result> {
  const me = await getMe();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  if (!(await addComment(me, id, String(metin ?? "")))) return { ok: false, hata: "Yorum eklenemedi." };
  refresh(id);
  return { ok: true };
}

export async function gorevSil(id: number): Promise<Result> {
  const me = await getMe();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  if (!(await deleteTask(me, id))) return { ok: false, hata: "Görevi yalnızca oluşturan ya da yönetici silebilir." };
  refresh();
  return { ok: true };
}
