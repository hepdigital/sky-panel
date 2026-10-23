"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Link2, MessageSquare, Plus } from "lucide-react";
import { gorevDurumu } from "@/app/panel/gorevler/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TaskForm } from "./task-form";
import { Avatar, PriorityTag, STATUS, STATUS_ORDER, dueText, type Person, type TaskPriority, type TaskStatus } from "./task-meta";

export type TaskRow = {
  id: number;
  baslik: string;
  durum: TaskStatus;
  oncelik: TaskPriority;
  bitis: string | null;
  atananId: number | null;
  atanan: string | null;
  olusturanId: number | null;
  olusturan: string | null;
  musteriId: number | null;
  musteri: string | null;
  teklifId: number | null;
  teklifNo: string | null;
  siparisId: number | null;
  siparisNo: string | null;
  yorum: number;
  olusturma: string;
  tamamlanma: string | null;
};
type Filter = { kapsam: "bana" | "atadiklarim" | "tumu"; kisi: number | null; tamamlananlar: boolean };
type Create = { musteriId: number | null; teklifId: number | null; siparisId: number | null; label: string | null } | null;

/** İlgili kayıt bağlantısı */
export function related(t: Pick<TaskRow, "teklifId" | "teklifNo" | "siparisId" | "siparisNo" | "musteriId" | "musteri">) {
  if (t.siparisId) return { href: `/panel/siparisler/${t.siparisId}`, text: t.siparisNo ?? "Sipariş" };
  if (t.teklifId) return { href: `/panel/teklifler/${t.teklifId}`, text: t.teklifNo ?? "Teklif" };
  if (t.musteriId) return { href: `/panel/musteriler/${t.musteriId}`, text: t.musteri ?? "Müşteri" };
  return null;
}

/**
 * Görev panosu: dört sütun (yapılacak, devam, beklemede, tamamlandı). Masaüstünde kart sürüklenerek, her yerde kartın
 * durum düğmesiyle taşınır. Kapsam: bana atanan / benim atadıklarım / tümü (yönetici herkesinkini görür).
 */
