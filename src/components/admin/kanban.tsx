"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Filter, GripVertical, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { adminOrders, type AdminOrder } from "@/lib/admin-mock";
import { paymentStatusMeta, type ProductionStatus } from "@/lib/mock";
import { cn, formatDate, formatTRY } from "@/lib/utils";
import { initialsOf } from "./customer-list";
import { useRole } from "./role-context";

const columns: { key: ProductionStatus; label: string; hint: string; owner: string }[] = [
  { key: "awaiting_approval", label: "Onay bekliyor", hint: "Ödeme / limit kontrolü", owner: "Finans" },
  { key: "design", label: "Tasarım", hint: "Baskı dosyası hazırlanıyor", owner: "Burak Aydın" },
  { key: "design_review", label: "Müşteri onayı", hint: "Portalda müşteride", owner: "Müşteri onayı" },
  { key: "production", label: "Üretim", hint: "Baskı ve dikim", owner: "Hakan Öz" },
  { key: "ready", label: "Sevke hazır", hint: "Paketlendi", owner: "Murat Şen" },
  { key: "shipped", label: "Kargoda", hint: "Teslimat bekleniyor", owner: "Aras Kargo" },
];

type Toast = { tone: "success" | "danger"; text: string };

export function Kanban() {
  const { user, role } = useRole();
  const [orders, setOrders] = useState<AdminOrder[]>(adminOrders);
  const [q, setQ] = useState("");
  const [onlyLate, setOnlyLate] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<ProductionStatus | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const visible = useMemo(() => {
    const query = q.trim().toLocaleLowerCase("tr");
    return orders.filter(
      (o) => (!onlyLate || o.late) && (!query || `${o.id} ${o.customer} ${o.items}`.toLocaleLowerCase("tr").includes(query)),
    );
  }, [orders, q, onlyLate]);

  function move(id: string, to: ProductionStatus) {
    const o = orders.find((x) => x.id === id);
    if (!o || o.production === to) return;
    // İş kuralı: onay bekleyen sipariş finans/yönetici onayı olmadan ilerletilemez.
    if (o.production === "awaiting_approval" && o.needsApproval && role !== "admin" && role !== "finance") {
      setToast({ tone: "danger", text: `${o.id} finans onayı bekliyor; ilerletme yetkiniz yok.` });
      return;
    }
    const col = columns.find((c) => c.key === to)!;
    setOrders((list) => list.map((x) => (x.id === id ? { ...x, production: to, needsApproval: undefined, owner: col.owner } : x)));
    setToast({ tone: "success", text: `${o.id} → ${col.label} · ${user.user} · şimdi` });
  }

  function next(o: AdminOrder) {
    const i = columns.findIndex((c) => c.key === o.production);
    if (i < columns.length - 1) move(o.id, columns[i + 1].key);
  }

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Üretim panosu</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kartları sürükleyerek aşama değiştirin. Her hareket kullanıcı ve saat bilgisiyle kaydedilir.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-border bg-card px-4 text-sm shadow-card focus-within:ring-2 focus-within:ring-ring sm:max-w-xs">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sipariş, müşteri, ürün" className="w-full bg-transparent outline-none placeholder:text-muted-foreground" />
        </label>
        <button
          type="button"
          onClick={() => setOnlyLate((v) => !v)}
          className={cn(
            "flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors",
            onlyLate ? "border-transparent bg-danger text-white" : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          <Clock className="size-4" /> Gecikenler
          <span className="text-[11px] opacity-80">{orders.filter((o) => o.late).length}</span>
        </button>
        <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
          <Filter className="size-3.5" /> {visible.length} sipariş
        </span>
      </div>

      {/* Pano */}
      <div className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        {columns.map((col) => {
          const cards = visible.filter((o) => o.production === col.key);
          const late = cards.filter((c) => c.late).length;
          const total = cards.reduce((s, c) => s + c.total, 0);
          return (
            <section
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setOverCol(col.key);
              }}
              onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) move(dragId, col.key);
                setDragId(null);
                setOverCol(null);
              }}
              className={cn(
                "flex w-[82vw] max-w-[300px] shrink-0 snap-start flex-col rounded-2xl bg-muted/60 p-2 transition-colors sm:w-[280px]",
                overCol === col.key && "bg-primary-soft ring-2 ring-primary/30",
              )}
            >
              <header className="px-2 pt-2 pb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">{col.label}</h2>
                  <span className="grid min-w-5 place-items-center rounded-full bg-card px-1.5 text-[11px] font-bold shadow-card">{cards.length}</span>
                  {late > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-bold text-danger">
                      <Clock className="size-2.5" /> {late}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {col.hint} · <span className="tabular">{formatTRY(total, { whole: true })}</span>
                </p>
              </header>

              <ul className="flex min-h-24 flex-1 flex-col gap-2">
                {cards.map((o) => (
                  <li
                    key={o.id}
                    draggable
                    onDragStart={() => setDragId(o.id)}
                    onDragEnd={() => setDragId(null)}
                    className={cn(
                      "group cursor-grab rounded-xl border bg-card p-3 shadow-card transition-all active:cursor-grabbing",
                      o.late ? "border-danger/40" : "border-border/70",
                      dragId === o.id && "rotate-1 opacity-60",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[11px] font-semibold text-muted-foreground">{o.id}</p>
                      <GripVertical className="size-4 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <p className="mt-0.5 truncate text-sm font-semibold">{o.customer}</p>
                    <p className="truncate text-xs text-muted-foreground">{o.items}</p>

                    {o.needsApproval && (
                      <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-warning-soft px-2 py-1.5 text-[11px] font-semibold text-warning">
                        <AlertTriangle className="size-3.5" /> {o.needsApproval === "limit" ? "Limit aşımı · onay gerekli" : "Vadesi geçmiş borç · onay gerekli"}
                      </p>
                    )}

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={paymentStatusMeta[o.payment].tone}>{paymentStatusMeta[o.payment].label}</Badge>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
                      <span className={cn("inline-flex items-center gap-1 text-xs", o.late ? "font-semibold text-danger" : "text-muted-foreground")}>
                        <Clock className="size-3.5" />
                        {formatDate(o.dueDate, { day: "numeric", month: "short" })}
                        {o.late && " · gecikti"}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {o.owner && (
                          <span title={o.owner} className="grid size-6 place-items-center rounded-full bg-muted text-[9px] font-bold">
                            {initialsOf(o.owner)}
                          </span>
                        )}
                        {col.key !== "shipped" && (
                          <button
                            type="button"
                            onClick={() => next(o)}
                            className="grid size-7 place-items-center rounded-full bg-primary-soft text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                            aria-label="Sonraki aşamaya taşı"
                            title="Sonraki aşama"
                          >
                            <ArrowRight className="size-3.5" />
                          </button>
                        )}
                      </span>
                    </div>
                  </li>
                ))}
                {!cards.length && (
                  <li className="grid flex-1 place-items-center rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    Buraya sürükleyin
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>

      {toast && (
        <div className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-inverse px-4 py-3 text-sm text-inverse-foreground shadow-pop md:bottom-6">
          {toast.tone === "success" ? <CheckCircle2 className="size-5 shrink-0 text-[#6ee7a8]" /> : <AlertTriangle className="size-5 shrink-0 text-[#ffb4b4]" />}
          <span className="min-w-0 flex-1">{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Kapat" className="text-white/60 hover:text-white">
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
