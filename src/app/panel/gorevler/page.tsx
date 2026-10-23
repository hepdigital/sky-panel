import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { TaskBoard } from "@/components/tasks/task-board";
import { isAdmin, requireMe } from "@/server/auth";
import { assignees, listTasks, relatedLabel, type TaskFilter } from "@/server/tasks";

export const metadata: Metadata = { title: "Görevler" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

async function Board({ searchParams }: { searchParams: SP }) {
  await connection();
  const me = await requireMe();
  const sp = await searchParams;
  const kapsam: TaskFilter["kapsam"] = one(sp.kapsam) === "atadiklarim" ? "atadiklarim" : one(sp.kapsam) === "tumu" ? "tumu" : "bana";
  const kisi = Number(one(sp.kisi)) || null;
  const tamamlananlar = one(sp.tamam) === "1";
  // Başka ekrandan "Görev oluştur" ile gelindiyse ilgili kayıt
  const rel = { musteriId: Number(one(sp.musteri)) || null, teklifId: Number(one(sp.teklif)) || null, siparisId: Number(one(sp.siparis)) || null };
  const [tasks, people, relLabel] = await Promise.all([listTasks(me, { kapsam, kisi, tamamlananlar }), assignees(), relatedLabel(me, rel)]);
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return (
    <TaskBoard
      me={{ id: me.id, admin: isAdmin(me) }}
      filter={{ kapsam, kisi, tamamlananlar }}
      tasks={tasks.map((t) => ({ ...t, olusturma: iso(t.olusturma)!, tamamlanma: iso(t.tamamlanma) }))}
      people={people}
      create={one(sp.yeni) === "1" ? { ...rel, label: relLabel } : null}
    />
  );
}

export default function TasksPage({ searchParams }: PageProps<"/panel/gorevler">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1400px] animate-pulse rounded-2xl bg-muted" />}>
      <Board searchParams={searchParams} />
    </Suspense>
  );
}
