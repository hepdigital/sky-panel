"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, Link2, Pencil, Send, Trash2 } from "lucide-react";
import { gorevDurumu, gorevSil, gorevYorum } from "@/app/panel/gorevler/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";
import { related, type TaskRow } from "./task-board";
import { TaskForm } from "./task-form";
import { Avatar, PriorityTag, STATUS, STATUS_ORDER, dueText, type Person } from "./task-meta";

type Entry = { id: number; tip: "yorum" | "olay"; metin: string; olusturma: string; kisi: string | null; kisiId: number | null };
type Task = TaskRow & { aciklama: string | null; kayitlar: Entry[] };

const when = (iso: string) => formatDate(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Görev ayrıntısı: durum, bilgiler, açıklama, yorumlar ve geçmiş */
export function TaskDetail({ me, people, task: t }: { me: { id: number; admin: boolean }; people: Person[]; task: Task }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const due = dueText(t.bitis, t.durum === "tamam");
  const rel = related(t);
  const canDelete = me.admin || t.olusturanId === me.id;

  const run = (fn: () => Promise<{ ok: boolean; hata?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setErr(r.hata ?? "İşlem yapılamadı.");
      setErr(null);
      after?.();
      router.refresh();
    });

  return (
    <div className="mx-auto max-w-[1000px]">
      <Link href="/panel/gorevler" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Görevler
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight md:text-[28px]">
            {t.baslik} <PriorityTag p={t.oncelik} />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.olusturan ?? "—"} oluşturdu · {when(t.olusturma)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil /> Düzenle
          </Button>
          {canDelete && (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => confirm("Görev silinsin mi?") && run(() => gorevSil(t.id), () => router.push("/panel/gorevler"))}
            >
              <Trash2 /> Sil
            </Button>
          )}
        </div>
      </div>

      <Card className="mt-5 p-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STATUS_ORDER.map((s) => {
            const st = STATUS[s];
            const Icon = st.icon;
            return (
              <button
                key={s}
                type="button"
                disabled={pending}
                onClick={() => run(() => gorevDurumu(t.id, s))}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors",
                  t.durum === s ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
                )}
              >
                <Icon className="size-4" /> {st.label}
              </button>
            );
          })}
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Atanan</dt>
            <dd className="mt-0.5 flex items-center gap-2 font-semibold">
              <Avatar name={t.atanan} /> {t.atanan ?? "Atanmamış"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Son tarih</dt>
            <dd className={cn("mt-0.5 flex items-center gap-1.5 font-semibold", due?.cls)}>
              <CalendarDays className="size-4" /> {t.bitis ? `${new Date(`${t.bitis}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}${due ? ` · ${due.text}` : ""}` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">İlgili kayıt</dt>
            <dd className="mt-0.5 font-semibold">
              {rel ? (
                <Link href={rel.href} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                  <Link2 className="size-4" /> {rel.text}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
        {t.aciklama && <p className="mt-4 whitespace-pre-line border-t border-border pt-4 text-sm leading-relaxed">{t.aciklama}</p>}
        {err && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{err}</p>}
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="text-[15px] font-semibold">Yorumlar ve geçmiş</h2>
        <ul className="mt-3 space-y-3">
          {t.kayitlar.map((k) =>
            k.tip === "olay" ? (
              <li key={k.id} className="pl-8 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground/80">{k.kisi ?? "—"}</span> {k.metin.charAt(0).toLocaleLowerCase("tr") + k.metin.slice(1)} · {when(k.olusturma)}
              </li>
            ) : (
              <li key={k.id} className="flex gap-2.5">
                <Avatar name={k.kisi} className="mt-0.5" />
                <div className="min-w-0 flex-1 rounded-xl bg-muted/60 px-3 py-2">
                  <p className="text-xs">
                    <span className="font-semibold">{k.kisi ?? "—"}</span> <span className="text-muted-foreground">· {when(k.olusturma)}</span>
                  </p>
                  <p className="mt-0.5 whitespace-pre-line text-sm">{k.metin}</p>
                </div>
              </li>
            ),
          )}
        </ul>
        <div className="mt-4 flex items-end gap-2">
          <textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Yorum yazın… (ne yapıldı, ne bekleniyor)"
            className="min-w-0 flex-1 resize-none rounded-xl border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <Button disabled={pending || !text.trim()} onClick={() => run(() => gorevYorum(t.id, text), () => setText(""))}>
            <Send /> Gönder
          </Button>
        </div>
      </Card>

      <TaskForm
        key={editing ? "acik" : "kapali"}
        open={editing}
        onClose={() => setEditing(false)}
        people={people}
        meId={me.id}
        initial={{ id: t.id, baslik: t.baslik, aciklama: t.aciklama ?? "", atananId: t.atananId, oncelik: t.oncelik, bitis: t.bitis, ilgili: rel?.text }}
      />
    </div>
  );
}
