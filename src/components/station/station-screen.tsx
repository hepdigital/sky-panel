"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileImage,
  Flame,
  Info,
  LayoutGrid,
  MessageSquareWarning,
  Play,
  RotateCcw,
  Send,
  Timer,
  Truck,
  UserCheck,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet } from "@/components/ui/sheet";
import {
  carriers,
  isAtStation,
  jobProgress,
  nextStage,
  stageLabel,
  stationProgress,
  stations,
  type Job,
  type JobItem,
  type PlanDay,
  type StationKey,
} from "@/lib/station-data";
import { cn } from "@/lib/utils";
import { useStations } from "./store";

const CAPACITY = 8;
const ORDER: StationKey[] = ["design", "print", "production", "shipping"];

const planTabs: { key: PlanDay; label: string }[] = [
  { key: "today", label: "Bugün" },
  { key: "tomorrow", label: "Yarın" },
  { key: "week", label: "Bu hafta" },
];

export function StationScreen({ station }: { station: StationKey }) {
  const cfg = stations[station];
  const store = useStations();
  const { ready, jobs } = store;
  const [plan, setPlan] = useState<PlanDay>("today");
  const [problemFor, setProblemFor] = useState<Job | null>(null);
  const [shipFor, setShipFor] = useState<Job | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const here = jobs.filter((j) => isAtStation(j, station));
  const blocked = here.filter((j) => j.blocked[station]);
  const active = here.filter((j) => j.active.includes(station) && !j.blocked[station]);
  const waitingAll = here.filter((j) => !j.active.includes(station) && !j.blocked[station]).sort((a, b) => score(b) - score(a));
  const waiting = waitingAll.filter((j) => j.plan === plan);
  const doneToday = jobs.filter((j) => j.doneToday.includes(station) && !isAtStation(j, station));
  const review = station === "design" ? jobs.filter((j) => j.items.some((i) => i.stage === "customer_review")) : [];
  const itemsWaiting = here.reduce((s, j) => s + j.items.filter((i) => i.stage === station && !i.done.includes(station)).length, 0);
  const todayLoad = here.filter((j) => j.plan === "today").length;

  function onToggle(j: Job, it: JobItem) {
    const marking = !it.done.includes(station);
    store.toggleItem(j.id, it.id, station);
    if (!marking) return setToast(`${it.name} · geri alındı`);
    const moves = station === "print" || station === "production";
    const remaining = j.items.filter((i) => i.stage === station && i.id !== it.id);
    if (moves && remaining.length === 0) setToast(`${j.id} · ${cfg.title.toLocaleLowerCase("tr")} tamamlandı, iş kapandı`);
    else if (moves) setToast(`${it.name} · ${cfg.itemDoneShort} → ${stageLabel[nextStage(it, station)]}`);
    else setToast(`${it.name} · ${cfg.itemDoneShort}`);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ── Üst bar ── */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 md:h-[72px] md:px-6">
          <Link href="/istasyon" className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-card shadow-card" aria-label="İstasyonlar">
            <LayoutGrid className="size-5" />
          </Link>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-lg leading-tight font-bold md:text-xl">
              <span className={cn("size-2.5 rounded-full", cfg.dot)} /> {cfg.title}
            </p>
            <p className="text-xs text-muted-foreground">İstasyon ekranı</p>
          </div>
          <LiveClock className="mx-auto hidden md:block" />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <div className="flex items-center gap-2.5 rounded-full border border-border bg-card p-1 pr-3 shadow-card">
              <span data-panel="admin" className="grid size-8 place-items-center rounded-full bg-sidebar text-xs font-bold text-white">
                {cfg.initials}
              </span>
              <span className="hidden text-sm font-semibold sm:block">{cfg.operator}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-4 md:px-6 md:py-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Counter label="Sıradaki iş" value={waitingAll.length} hint={`${itemsWaiting} kalem bekliyor`} />
          <Counter label="Üzerinde" value={active.length} tone="primary" />
          <Counter label="Bekletilen" value={blocked.length} tone={blocked.length ? "danger" : undefined} />
          <Counter label="Bugün tamamlanan" value={doneToday.length} tone="success" />
        </div>

        {(station === "production" || station === "print") && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-full bg-muted p-1">
              {planTabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setPlan(t.key)}
                  className={cn("h-10 rounded-full px-5 text-sm font-semibold transition-colors", plan === t.key ? "bg-card shadow-card" : "text-muted-foreground")}
                >
                  {t.label}
                  <span className="ml-1.5 text-xs opacity-60">{waitingAll.filter((j) => j.plan === t.key).length}</span>
                </button>
              ))}
            </div>
            <div className="flex min-w-56 flex-1 items-center gap-3 md:max-w-sm">
              <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">Bugünkü kapasite</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", todayLoad > CAPACITY ? "bg-danger" : todayLoad > CAPACITY * 0.8 ? "bg-warning" : "bg-success")}
                  style={{ width: `${Math.min((todayLoad / CAPACITY) * 100, 100)}%` }}
                />
              </div>
              <span className="tabular text-sm font-bold">
                {todayLoad}/{CAPACITY}
              </span>
            </div>
          </div>
        )}

        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-6">
          {/* ── Üzerinde çalışılan ── */}
          <section className="space-y-3 lg:order-2">
            <h2 className="flex items-center gap-2 text-sm font-bold tracking-wide text-muted-foreground uppercase">
              <Timer className="size-4" /> Üzerinde çalıştığım
            </h2>
            {!ready ? (
              <div className="h-80 animate-pulse rounded-3xl bg-muted" />
            ) : active.length ? (
              active.map((j) => (
                <ActiveCard
                  key={j.id}
                  job={j}
                  station={station}
                  onToggle={(it) => onToggle(j, it)}
                  onSend={() => {
                    store.sendForApproval(j.id);
                    setToast(`${j.id} · tasarımlar müşteri onayına gönderildi`);
                  }}
                  onShip={() => setShipFor(j)}
                  onProblem={() => setProblemFor(j)}
                />
              ))
            ) : (
              <div className="flex flex-col items-center rounded-3xl border-2 border-dashed border-border px-6 py-12 text-center">
                <span className="grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">
                  <Play className="size-6" />
                </span>
                <p className="mt-3 text-lg font-bold">Şu an aktif iş yok</p>
                <p className="mt-1 text-sm text-muted-foreground">Sıradaki işi başlatarak devam edin.</p>
                {waiting[0] && (
                  <BigButton className="mt-5 w-full max-w-sm" onClick={() => store.start(waiting[0].id, station)}>
                    <Play /> Sıradakini başlat · {waiting[0].id}
                  </BigButton>
                )}
              </div>
            )}

            {blocked.map((j) => (
              <div key={j.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger/30 bg-danger-soft/60 p-4">
                <AlertTriangle className="size-6 shrink-0 text-danger" />
                <div className="min-w-0 flex-1 basis-48">
                  <p className="font-bold">
                    {j.id} · {j.customer}
                  </p>
                  <p className="text-sm font-medium text-danger">Bekletiliyor: {j.blocked[station]}</p>
                </div>
                <button
                  type="button"
                  onClick={() => store.resume(j.id, station)}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-card px-5 text-sm font-bold shadow-card ring-1 ring-border transition-colors hover:bg-muted sm:w-auto"
                >
                  <RotateCcw className="size-4" /> Sorun çözüldü, devam et
                </button>
              </div>
            ))}

            {review.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
                <p className="flex items-center gap-2 text-sm font-bold">
                  <UserCheck className="size-4 text-muted-foreground" /> Müşteri onayında ({review.length})
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Müşteri portaldan onayladığında tüm tasarımlar baskıya düşer.</p>
                <ul className="mt-3 space-y-2">
                  {review.map((j) => {
                    const inReview = j.items.filter((i) => i.stage === "customer_review");
                    return (
                      <li key={j.id} className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
                        <Thumbs items={inReview} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{j.customer}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {j.id} · {inReview.length} tasarım onayda
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            store.approve(j.id);
                            setToast(`${j.id} · müşteri onayladı, ${inReview.length} kalem baskıya düştü`);
                          }}
                          className="h-9 shrink-0 rounded-full border border-border bg-card px-3 text-xs font-semibold hover:bg-muted"
                          title="Prototip: müşteri onayını simüle eder"
                        >
                          Onaylandı (demo)
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>

          {/* ── Sıradaki işler ── */}
          <section className="lg:order-1">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold tracking-wide text-muted-foreground uppercase">
              Sıradaki işler <span className="text-xs font-semibold normal-case">· önceliğe göre</span>
            </h2>
            {!ready ? (
              <div className="h-96 animate-pulse rounded-3xl bg-muted" />
            ) : waiting.length ? (
              <ol className="space-y-2.5">
                {waiting.map((j, i) => (
                  <QueueRow key={j.id} job={j} station={station} index={i + 1} onStart={() => store.start(j.id, station)} />
                ))}
              </ol>
            ) : (
              <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Bu planda sırada iş yok.</p>
            )}

            <div className="mt-5 rounded-2xl border border-border bg-card shadow-card">
              <button type="button" onClick={() => setShowDone((v) => !v)} className="flex w-full items-center gap-3 p-4 text-left">
                <CheckCircle2 className="size-5 text-success" />
                <span className="flex-1 text-sm font-bold">Bugün tamamlananlar ({doneToday.length})</span>
                <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", showDone && "rotate-180")} />
              </button>
              {showDone && (
                <ul className="divide-y divide-border border-t border-border">
                  {doneToday.length ? (
                    doneToday.map((j) => (
                      <li key={j.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                        <span className="font-semibold">{j.id}</span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">{j.customer}</span>
                        <span className="tabular text-xs font-semibold">Sipariş %{jobProgress(j)}</span>
                      </li>
                    ))
                  ) : (
                    <li className="p-4 text-sm text-muted-foreground">Henüz tamamlanan iş yok.</li>
                  )}
                </ul>
              )}
            </div>
          </section>
        </div>
      </main>

      <Sheet open={!!problemFor} onClose={() => setProblemFor(null)} title="Sorun bildir">
        <p className="text-sm text-muted-foreground">{problemFor?.id} bekletmeye alınacak ve sorumlusuna bildirim gidecek.</p>
        <div className="mt-4 grid gap-2">
          {cfg.problems.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                if (problemFor) store.block(problemFor.id, station, p);
                setToast(`${problemFor?.id} bekletmeye alındı · ${p}`);
                setProblemFor(null);
              }}
              className="flex h-14 items-center gap-3 rounded-2xl border border-border px-4 text-left text-base font-semibold transition-colors hover:border-danger/40 hover:bg-danger-soft/50"
            >
              <MessageSquareWarning className="size-5 text-danger" /> {p}
            </button>
          ))}
        </div>
      </Sheet>

      <ShipSheet
        job={shipFor}
        onClose={() => setShipFor(null)}
        onDone={(note) => {
          if (shipFor) {
            store.ship(shipFor.id, note);
            setToast(`${shipFor.id} · sevk edildi, müşteriye bildirim gönderildi`);
          }
          setShipFor(null);
        }}
      />

      {toast && (
        <div className="fixed inset-x-4 bottom-6 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-inverse px-4 py-3.5 text-sm font-medium text-inverse-foreground shadow-pop">
          <CheckCircle2 className="size-5 shrink-0 text-[#6ee7a8]" />
          <span className="min-w-0 flex-1">{toast}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Kapat" className="text-white/60">
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────────── Parçalar ───────────── */

function score(j: Job) {
  return (j.revision && j.items.some((i) => i.stage === "design") ? 100 : 0) + (j.priority === "urgent" ? 50 : 0) + (j.late ? 30 : 0);
}

function Counter({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "primary" | "danger" | "success" }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-card md:px-5 md:py-4">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tabular text-3xl font-bold tracking-tight md:text-4xl",
          tone === "primary" && "text-primary",
          tone === "danger" && "text-danger",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Thumb({ src }: { src: string }) {
  return (
    <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-border md:size-16">
      <Image src={src} alt="" fill sizes="64px" className="object-contain p-1" />
    </span>
  );
}

function Thumbs({ items }: { items: JobItem[] }) {
  const show = items.slice(0, 3);
  return (
    <span className="flex shrink-0 -space-x-3">
      {show.map((i) => (
        <span key={i.id} className="relative size-11 overflow-hidden rounded-xl bg-white ring-2 ring-card">
          <Image src={i.image} alt="" fill sizes="44px" className="object-contain p-0.5" />
        </span>
      ))}
      {items.length > 3 && <span className="relative grid size-11 place-items-center rounded-xl bg-muted text-xs font-bold ring-2 ring-card">+{items.length - 3}</span>}
    </span>
  );
}

function Flags({ job, station }: { job: Job; station: StationKey }) {
  return (
    <>
      {job.revision && station === "design" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-bold text-warning">
          <RotateCcw className="size-3" /> Revizyon
        </span>
      )}
      {job.priority === "urgent" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-danger px-2.5 py-1 text-xs font-bold text-white">
          <Flame className="size-3" /> Acil
        </span>
      )}
      {job.late && (
        <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2.5 py-1 text-xs font-bold text-danger">
          <Clock className="size-3" /> Gecikti
        </span>
      )}
      {job.delivery === "pickup" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-bold">
          <UserCheck className="size-3" /> Fabrikadan teslim
        </span>
      )}
    </>
  );
}

/** Bu istasyondaki ilerleme halkası. */
function Ring({ done, total, size = 56 }: { done: number; total: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={6} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={pct === 1 ? "var(--success)" : "var(--primary)"}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="tabular absolute text-xs font-bold">
        {done}/{total}
      </span>
    </span>
  );
}

/** Sipariş genel ilerlemesi: istasyon bazında bölümlü çubuk. */
function JobProgress({ job, current, compact }: { job: Job; current: StationKey; compact?: boolean }) {
  const pct = jobProgress(job);
  const segs = ORDER.map((s) => ({ s, ...stationProgress(job, s) })).filter((x) => x.total > 0);
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-muted-foreground">Sipariş ilerlemesi</span>
        <span className="tabular font-bold">%{pct}</span>
      </div>
      <div className="mt-1.5 flex gap-1">
        {segs.map((x) => (
          <div key={x.s} className="min-w-0 flex-1">
            <div className={cn("h-2 overflow-hidden rounded-full bg-muted", x.s === current && "ring-2 ring-primary/25")}>
              <div className={cn("h-full rounded-full transition-[width] duration-500", x.pct === 100 ? "bg-success" : "bg-primary")} style={{ width: `${x.pct}%` }} />
            </div>
            {!compact && (
              <p className={cn("mt-1 truncate text-[11px]", x.s === current ? "font-bold text-foreground" : "text-muted-foreground")}>
                {stations[x.s].title} {x.done}/{x.total}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function QueueRow({ job, station, index, onStart }: { job: Job; station: StationKey; index: number; onStart: () => void }) {
  const sp = stationProgress(job, station);
  const hereItems = job.items.filter((i) => i.stage === station);
  return (
    <li className={cn("rounded-2xl border bg-card p-3 shadow-card md:p-4", (job.revision && station === "design") || job.priority ? "border-warning/40" : "border-border/70")}>
      <div className="flex items-center gap-3 md:gap-4">
        <span className="hidden w-5 shrink-0 text-center text-sm font-bold text-muted-foreground sm:block">{index}</span>
        <Ring done={sp.done} total={sp.total} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Flags job={job} station={station} />
          </div>
          <p className="mt-1 truncate text-base font-bold">{job.customer}</p>
          <p className="truncate text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{hereItems.length} kalem</span> bu istasyonda · toplam {job.items.length}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {job.id} · {job.order} · Sevk {job.due}
          </p>
        </div>
        <span className="hidden 2xl:block">
          <Thumbs items={hereItems} />
        </span>
        <button
          type="button"
          onClick={onStart}
          className="hidden h-14 shrink-0 items-center gap-2 rounded-2xl bg-primary px-5 text-base font-bold text-primary-foreground transition-colors hover:bg-primary-hover sm:inline-flex"
        >
          <Play className="size-5" /> Başla
        </button>
      </div>
      <div className="mt-3">
        <JobProgress job={job} current={station} compact />
      </div>
      {job.note && <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-xs font-medium">{job.note}</p>}
      <button type="button" onClick={onStart} className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-primary-foreground sm:hidden">
        <Play className="size-5" /> {stations[station].startLabel}
      </button>
    </li>
  );
}

function ActiveCard({
  job,
  station,
  onToggle,
  onSend,
  onShip,
  onProblem,
}: {
  job: Job;
  station: StationKey;
  onToggle: (it: JobItem) => void;
  onSend: () => void;
  onShip: () => void;
  onProblem: () => void;
}) {
  const cfg = stations[station];
  const sp = stationProgress(job, station);
  const relevant = job.items.filter((i) => i.route.includes(station));
  const others = job.items.filter((i) => !i.route.includes(station));
  const designItems = job.items.filter((i) => i.stage === "design");
  const designReady = station === "design" && designItems.length > 0 && designItems.every((i) => i.done.includes("design"));
  const notArrived = relevant.filter((i) => !i.done.includes(station) && i.stage !== station);
  const shipReady = station === "shipping" && notArrived.length === 0 && relevant.every((i) => i.done.includes("shipping"));

  return (
    <article className="overflow-hidden rounded-3xl border-2 border-primary/30 bg-card shadow-pop">
      <div className="flex items-center justify-between gap-3 bg-primary-soft px-5 py-3">
        <span className="text-sm font-bold text-primary-soft-foreground">
          {job.id} · {job.order}
        </span>
        <Elapsed since={job.startedAt[station]} />
      </div>

      <div className="p-4 md:p-5">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-1.5">
              <Flags job={job} station={station} />
            </div>
            <p className="mt-1.5 text-xl leading-tight font-bold md:text-2xl">{job.customer}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Sevk hedefi {job.due}</p>
          </div>
          <div className="text-center">
            <Ring done={sp.done} total={sp.total} size={72} />
            <p className="mt-1 text-[11px] font-semibold text-muted-foreground">{cfg.itemDoneShort}</p>
          </div>
        </div>

        {job.revision && station === "design" && (
          <p className="mt-3 flex gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm font-medium text-warning">
            <RotateCcw className="mt-0.5 size-4 shrink-0" /> Müşteri notu: “{job.revision}”
          </p>
        )}
        {job.note && <p className="mt-3 rounded-xl bg-muted px-4 py-3 text-sm font-medium">{job.note}</p>}

        <div className="mt-4 rounded-2xl bg-muted/50 p-3">
          <JobProgress job={job} current={station} />
        </div>

        <ul className="mt-4 space-y-2">
          {relevant.map((it) => (
            <ItemRow key={it.id} item={it} station={station} onToggle={() => onToggle(it)} />
          ))}
        </ul>
        {others.length > 0 && (
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            + {others.length} kalem bu istasyondan geçmiyor ({others.map((o) => `${o.name}: ${stageLabel[o.stage].toLocaleLowerCase("tr")}`).join(", ")})
          </p>
        )}

        {station !== "shipping" && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(station === "design" ? ["Müşteri logosu.ai", "Ölçü şablonu.pdf"] : ["Baskı dosyaları v2.zip", "İş emri.pdf"]).map((f) => (
              <span key={f} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold">
                <FileImage className="size-3.5 text-muted-foreground" /> {f}
              </span>
            ))}
          </div>
        )}

        <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
          {station === "design" ? (
            <BigButton onClick={onSend} disabled={!designReady}>
              <Send /> Tümünü müşteri onayına gönder · {sp.done}/{sp.total}
            </BigButton>
          ) : station === "shipping" ? (
            <BigButton onClick={onShip} disabled={!shipReady}>
              {job.delivery === "pickup" ? <UserCheck /> : <Truck />}
              {job.delivery === "pickup" ? "Teslim edildi" : "Kargoya ver"} · {sp.done}/{sp.total}
            </BigButton>
          ) : (
            <p className="flex items-center gap-2 rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
              <Info className="size-4 shrink-0" />
              İşaretlenen kalem otomatik olarak sonraki istasyona geçer. Tüm kalemler bitince iş kapanır.
            </p>
          )}
          <button
            type="button"
            onClick={onProblem}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-border px-5 text-base font-semibold transition-colors hover:border-danger/40 hover:bg-danger-soft/50 hover:text-danger"
          >
            <AlertTriangle className="size-5" /> Sorun bildir
          </button>
        </div>
        {station === "shipping" && notArrived.length > 0 && (
          <p className="mt-2 text-center text-xs font-medium text-warning">
            {notArrived.length} kalem henüz gelmedi · tamamı paketlenince kargoya verilebilir
          </p>
        )}
        {station === "design" && !designReady && (
          <p className="mt-2 text-center text-xs text-muted-foreground">Tüm tasarımlar hazır olunca tek seferde müşteri onayına gider.</p>
        )}
      </div>
    </article>
  );
}

function ItemRow({ item, station, onToggle }: { item: JobItem; station: StationKey; onToggle: () => void }) {
  const cfg = stations[station];
  const done = item.done.includes(station);
  const here = item.stage === station;
  const pending = !done && !here;
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-2xl border p-2.5 pr-3 transition-colors",
        done ? "border-success/30 bg-success-soft/50" : pending ? "border-dashed border-border opacity-60" : "border-border bg-card",
      )}
    >
      <Thumb src={item.image} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm leading-snug font-semibold md:text-base", done && "text-muted-foreground line-through decoration-success/60")}>{item.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-bold text-foreground">{item.qty} adet</span> · {item.spec}
        </p>
        {done && !here && <p className="mt-0.5 text-[11px] font-semibold text-success">→ {stageLabel[item.stage]}</p>}
      </div>
      {pending ? (
        <span className="shrink-0 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">{stageLabel[item.stage]}</span>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={done}
          aria-label={`${item.name}: ${cfg.itemDone}`}
          className={cn(
            "inline-flex h-12 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-bold transition-colors md:px-4",
            done ? "bg-success text-white" : "border-2 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground",
          )}
        >
          <span className={cn("grid size-5 place-items-center rounded-md border-2", done ? "border-white bg-white text-success" : "border-current")}>
            {done && <Check className="size-3.5" strokeWidth={3.5} />}
          </span>
          <span className="hidden sm:inline">{cfg.itemDone}</span>
        </button>
      )}
    </li>
  );
}

function BigButton({ className, children, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-base font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-5 [&_svg]:shrink-0",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Elapsed({ since }: { since?: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- saat yalnızca istemcide çalışır
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!since || now === null) return null;
  const s = Math.max(0, Math.floor((now - since) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (
    <span className="tabular inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-sm font-bold shadow-card">
      <Timer className="size-4 text-primary" />
      {h ? `${h}:` : ""}
      {String(m).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

function LiveClock({ className }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- saat yalnızca istemcide çalışır
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <span className={className} />;
  return (
    <span className={cn("text-center leading-tight", className)}>
      <span className="tabular block text-2xl font-bold">{new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(now)}</span>
      <span className="block text-xs text-muted-foreground">{new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long" }).format(now)}</span>
    </span>
  );
}

function ShipSheet({ job, onClose, onDone }: { job: Job | null; onClose: () => void; onDone: (note: string) => void }) {
  const [carrier, setCarrier] = useState(carriers[0]);
  const [tracking, setTracking] = useState("");
  const [receiver, setReceiver] = useState("");
  const pickup = job?.delivery === "pickup";
  return (
    <Sheet open={!!job} onClose={onClose} title={pickup ? "Teslim edildi" : "Kargoya ver"}>
      <p className="text-sm text-muted-foreground">
        {job?.id} · {job?.customer} · {job?.items.length} kalem
      </p>
      {pickup ? (
        <label className="mt-4 block text-sm">
          <span className="mb-1.5 block font-semibold">Teslim alan kişi</span>
          <input
            value={receiver}
            onChange={(e) => setReceiver(e.target.value)}
            placeholder="Ad soyad"
            className="h-14 w-full rounded-2xl border border-input bg-card px-4 text-base outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
        </label>
      ) : (
        <>
          <p className="mt-4 mb-2 text-sm font-semibold">Kargo firması</p>
          <div className="grid grid-cols-2 gap-2">
            {carriers.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCarrier(c)}
                className={cn("h-14 rounded-2xl border text-sm font-bold transition-colors", carrier === c ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border hover:bg-muted")}
              >
                {c}
              </button>
            ))}
          </div>
          <label className="mt-4 block text-sm">
            <span className="mb-1.5 block font-semibold">Takip numarası</span>
            <input
              inputMode="numeric"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="Barkodu okutun veya yazın"
              className="tabular h-14 w-full rounded-2xl border border-input bg-card px-4 text-base outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            />
          </label>
        </>
      )}
      <BigButton
        className="mt-5 w-full"
        disabled={pickup ? !receiver.trim() : !tracking.trim() && carrier !== "Kendi aracımız"}
        onClick={() => onDone(pickup ? `Teslim alan: ${receiver}` : `${carrier}${tracking ? ` · ${tracking}` : ""}`)}
      >
        <CheckCircle2 /> Onayla · müşteriye bildirim gönder
      </BigButton>
    </Sheet>
  );
}
