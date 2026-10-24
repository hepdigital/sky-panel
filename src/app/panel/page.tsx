import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Dashboard } from "@/components/admin/dashboard";
import { canSell, requireMe } from "@/server/auth";
import { brandFilter } from "@/server/brands";
import { dashboard, type Period } from "@/server/dashboard";
import { myOpenTasks } from "@/server/tasks";

export const metadata: Metadata = { title: "Dashboard" };

/** Selam ve tarih Türkiye saatine göre */
function greeting(name: string) {
  const now = new Date();
  const h = Number(now.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", hour12: false }));
  const hello = h < 5 ? "İyi geceler" : h < 12 ? "Günaydın" : h < 18 ? "İyi günler" : "İyi akşamlar";
  const date = now.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric", weekday: "long" });
  return { hello, date, name: name.split(/\s+/)[0] ?? name };
}

async function Home({ searchParams }: { searchParams: Promise<{ donem?: string | string[]; marka?: string | string[] }> }) {
  await connection();
  const me = await requireMe();
  const sp = await searchParams;
  const raw = sp.donem;
  const period: Period = raw === "30" || raw === "yil" || raw === "tum" ? raw : "ay";
  const brands = canSell(me) ? await brandFilter(me, sp.marka) : { options: [], active: null };
  const [data, tasks] = await Promise.all([canSell(me) ? dashboard(me, period, brands.active?.id ?? null) : null, myOpenTasks(me, canSell(me) ? 6 : 20)]);
  return (
    <Dashboard
      greeting={greeting(me.adSoyad)}
      role={me.rol}
      period={period}
      brands={brands.options}
      activeBrand={brands.active?.kod ?? null}
      data={data}
      tasks={tasks.map((t) => ({ ...t, olusturma: t.olusturma.toISOString(), tamamlanma: t.tamamlanma?.toISOString() ?? null }))}
    />
  );
}

export default function PanelHome({ searchParams }: PageProps<"/panel">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1400px] animate-pulse rounded-2xl bg-muted" />}>
      <Home searchParams={searchParams} />
    </Suspense>
  );
}
