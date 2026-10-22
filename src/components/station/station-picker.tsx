"use client";

import Link from "next/link";
import { ArrowRight, ChevronRight, Factory, Palette, Printer, RotateCcw, Truck, UserCheck, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { isAtStation, stations, type StationKey } from "@/lib/station-data";
import { cn } from "@/lib/utils";
import { useStations } from "./store";

const order: { key: StationKey; icon: LucideIcon; href: string }[] = [
  { key: "design", icon: Palette, href: "/istasyon/tasarim" },
  { key: "print", icon: Printer, href: "/istasyon/baski" },
  { key: "production", icon: Factory, href: "/istasyon/uretim" },
  { key: "shipping", icon: Truck, href: "/istasyon/sevkiyat" },
];

export function StationPicker() {
  const { jobs, ready, reset } = useStations();

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-5 md:px-6 md:py-8">
      <header className="flex items-center justify-between">
        <Logo />
        <ThemeToggle />
      </header>

      <div className="mt-8 md:mt-12">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">İstasyonunuzu seçin</h1>
        <p className="mt-2 text-muted-foreground">Her istasyon yalnızca kendi işlerini görür. İş bitince bir sonraki istasyona otomatik geçer.</p>
      </div>

      {/* Akış */}
      <div className="mt-6 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {["Tasarım", "Müşteri onayı", "Baskı", "Üretim", "Sevkiyat", "Kargoda"].map((s, i, a) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn("rounded-full px-2.5 py-1", s === "Müşteri onayı" || s === "Kargoda" ? "border border-dashed border-border" : "bg-muted text-foreground")}>
              {s === "Müşteri onayı" && <UserCheck className="mr-1 inline size-3" />}
              {s}
            </span>
            {i < a.length - 1 && <ChevronRight className="size-3.5" />}
          </span>
        ))}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 md:gap-4">
        {order.map(({ key, icon: Icon, href }) => {
          const s = stations[key];
          const here = jobs.filter((j) => isAtStation(j, key));
          const active = here.filter((j) => j.active.includes(key) && !j.blocked[key]).length;
          const blocked = here.filter((j) => j.blocked[key]).length;
          const waiting = here.length - active - blocked;
          const items = here.reduce((n, j) => n + j.items.filter((i) => i.stage === key && !i.done.includes(key)).length, 0);
          return (
            <Link
              key={key}
              href={href}
              className="group flex items-center gap-4 rounded-3xl border border-border/70 bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 md:p-6"
            >
              <span data-panel="admin" className="grid size-16 shrink-0 place-items-center rounded-2xl bg-sidebar text-white md:size-20">
                <Icon className="size-8 md:size-9" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-xl font-bold md:text-2xl">
                  <span className={cn("size-2.5 rounded-full", s.dot)} /> {s.title}
                </p>
                <p className="text-sm text-muted-foreground">{s.operator}</p>
                <div className={cn("mt-3 flex flex-wrap gap-2 text-xs font-semibold", !ready && "opacity-0")}>
                  <span className="rounded-full bg-muted px-2.5 py-1">{waiting} iş sırada · {items} kalem</span>
                  {active > 0 && <span className="rounded-full bg-primary-soft px-2.5 py-1 text-primary-soft-foreground">{active} üzerinde</span>}
                  {blocked > 0 && <span className="rounded-full bg-danger-soft px-2.5 py-1 text-danger">{blocked} bekletilen</span>}
                </div>
              </div>
              <ArrowRight className="size-6 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
            </Link>
          );
        })}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-10 text-sm text-muted-foreground">
        <Link href="/panel/uretim" className="font-semibold hover:text-foreground">
          Yönetici görünümü: üretim panosu →
        </Link>
        <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 font-semibold hover:text-foreground">
          <RotateCcw className="size-3.5" /> Demo verisini sıfırla
        </button>
      </div>
    </div>
  );
}
