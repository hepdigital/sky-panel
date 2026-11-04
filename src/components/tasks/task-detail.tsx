"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, Circle, Link2, Pencil, Repeat as RepeatIcon, Send, Trash2 } from "lucide-react";
import { gorevDosyaSil, gorevDurumu, gorevSil, gorevYorum } from "@/app/panel/gorevler/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";
import { related, type TaskRow } from "./task-board";
import { AttachButton, FileList, PendingList, prepareFiles, uploadFiles, usePendingFiles, type SavedFile } from "./task-files";
import { TaskForm } from "./task-form";
import { Avatar, PriorityTag, STATUS, STATUS_ORDER, dueText, type Person } from "./task-meta";

type Entry = { id: number; tip: "yorum" | "olay"; metin: string; olusturma: string; kisi: string | null; kisiId: number | null };
type Task = TaskRow & { aciklama: string | null; kayitlar: Entry[]; dosyalar: SavedFile[] };

const when = (iso: string) => formatDate(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Görev ayrıntısı: durum, atananlar, açıklama ve ekler, yorumlar (ekli) ve geçmiş */
export function TaskDetail({ me, people, task: t }: { me: { id: number; admin: boolean }; people: Person[]; task: Task }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const comment = usePendingFiles();
  const [uploading, setUploading] = useState(false);
  const due = dueText(t.bitis, t.durum === "tamam");
  const rel = related(t);
  const canDelete = me.admin || t.olusturanId === me.id;
  const each = t.tamamlama === "kisi" && t.atananlar.length > 1;
  const mine = t.atananlar.find((a) => a.id === me.id);
  const taskFiles = t.dosyalar.filter((f) => !f.kayitId);
  const canDeleteFile = (f: SavedFile) => me.admin || f.kisiId === me.id;

  const run = (fn: () => Promise<{ ok: boolean; hata?: string; mesaj?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setErr(r.hata ?? "İşlem yapılamadı.");
      setErr(null);
      setNote(r.mesaj ?? null);
      after?.();
      router.refresh();
    });

  // Göreve eklenen dosyalar seçilir seçilmez yüklenir
  async function attachNow(list: Iterable<File>) {
    const { files, err: tooBig } = prepareFiles(list);
    setErr(tooBig);
    if (!files.length) return;
    setUploading(true);
    const r = await uploadFiles(t.id, files);
    setUploading(false);
    if (!r.ok) return setErr(r.hata ?? "Dosya eklenemedi.");
    router.refresh();
  }

  // Yazı alanı dışında Ctrl+V: görsel yoruma eklenir
  const { add: addToComment } = comment;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, [contenteditable]") || !e.clipboardData?.files.length) return;
      e.preventDefault();
      addToComment(e.clipboardData.files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [addToComment]);

  async function send() {
    setSending(true);
    const r = comment.files.length ? await uploadFiles(t.id, comment.files, text) : await gorevYorum(t.id, text);
    setSending(false);
    if (!r.ok) return setErr(r.hata ?? "Yorum eklenemedi.");
    setErr(null);
    setText("");
    comment.clear();
    router.refresh();
  }

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
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            {t.tekrarId && (
              <span className="inline-flex items-center gap-1 font-medium">
                <RepeatIcon className="size-3.5" /> Tekrarlayan görev ·
              </span>
            )}
            {t.olusturan ?? "—"} oluşturdu · {when(t.olusturma)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil /> Düzenle
          </Button>
          {canDelete && (
            <Button variant="ghost" disabled={pending} onClick={() => confirm("Görev silinsin mi?") && run(() => gorevSil(t.id), () => router.push("/panel/gorevler"))}>
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
            const active = each && mine && s === "tamam" ? mine.tamam : t.durum === s;
            return (
              <button
                key={s}
                type="button"
                disabled={pending}
                onClick={() => run(() => gorevDurumu(t.id, s))}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
                )}
              >
                <Icon className="size-4" /> {each && mine && s === "tamam" ? "Payımı bitirdim" : st.label}
              </button>
            );
          })}
        </div>
        {note && <p className="mt-3 rounded-xl bg-primary-soft px-3 py-2 text-xs font-semibold text-primary-soft-foreground">{note}</p>}
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">{t.atananlar.length > 1 ? (each ? "Atananlar · herkes ayrı tamamlar" : "Atananlar · ortak iş") : "Atanan"}</dt>
            <dd className="mt-1 space-y-1.5 font-semibold">
              {!t.atananlar.length && (
                <span className="flex items-center gap-2">
                  <Avatar name={null} /> Atanmamış
                </span>
              )}
              {t.atananlar.map((a) => (
                <span key={a.id} className="flex items-center gap-2">
                  <Avatar name={a.ad} /> {a.ad}
                  {each &&
                    (a.tamam ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                        <CheckCircle2 className="size-3.5" /> bitirdi
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        <Circle className="size-3.5" /> bekliyor
                      </span>
                    ))}
                </span>
              ))}
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
        <div
          className="mt-4 border-t border-border pt-4"
          onDragOver={comment.onDragOver}
          onDrop={(e) => {
            if (!e.dataTransfer.files.length) return;
            e.preventDefault();
            void attachNow(e.dataTransfer.files);
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold text-muted-foreground">Ekler{taskFiles.length ? ` (${taskFiles.length})` : ""}</h2>
            <AttachButton onPick={(l) => void attachNow(l)} disabled={uploading} label={uploading ? "Yükleniyor…" : "Dosya ekle"} className="h-8 text-xs" />
          </div>
          {!taskFiles.length && <p className="mt-1 text-xs text-muted-foreground">Görsel, PDF ya da dosya ekleyin; buraya sürükleyip bırakabilirsiniz.</p>}
          <FileList files={taskFiles} canDelete={canDeleteFile} onDelete={(f) => run(() => gorevDosyaSil(f.id))} />
        </div>
        {err && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{err}</p>}
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="text-[15px] font-semibold">Yorumlar ve geçmiş</h2>
        <ul className="mt-3 space-y-3">
          {t.kayitlar.map((k) =>
            k.tip === "olay" ? (
              <li key={k.id} className="pl-8 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground/80">{k.kisi ?? "SKY Panel"}</span> {k.metin.charAt(0).toLocaleLowerCase("tr") + k.metin.slice(1)} · {when(k.olusturma)}
              </li>
            ) : (
              <li key={k.id} className="flex gap-2.5">
                <Avatar name={k.kisi} className="mt-0.5" />
                <div className="min-w-0 flex-1 rounded-xl bg-muted/60 px-3 py-2">
                  <p className="text-xs">
                    <span className="font-semibold">{k.kisi ?? "—"}</span> <span className="text-muted-foreground">· {when(k.olusturma)}</span>
                  </p>
                  {k.metin && <p className="mt-0.5 whitespace-pre-line text-sm">{k.metin}</p>}
                  <FileList files={t.dosyalar.filter((f) => f.kayitId === k.id)} canDelete={canDeleteFile} onDelete={(f) => run(() => gorevDosyaSil(f.id))} compact />
                </div>
              </li>
            ),
          )}
        </ul>
        <div className="mt-4 space-y-2" onDrop={comment.onDrop} onDragOver={comment.onDragOver}>
          <PendingList pending={comment} />
          <div className="flex items-end gap-2">
            <AttachButton onPick={comment.add} />
            <textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={comment.onPaste}
              placeholder="Yorum yazın… Görseli Ctrl+V ile yapıştırabilirsiniz."
              className="min-w-0 flex-1 resize-none rounded-xl border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <Button disabled={sending || (!text.trim() && !comment.files.length)} onClick={send}>
              <Send /> {sending ? "Gönderiliyor…" : "Gönder"}
            </Button>
          </div>
        </div>
      </Card>

      <TaskForm
        key={editing ? "acik" : "kapali"}
        open={editing}
        onClose={() => setEditing(false)}
        people={people}
        meId={me.id}
        initial={{ id: t.id, baslik: t.baslik, aciklama: t.aciklama ?? "", atananlar: t.atananlar.map((a) => a.id), tamamlama: t.tamamlama, oncelik: t.oncelik, bitis: t.bitis, ilgili: rel?.text }}
      />
    </div>
  );
}
