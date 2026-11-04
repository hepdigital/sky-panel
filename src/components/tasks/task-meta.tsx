import { CircleCheckBig, CircleDashed, CirclePause, CirclePlay, type LucideIcon } from "lucide-react";
import type { BadgeTone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type TaskStatus = "yapilacak" | "devam" | "bekliyor" | "tamam";
export type TaskPriority = "dusuk" | "normal" | "yuksek" | "acil";
export type Person = { id: number; adSoyad: string; rol: "yonetici" | "satis" | "personel" };
export type Assignee = { id: number; ad: string; tamam: boolean };
export type TaskMode = "ortak" | "kisi";
export type Repeat = { siklik: "hafta" | "ay"; gunler: number[] };

/** 1 = Pazartesi … 7 = Pazar */
export const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const WEEKDAY_LONG = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

/** "Her Salı ve Cuma", "Hafta içi her gün", "Her ayın 1'i ve 15'i" */
export function repeatText(r: Repeat) {
  const g = [...r.gunler].sort((a, b) => a - b);
  const list = (a: string[]) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} ve ${a.at(-1)}` : (a[0] ?? ""));
  if (r.siklik === "ay") return `Her ayın ${list(g.map(String))}. günü`;
  if (g.length === 7) return "Her gün";
  if (g.join() === "1,2,3,4,5") return "Hafta içi her gün";
  return `Her ${list(g.map((d) => WEEKDAY_LONG[d - 1]!))}`;
}

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

/** Atananlar: üst üste baş harfler; kişi başı görevde bitirenin yanında onay işareti */
export function AvatarStack({ people, max = 3, showDone }: { people: Assignee[]; max?: number; showDone?: boolean }) {
  if (!people.length) return <Avatar name={null} />;
  return (
    <span className="flex shrink-0 -space-x-1.5">
      {people.slice(0, max).map((p) => (
        <Avatar key={p.id} name={p.ad} className={cn("ring-2 ring-card", showDone && p.tamam && "bg-success")} />
      ))}
      {people.length > max && <span className="grid size-6 place-items-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground ring-2 ring-card">+{people.length - max}</span>}
    </span>
  );
}

export const assigneeNames = (people: Assignee[]) => (people.length ? (people.length > 2 ? `${people[0]!.ad} ve ${people.length - 1} kişi` : people.map((p) => p.ad).join(", ")) : "Atanmamış");

export function Avatar({ name, className }: { name: string | null; className?: string }) {
  return (
    <span title={name ?? "Atanmamış"} className={cn("grid size-6 shrink-0 place-items-center rounded-full bg-sidebar text-[10px] font-bold text-white", !name && "bg-muted text-muted-foreground", className)}>
      {name ? initials(name) : "?"}
    </span>
  );
}
