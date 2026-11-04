"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Link2, MessageSquare, Paperclip, Pencil, Plus, Repeat as RepeatIcon } from "lucide-react";
import { gorevDurumu } from "@/app/panel/gorevler/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TaskForm } from "./task-form";
import { AvatarStack, PriorityTag, STATUS, STATUS_ORDER, assigneeNames, dueText, repeatText, type Assignee, type Person, type Repeat, type TaskMode, type TaskPriority, type TaskStatus } from "./task-meta";

export type TaskRow = {
  id: number;
  baslik: string;
  durum: TaskStatus;
  oncelik: TaskPriority;
  bitis: string | null;
  atananlar: Assignee[];
  tamamlama: TaskMode;
  tekrarId: number | null;
  olusturanId: number | null;
  olusturan: string | null;
  musteriId: number | null;
  musteri: string | null;
  teklifId: number | null;
  teklifNo: string | null;
  siparisId: number | null;
  siparisNo: string | null;
  yorum: number;
  dosya: number;
  olusturma: string;
  tamamlanma: string | null;
};
export type TemplateRow = {
  id: number;
  baslik: string;
  aciklama: string | null;
  oncelik: TaskPriority;
  tamamlama: TaskMode;
  atananlar: { id: number; ad: string }[];
  olusturanId: number | null;
  siklik: Repeat["siklik"];
  gunler: number[];
  aktif: boolean;
  sonraki: string | null;
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
export function TaskBoard({ me, filter, tasks, people, create, templates }: { me: { id: number; admin: boolean }; filter: Filter; tasks: TaskRow[]; people: Person[]; create: Create; templates: TemplateRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [adding, setAdding] = useState(!!create);
  const [pending, start] = useTransition();
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [local, setLocal] = useState<Record<number, TaskStatus>>({});
  const [tpl, setTpl] = useState<TemplateRow | null>(null);
  const [note, setNote] = useState<string | null>(null);

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
      const r = await gorevDurumu(id, durum);
      setNote(r.ok ? (r.mesaj ?? null) : r.hata);
      setLocal((l) => {
        const n = { ...l };
        delete n[id];
        return n;
      });
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

      {note && (
        <p className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-primary-soft px-3 py-2 text-xs font-semibold text-primary-soft-foreground">
          {note}
          <button type="button" onClick={() => setNote(null)} className="text-muted-foreground">
            Kapat
          </button>
        </p>
      )}

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
                  <TaskCard key={t.id} t={t} meId={me.id} status={statusOf(t)} pending={pending} onMove={(d) => move(t.id, d)} onDragStart={() => setDrag(t.id)} onDragEnd={() => setDrag(null)} />
                ))}
              </ul>
              {!items.length && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Görev yok</p>}
            </section>
          );
        })}
      </div>

      {templates.length > 0 && <Templates templates={templates} me={me} onEdit={setTpl} />}

      {tpl && (
        <TaskForm
          key={`tekrar-${tpl.id}`}
          open
          onClose={() => setTpl(null)}
          people={people}
          meId={me.id}
          initial={{
            id: null, baslik: tpl.baslik, aciklama: tpl.aciklama ?? "", atananlar: tpl.atananlar.map((a) => a.id), tamamlama: tpl.tamamlama, oncelik: tpl.oncelik, bitis: null,
            tekrarId: tpl.id, tekrar: { siklik: tpl.siklik, gunler: tpl.gunler }, aktif: tpl.aktif,
          }}
        />
      )}

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
          id: null, baslik: "", aciklama: "", atananlar: [me.id], tamamlama: "ortak", oncelik: "normal", bitis: null,
          musteriId: create?.musteriId, teklifId: create?.teklifId, siparisId: create?.siparisId, ilgili: create?.label,
        }}
      />
    </div>
  );
}

function TaskCard({ t, meId, status, pending, onMove, onDragStart, onDragEnd }: { t: TaskRow; meId: number; status: TaskStatus; pending: boolean; onMove: (s: TaskStatus) => void; onDragStart: () => void; onDragEnd: () => void }) {
  const due = dueText(t.bitis, status === "tamam");
  const rel = related(t);
  const each = t.tamamlama === "kisi" && t.atananlar.length > 1;
  const done = t.atananlar.filter((a) => a.tamam).length;
  const mineDone = each && t.atananlar.some((a) => a.id === meId && a.tamam);
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
      {(each || t.tekrarId) && (
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          {t.tekrarId && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5">
              <RepeatIcon className="size-3" /> Tekrarlayan
            </span>
          )}
          {each && status !== "tamam" && (
            <span className={cn("rounded-md px-1.5 py-0.5", mineDone ? "bg-success-soft text-success" : "bg-muted")}>
              {done}/{t.atananlar.length} bitirdi{mineDone ? " · siz bitirdiniz" : ""}
            </span>
          )}
        </p>
      )}
      <div className="mt-2.5 flex items-center gap-2 text-[11px]">
        <AvatarStack people={t.atananlar} showDone={each} />
        <span className="min-w-0 truncate text-muted-foreground">{assigneeNames(t.atananlar)}</span>
        {t.yorum > 0 && (
          <span className="flex items-center gap-0.5 text-muted-foreground">
            <MessageSquare className="size-3" /> {t.yorum}
          </span>
        )}
        {t.dosya > 0 && (
          <span className="flex items-center gap-0.5 text-muted-foreground">
            <Paperclip className="size-3" /> {t.dosya}
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

/** Tekrarlayan görev tanımları: günleri, kime gittiği ve sonraki gün */
function Templates({ templates, me, onEdit }: { templates: TemplateRow[]; me: { id: number; admin: boolean }; onEdit: (t: TemplateRow) => void }) {
  return (
    <section className="mt-6">
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        <RepeatIcon className="size-4 text-muted-foreground" /> Tekrarlayan görevler
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">Seçilen günlerin sabahı ilgili kişilerin listesine görev olarak düşer.</p>
      <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => {
          const canEdit = me.admin || t.olusturanId === me.id;
          return (
            <li key={t.id} className={cn("flex items-start gap-3 rounded-xl border border-border bg-card p-3 shadow-card", !t.aktif && "opacity-60")}>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <span className="truncate">{t.baslik}</span>
                  <PriorityTag p={t.oncelik} />
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {repeatText({ siklik: t.siklik, gunler: t.gunler })} · {t.atananlar.map((a) => a.ad).join(", ")}
                  {t.atananlar.length > 1 && t.tamamlama === "kisi" ? " (herkes ayrı)" : ""}
                </p>
                <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                  {t.aktif ? (t.sonraki ? `Sonraki: ${new Date(`${t.sonraki}T12:00:00`).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}` : "—") : "Durduruldu"}
                </p>
              </div>
              {canEdit && (
                <button type="button" onClick={() => onEdit(t)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Düzenle">
                  <Pencil className="size-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