export function TaskBoard({ me, filter, tasks, people, create }: { me: { id: number; admin: boolean }; filter: Filter; tasks: TaskRow[]; people: Person[]; create: Create }) {
  const router = useRouter();
  const pathname = usePathname();
  const [adding, setAdding] = useState(!!create);
  const [pending, start] = useTransition();
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [local, setLocal] = useState<Record<number, TaskStatus>>({});

  const go = (patch: Partial<Filter>) => {
    const f = { ...filter, ...patch };
    const sp = new URLSearchParams();
    if (f.kapsam !== "bana") sp.set("kapsam", f.kapsam);
    if (f.kisi) sp.set("kisi", String(f.kisi));
    if (f.tamamlananlar) sp.set("tamam", "1");
    router.push(`${pathname}${sp.size ? `?${sp}` : ""}`);
  };
  const move = (id: number, durum: TaskStatus) => {
    setLocal((l) => ({ ...l, [id]: durum }));
    start(async () => {
      await gorevDurumu(id, durum);
      router.refresh();
    });
  };
  const statusOf = (t: TaskRow) => local[t.id] ?? t.durum;

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Görevler</h1>
          <p className="mt-1 text-sm text-muted-foreground">Görev oluşturun, kişiye atayın, durumunu ve yorumlarını buradan takip edin.</p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus /> Yeni görev
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full bg-muted p-1">
          {(
            [
              ["bana", "Bana atanan"],
              ["atadiklarim", "Atadıklarım"],
              ["tumu", me.admin ? "Herkes" : "Tümü"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" onClick={() => go({ kapsam: k, kisi: null })} className={cn("h-9 rounded-full px-4 text-sm font-semibold", filter.kapsam === k ? "bg-card shadow-card" : "text-muted-foreground")}>
              {l}
            </button>
          ))}
        </div>
        {filter.kapsam === "tumu" && (
          <select value={filter.kisi ?? ""} onChange={(e) => go({ kisi: Number(e.target.value) || null })} className="h-10 rounded-full border border-border bg-card px-4 text-sm font-semibold outline-none">
            <option value="">Tüm kişiler</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.adSoyad}
              </option>
            ))}
          </select>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <input type="checkbox" checked={filter.tamamlananlar} onChange={(e) => go({ tamamlananlar: e.target.checked })} className="size-4 accent-[var(--primary)]" />
          30 günden eski tamamlananlar da
        </label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {STATUS_ORDER.map((s) => {
          const st = STATUS[s];
          const Icon = st.icon;
          const items = tasks.filter((t) => statusOf(t) === s);
          return (
            <section
              key={s}
              onDragOver={(e) => {
                if (drag === null) return;
                e.preventDefault();
                setOver(s);
              }}
              onDragLeave={() => setOver((o) => (o === s ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const t = tasks.find((x) => x.id === drag);
                if (t && statusOf(t) !== s) move(t.id, s);
                setDrag(null);
              }}
              className={cn("flex min-h-40 flex-col rounded-2xl bg-muted/50 p-2 transition-colors", over === s && "bg-primary-soft ring-2 ring-primary/40")}
            >
              <h2 className="flex items-center gap-2 px-2 pt-1 pb-2 text-sm font-bold">
                <Icon className="size-4 text-muted-foreground" /> {st.label}
                <span className="ml-auto text-xs font-semibold text-muted-foreground">{items.length}</span>
              </h2>
              <ul className="space-y-2">
                {items.map((t) => (
                  <TaskCard key={t.id} t={t} status={statusOf(t)} pending={pending} onMove={(d) => move(t.id, d)} onDragStart={() => setDrag(t.id)} onDragEnd={() => setDrag(null)} />
                ))}
              </ul>
              {!items.length && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Görev yok</p>}
            </section>
          );
        })}
      </div>

      <TaskForm
        key={adding ? "acik" : "kapali"}
        open={adding}
        onClose={() => {
          setAdding(false);
          if (create) router.replace(pathname);
        }}
        people={people}
        meId={me.id}
        initial={{
          id: null, baslik: "", aciklama: "", atananId: me.id, oncelik: "normal", bitis: null,
          musteriId: create?.musteriId, teklifId: create?.teklifId, siparisId: create?.siparisId, ilgili: create?.label,
        }}
      />
    </div>
  );
}

function TaskCard({ t, status, pending, onMove, onDragStart, onDragEnd }: { t: TaskRow; status: TaskStatus; pending: boolean; onMove: (s: TaskStatus) => void; onDragStart: () => void; onDragEnd: () => void }) {
  const due = dueText(t.bitis, status === "tamam");
  const rel = related(t);
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="group rounded-xl border border-border bg-card p-3 shadow-card"
    >
      <div className="flex items-start gap-2">
        <Link href={`/panel/gorevler/${t.id}`} className={cn("min-w-0 flex-1 text-sm font-semibold leading-snug hover:underline", status === "tamam" && "text-muted-foreground line-through")}>
          {t.baslik}
        </Link>
        <PriorityTag p={t.oncelik} />
      </div>
      {rel && (
        <Link href={rel.href} className="mt-1.5 inline-flex max-w-full items-center gap-1 truncate rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
          <Link2 className="size-3 shrink-0" /> <span className="truncate">{rel.text}</span>
        </Link>
      )}
      <div className="mt-2.5 flex items-center gap-2 text-[11px]">
        <Avatar name={t.atanan} />
        <span className="min-w-0 truncate text-muted-foreground">{t.atanan ?? "Atanmamış"}</span>
        {t.yorum > 0 && (
          <span className="flex items-center gap-0.5 text-muted-foreground">
            <MessageSquare className="size-3" /> {t.yorum}
          </span>
        )}
        {due && (
          <span className={cn("ml-auto flex shrink-0 items-center gap-1", due.cls)}>
            <CalendarDays className="size-3" /> {due.text}
          </span>
        )}
      </div>
      <select
        aria-label="Durum"
        value={status}
        disabled={pending}
        onChange={(e) => onMove(e.target.value as TaskStatus)}
        className="mt-2.5 h-8 w-full rounded-lg border border-border bg-card px-2 text-xs font-semibold text-muted-foreground outline-none focus:border-primary"
      >
        {STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {STATUS[s].label}
          </option>
        ))}
      </select>
    </li>
  );
}
