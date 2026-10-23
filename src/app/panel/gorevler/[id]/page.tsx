import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { TaskDetail } from "@/components/tasks/task-detail";
import { isAdmin, requireMe } from "@/server/auth";
import { assignees, getTask } from "@/server/tasks";

export const metadata: Metadata = { title: "Görev" };

// Yönetim kabuğu adres bilgisini Suspense dışında okuyor; dinamik adresli bu sayfa sunucuda beklemeli işlenir
export const instant = false;

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const me = await requireMe();
  const [t, people] = await Promise.all([getTask(me, Number((await params).id)), assignees()]);
  if (!t) notFound();
  return (
    <TaskDetail
      me={{ id: me.id, admin: isAdmin(me) }}
      people={people}
      task={{
        ...t,
        olusturma: t.olusturma.toISOString(),
        tamamlanma: t.tamamlanma?.toISOString() ?? null,
        kayitlar: t.kayitlar.map((k) => ({ ...k, olusturma: k.olusturma.toISOString() })),
      }}
    />
  );
}

export default function TaskPage({ params }: PageProps<"/panel/gorevler/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1000px] animate-pulse rounded-2xl bg-muted" />}>
      <Detail params={params} />
    </Suspense>
  );
}
