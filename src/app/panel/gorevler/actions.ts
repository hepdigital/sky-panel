"use server";

import { revalidatePath } from "next/cache";
import { getMe } from "@/server/auth";
import { GOREV_DURUMLARI } from "@/server/db/schema";
import { addComment, deleteFile, deleteTask, deleteTemplate, saveTask, saveTemplate, setTaskStatus, type TaskInput, type TemplateInput } from "@/server/tasks";

type Result = { ok: true; id?: number | null; mesaj?: string } | { ok: false; hata: string };

function refresh(id?: number | null) {
  revalidatePath("/panel/gorevler");
  revalidatePath("/panel");
  if (id) revalidatePath(`/panel/gorevler/${id}`);
}

export async function gorevKaydet(input: TaskInput): Promise<Result> {
  const me = await getMe();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  const r = await saveTask(me, input);
  if (r.ok) refresh(r.id);
  return r.ok ? { ok: true, id: r.id } : r;
}

export async function gorevDurumu(id: number, durum: string): Promise<Result> {
  const me = await getMe();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  const d = GOREV_DURUMLARI.find((x) => x === durum);
  if (!d) return { ok: false, hata: "Geçersiz durum." };
  const r = await setTaskStatus(me, id, d);
  if (!r) return { ok: false, hata: "Görev bulunamadı." };
  refresh(id);
  return r;
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

export async function gorevDosyaSil(id: number): Promise<Result> {
  const me = await getMe();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  const gorevId = await deleteFile(me, id);
  if (!gorevId) return { ok: false, hata: "Dosyayı yalnızca ekleyen ya da yönetici silebilir." };
  refresh(gorevId);
  return { ok: true };
}

export async function tekrarKaydet(input: TemplateInput): Promise<Result> {
  const me = await getMe();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  const r = await saveTemplate(me, input);
  if (r.ok) refresh();
  return r;
}

export async function tekrarSil(id: number): Promise<Result> {
  const me = await getMe();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  if (!(await deleteTemplate(me, id))) return { ok: false, hata: "Tekrarlayan görevi yalnızca oluşturan ya da yönetici silebilir." };
  refresh();
  return { ok: true };
}
