import { CircleCheckBig, CircleDashed, CirclePause, CirclePlay, type LucideIcon } from "lucide-react";
import type { BadgeTone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type TaskStatus = "yapilacak" | "devam" | "bekliyor" | "tamam";
export type TaskPriority = "dusuk" | "normal" | "yuksek" | "acil";
export type Person = { id: number; adSoyad: string; rol: "yonetici" | "satis" | "personel" };

export const STATUS: Record<TaskStatus, { label: string; icon: LucideIcon; tone: BadgeTone }> = {
  yapilacak: { label: "Yapılacak", icon: CircleDashed, tone: "neutral" },
  devam: { label: "Devam ediyor", icon: CirclePlay, tone: "info" },
  bekliyor: { label: "Beklemede", icon: CirclePause, tone: "warning" },
  tamam: { label: "Tamamlandı", icon: CircleCheckBig, tone: "success" },
};
export const STATUS_ORDER: TaskStatus[] = ["yapilacak", "devam", "bekliyor", "tamam"];

export const PRIORITY: Record<TaskPriority, { label: string; cls: string }> = {
  acil: { label: "Acil", cls: "bg-danger text-white" },
  yuksek: { label: "Yüksek", cls: "bg-danger-soft text-danger" },
  normal: { label: "Normal", cls: "bg-muted text-muted-foreground" },
  dusuk: { label: "Düşük", cls: "bg-muted/60 text-muted-foreground" },
};

export function PriorityTag({ p, className }: { p: TaskPriority; className?: string }) {
  if (p === "normal") return null;
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", PRIORITY[p].cls, className)}>{PRIORITY[p].label}</span>;
}

/** Bugünün tarihi (Türkiye saatiyle) YYYY-AA-GG */
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

/** Son tarih etiketi: "Bugün", "Yarın", "3 gün gecikti", "24 Eki" */
export function dueText(bitis: string | null, done: boolean) {
  if (!bitis) return null;
  const t = today();
  const diff = Math.round((Date.parse(bitis) - Date.parse(t)) / 86_400_000);
  const nice = new Date(`${bitis}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  if (done) return { text: nice, cls: "text-muted-foreground" };
  if (diff < 0) return { text: `${-diff} gün gecikti`, cls: "text-danger font-semibold" };
  if (diff === 0) return { text: "Bugün", cls: "text-warning font-semibold" };
  if (diff === 1) return { text: "Yarın", cls: "text-foreground" };
  return { text: nice, cls: "text-muted-foreground" };
}

export const initials = (name: string | null) =>
  (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toLocaleUpperCase("tr"))
    .join("");

export function Avatar({ name, className }: { name: string | null; className?: string }) {
  return (
    <span title={name ?? "Atanmamış"} className={cn("grid size-6 shrink-0 place-items-center rounded-full bg-sidebar text-[10px] font-bold text-white", !name && "bg-muted text-muted-foreground", className)}>
      {name ? initials(name) : "?"}
    </span>
  );
}
