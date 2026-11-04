"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { File as FileIcon, FileText, Paperclip, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SavedFile = { id: number; ad: string; tur: string; boyut: number; kayitId: number | null; kisiId: number | null };

const MAX = 15_000_000;
export const fileUrl = (id: number, download = false) => `/api/gorev/dosya/${id}${download ? "?indir=1" : ""}`;
const isImage = (tur: string) => tur.startsWith("image/");
export const size = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

/** Panoya kopyalanan ekran görüntüsünün adı yoktur ("image.png"): tarihli ad verilir */
function named(f: File) {
  if (f.name && f.name !== "image.png") return f;
  const ext = f.type.split("/")[1] || "png";
  const stamp = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Istanbul" }).replace(/[: ]/g, "-");
  return new File([f], `ekran-goruntusu-${stamp}.${ext}`, { type: f.type });
}

/** Seçilen dosyalar: ad verilir, 15 MB üstü ayıklanır */
export function prepareFiles(list: Iterable<File>) {
  const all = [...list].map(named);
  const big = all.find((f) => f.size > MAX);
  return { files: all.filter((f) => f.size <= MAX).slice(0, 10), err: big ? `“${big.name}” çok büyük (en çok 15 MB).` : null };
}

/**
 * Eklenecek dosyalar (henüz yüklenmemiş): seçme, sürükle-bırak ve Ctrl+V ile görsel yapıştırma.
 * onPaste / onDrop yazı alanına ya da kapsayıcıya bağlanır.
 */
export function usePendingFiles() {
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const add = useCallback((list: Iterable<File>) => {
    const { files: ok, err } = prepareFiles(list);
    setErr(err);
    if (ok.length) setFiles((old) => [...old, ...ok].slice(0, 10));
  }, []);
  const remove = useCallback((i: number) => setFiles((old) => old.filter((_, j) => j !== i)), []);
  const clear = useCallback(() => setFiles([]), []);
  return {
    files,
    err,
    setErr,
    add,
    remove,
    clear,
    onPaste: (e: React.ClipboardEvent) => {
      const list = [...e.clipboardData.files];
      if (!list.length) return;
      e.preventDefault();
      add(list);
    },
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      add(e.dataTransfer.files);
    },
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes("Files")) e.preventDefault();
    },
  };
}
export type Pending = ReturnType<typeof usePendingFiles>;

/** Dosyaları (ve varsa yorumu) yükler */
export async function uploadFiles(gorevId: number, files: File[], yorum?: string) {
  const form = new FormData();
  form.set("gorev", String(gorevId));
  if (yorum !== undefined) form.set("yorum", yorum);
  for (const f of files) form.append("dosya", f, f.name);
  const r = await fetch("/api/gorev/dosya", { method: "POST", body: form }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { ok: boolean; hata?: string } | null;
  return j ?? { ok: false, hata: "Bağlantı kurulamadı; tekrar deneyin." };
}

/** Ataç düğmesi: dosya seçtirir (telefonda kamera/galeri) */
export function AttachButton({ onPick, className, label, disabled }: { onPick: (files: FileList) => void; className?: string; label?: string; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        className={cn("inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold text-muted-foreground hover:text-foreground", className)}
        title="Dosya ya da görsel ekle (Ctrl+V ile görsel yapıştırılabilir)"
      >
        <Paperclip className="size-4" />
        {label}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) onPick(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}

/** Eklenecek dosyaların önizlemesi */
export function PendingList({ pending }: { pending: Pending }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const list = pending.files.map((f) => (isImage(f.type) ? URL.createObjectURL(f) : ""));
    queueMicrotask(() => setUrls(list));
    return () => list.forEach((u) => u && URL.revokeObjectURL(u));
  }, [pending.files]);
  if (!pending.files.length && !pending.err) return null;
  return (
    <div className="space-y-2">
      {pending.files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {pending.files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="relative">
              {urls[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls[i]} alt={f.name} className="size-16 rounded-lg border border-border object-cover" />
              ) : (
                <span className="flex h-16 w-32 flex-col justify-center rounded-lg border border-border bg-muted/50 px-2 text-[11px]">
                  <span className="truncate font-semibold">{f.name}</span>
                  <span className="text-muted-foreground">{size(f.size)}</span>
                </span>
              )}
              <button type="button" onClick={() => pending.remove(i)} className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background" aria-label="Kaldır">
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {pending.err && <p className="text-xs font-medium text-danger">{pending.err}</p>}
    </div>
  );
}

/** Kayıtlı ekler: görseller küçük resim (dokununca büyük açılır), diğerleri satır */
export function FileList({ files, canDelete, onDelete, compact }: { files: SavedFile[]; canDelete: (f: SavedFile) => boolean; onDelete: (f: SavedFile) => void; compact?: boolean }) {
  if (!files.length) return null;
  const images = files.filter((f) => isImage(f.tur));
  const others = files.filter((f) => !isImage(f.tur));
  return (
    <div className={cn("space-y-2", compact ? "mt-2" : "mt-3")}>
      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {images.map((f) => (
            <li key={f.id} className="group relative">
              <a href={fileUrl(f.id)} target="_blank" rel="noreferrer" title={f.ad}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(f.id)} alt={f.ad} loading="lazy" className={cn("rounded-lg border border-border bg-muted object-cover", compact ? "size-20" : "size-28")} />
              </a>
              {canDelete(f) && <DeleteButton f={f} onDelete={onDelete} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 max-md:opacity-100" />}
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <ul className="space-y-1.5">
          {others.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-sm">
              {f.tur === "application/pdf" ? <FileText className="size-4 shrink-0 text-muted-foreground" /> : <FileIcon className="size-4 shrink-0 text-muted-foreground" />}
              <a href={fileUrl(f.id, f.tur !== "application/pdf")} target={f.tur === "application/pdf" ? "_blank" : undefined} rel="noreferrer" className="min-w-0 flex-1 truncate font-medium hover:underline">
                {f.ad}
              </a>
              <span className="shrink-0 text-xs text-muted-foreground">{size(f.boyut)}</span>
              {canDelete(f) && <DeleteButton f={f} onDelete={onDelete} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeleteButton({ f, onDelete, className }: { f: SavedFile; onDelete: (f: SavedFile) => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => confirm(`“${f.ad}” silinsin mi?`) && onDelete(f)}
      className={cn("grid size-7 shrink-0 place-items-center rounded-full bg-card/90 text-muted-foreground shadow-card hover:text-danger", className)}
      aria-label="Dosyayı sil"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}
