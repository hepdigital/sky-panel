"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCheck,
  ClipboardCheck,
  Clock,
  CreditCard,
  FileText,
  Package,
  Palette,
  Settings2,
  Sparkles,
  Truck,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { Notif, NotifKind } from "@/lib/notifications";
import { cn } from "@/lib/utils";

const kindMeta: Record<NotifKind, { icon: LucideIcon; tone: string }> = {
  design: { icon: Palette, tone: "bg-warning-soft text-warning" },
  quote: { icon: FileText, tone: "bg-primary-soft text-primary" },
  order: { icon: Package, tone: "bg-primary-soft text-primary" },
  shipping: { icon: Truck, tone: "bg-info-soft text-info" },
  payment: { icon: CreditCard, tone: "bg-success-soft text-success" },
  payment_failed: { icon: XCircle, tone: "bg-danger-soft text-danger" },
  approval: { icon: ClipboardCheck, tone: "bg-warning-soft text-warning" },
  late: { icon: Clock, tone: "bg-danger-soft text-danger" },
  system: { icon: Sparkles, tone: "bg-muted text-muted-foreground" },
};

const groups = ["Bugün", "Dün", "Daha önce"] as const;

/** Zil butonu + bildirim paneli. Masaüstünde açılır pencere, mobilde alttan açılan panel. */
export function NotificationCenter({ items, settingsHref }: { items: Notif[]; settingsHref: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [read, setRead] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  // Rol değişince liste değişebilir; görünür olanları hesapla
  const list = items.filter((n) => !dismissed.has(n.id));
  const isUnread = (n: Notif) => !!n.unread && !read.has(n.id);
  const unreadCount = list.filter(isUnread).length;
  const visible = tab === "unread" ? list.filter(isUnread) : list;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (window.matchMedia("(min-width: 768px)").matches && !panelRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const markRead = (id: string) => setRead((s) => new Set(s).add(id));

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          const r = btnRef.current!.getBoundingClientRect();
          setPos({ top: r.bottom + 8, right: Math.max(window.innerWidth - r.right, 12) });
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-label={`Bildirimler${unreadCount ? `, ${unreadCount} okunmamış` : ""}`}
        className={cn(
          "relative inline-flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          open && "bg-muted text-foreground",
        )}
      >
        <Bell className="size-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] leading-4 font-bold text-white ring-2 ring-background">
            {unreadCount}
          </span>
        )}
      </button>

      {open &&
        createPortal(
        <>
          {/* Mobil karartma */}
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Bildirimler"
            style={{ "--nc-top": `${pos?.top ?? 72}px`, "--nc-right": `${pos?.right ?? 16}px` } as React.CSSProperties}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-3xl bg-card text-card-foreground shadow-pop md:inset-x-auto md:top-[var(--nc-top)] md:right-[var(--nc-right)] md:bottom-auto md:max-h-[min(640px,calc(100dvh-var(--nc-top)-16px))] md:w-[420px] md:rounded-2xl md:border md:border-border"
          >
            <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border md:hidden" />

            {/* Başlık */}
            <div className="flex items-center gap-2 px-5 pt-4 pb-3">
              <h3 className="text-base font-bold">Bildirimler</h3>
              {unreadCount > 0 && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">{unreadCount} yeni</span>}
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  disabled={!unreadCount}
                  onClick={() => setRead(new Set(list.map((n) => n.id)))}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft disabled:pointer-events-none disabled:opacity-40"
                >
                  <CheckCheck className="size-4" /> <span className="hidden sm:inline">Tümünü okundu say</span>
                  <span className="sm:hidden">Okundu</span>
                </button>
                <button type="button" onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted md:hidden" aria-label="Kapat">
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Sekmeler */}
            <div className="flex gap-1 border-b border-border px-5">
              {(
                [
                  { key: "all", label: "Tümü", count: list.length },
                  { key: "unread", label: "Okunmamış", count: unreadCount },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={cn("relative h-10 px-2 text-sm font-semibold transition-colors", tab === t.key ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {t.label} <span className="text-[11px] opacity-60">{t.count}</span>
                  {tab === t.key && <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-primary" />}
                </button>
              ))}
            </div>

            {/* Liste */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {visible.length ? (
                groups.map((g) => {
                  const rows = visible.filter((n) => n.group === g);
                  if (!rows.length) return null;
                  return (
                    <section key={g}>
                      <p className="sticky top-0 z-10 bg-card/95 px-5 pt-3 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase backdrop-blur">{g}</p>
                      <ul className="px-2 pb-1">
                        {rows.map((n) => (
                          <Item
                            key={n.id}
                            n={n}
                            unread={isUnread(n)}
                            onOpen={() => {
                              markRead(n.id);
                              setOpen(false);
                            }}
                            onRead={() => markRead(n.id)}
                            onDismiss={() => setDismissed((s) => new Set(s).add(n.id))}
                          />
                        ))}
                      </ul>
                    </section>
                  );
                })
              ) : (
                <div className="flex flex-col items-center px-8 py-14 text-center">
                  <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
                    <BellOff className="size-5" />
                  </span>
                  <p className="mt-3 text-sm font-semibold">Her şey yolunda</p>
                  <p className="mt-1 text-xs text-muted-foreground">Okunmamış bildiriminiz yok.</p>
                </div>
              )}
            </div>

            {/* Alt */}
            <div className="flex items-center justify-between border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3">
              <Link href={settingsHref} onClick={() => setOpen(false)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
                <Settings2 className="size-3.5" /> Bildirim tercihleri
              </Link>
              <span className="text-[11px] text-muted-foreground">E-posta · SMS · WhatsApp</span>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

function Item({ n, unread, onOpen, onRead, onDismiss }: { n: Notif; unread: boolean; onOpen: () => void; onRead: () => void; onDismiss: () => void }) {
  const m = kindMeta[n.kind];
  const Icon = m.icon;
  const urgent = n.kind === "approval" || n.kind === "late" || n.kind === "payment_failed";

  const content = (
    <>
      <span className={cn("relative grid size-10 shrink-0 place-items-center rounded-xl", m.tone)}>
        <Icon className="size-[18px]" />
        {urgent && unread && <AlertTriangle className="absolute -right-1 -bottom-1 size-3.5 rounded-full bg-card p-px text-danger" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className={cn("min-w-0 flex-1 text-sm leading-snug", unread ? "font-semibold" : "font-medium text-foreground/85")}>{n.title}</span>
          <span className="shrink-0 pt-px text-[11px] text-muted-foreground">{n.time}</span>
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{n.body}</span>
      </span>
    </>
  );

  return (
    <li className={cn("group relative rounded-xl transition-colors", unread ? "bg-primary-soft/40 hover:bg-primary-soft/70" : "hover:bg-muted/60")}>
      {n.href ? (
        <Link href={n.href} onClick={onOpen} className="flex gap-3 p-3 pr-8">
          {content}
        </Link>
      ) : (
        <button type="button" onClick={onRead} className="flex w-full gap-3 p-3 pr-8 text-left">
          {content}
        </button>
      )}

      {unread && <span className="pointer-events-none absolute top-4 right-3 size-2 rounded-full bg-primary group-hover:opacity-0" />}
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-2.5 right-1.5 grid size-7 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-card focus-visible:opacity-100"
        aria-label="Bildirimi kaldır"
      >
        <X className="size-3.5" />
      </button>

      {n.actions && (
        <div className="flex flex-wrap gap-2 pr-3 pb-3 pl-16">
          {n.actions.map((a) =>
            a.href ? (
              <Link
                key={a.label}
                href={a.href}
                onClick={onOpen}
                className={cn(
                  "inline-flex h-8 items-center rounded-full px-3.5 text-xs font-semibold transition-colors",
                  a.primary ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "border border-border bg-card hover:bg-muted",
                )}
              >
                {a.label}
              </Link>
            ) : (
              <button
                key={a.label}
                type="button"
                onClick={onRead}
                className={cn(
                  "inline-flex h-8 items-center rounded-full px-3.5 text-xs font-semibold transition-colors",
                  a.primary ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "border border-border bg-card hover:bg-muted",
                )}
              >
                {a.label}
              </button>
            ),
          )}
        </div>
      )}
    </li>
  );
}
