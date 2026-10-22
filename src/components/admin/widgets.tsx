"use client";

import Link from "next/link";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  Clock,
  Palette,
  Phone,
  Receipt,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { activity, pipeline, repPerformance, stageMeta, type AdminOrder, type Task } from "@/lib/admin-mock";
import { paymentStatusMeta, productionStatusMeta } from "@/lib/mock";
import { cn, formatDate, formatTRY } from "@/lib/utils";

/* ───────── KPI ───────── */

export function Kpi({
  label,
  value,
  prev,
  current,
  hint,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  prev?: number;
  current?: number;
  hint?: string;
  tone?: "danger" | "warning";
  icon?: LucideIcon;
}) {
  const delta = prev && current !== undefined ? ((current - prev) / prev) * 100 : null;
  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span
            className={cn(
              "grid size-8 place-items-center rounded-lg",
              tone === "danger" ? "bg-danger-soft text-danger" : tone === "warning" ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <p className={cn("tabular mt-2 text-xl font-bold tracking-tight md:text-2xl", tone === "danger" && "text-danger")}>{value}</p>
      <div className="mt-1 flex items-center gap-1.5 text-[11px]">
        {delta !== null && (
          <span className={cn("inline-flex items-center gap-0.5 font-semibold", delta >= 0 ? "text-success" : "text-danger")}>
            {delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}%
            {Math.abs(delta).toFixed(1).replace(".", ",")}
          </span>
        )}
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
    </Card>
  );
}

export function TargetKpi({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = Math.min(Math.round((value / target) * 100), 100);
  return (
    <Card className="p-4 md:p-5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="tabular mt-2 text-xl font-bold tracking-tight md:text-2xl">{formatTRY(value, { whole: true })}</p>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Hedefin %{pct}&apos;i · {formatTRY(target, { whole: true })}
      </p>
    </Card>
  );
}

/* ───────── Satış trendi ───────── */

export function SalesTrend({ data }: { data: { month: string; buYil: number; gecenYil: number }[] }) {
  return (
    <Card>
      <CardHeader
        title="Satış trendi"
        description="Son 12 ay · KDV hariç"
        action={
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[var(--chart-1)]" /> Bu yıl
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[var(--chart-3)]" /> Geçen yıl
            </span>
          </div>
        }
      />
      <div className="h-64 px-2 pt-4 pb-3 md:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="fillSales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={52}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={(v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace(".", ",")}M` : `${Math.round(v / 1000)}B`)}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-pop">
                    <p className="mb-1 font-semibold">{label}</p>
                    {payload.map((p) => (
                      <p key={String(p.dataKey)} className="flex gap-3 text-muted-foreground">
                        {p.dataKey === "buYil" ? "Bu yıl" : "Geçen yıl"}
                        <span className="tabular ml-auto font-semibold text-foreground">{formatTRY(Number(p.value), { whole: true })}</span>
                      </p>
                    ))}
                  </div>
                ) : null
              }
            />
            <Area type="monotone" dataKey="gecenYil" stroke="var(--chart-3)" strokeWidth={1.5} strokeDasharray="4 4" fill="none" isAnimationActive={false} />
            <Area type="monotone" dataKey="buYil" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#fillSales)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/* ───────── Onay kuyruğu ───────── */

export function ApprovalQueue({ orders }: { orders: AdminOrder[] }) {
  const items = orders.filter((o) => o.needsApproval);
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Onay bekleyenler"
        description="Limit ve vade kuralına takılan siparişler"
        action={<Badge tone="danger">{items.length}</Badge>}
      />
      <ul className="flex-1 space-y-2 p-3">
        {items.map((o) => (
          <li key={o.id} className="rounded-xl border border-border p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{o.customer}</p>
                <p className="text-xs text-muted-foreground">
                  {o.id} · {o.rep}
                </p>
              </div>
              <p className="tabular text-sm font-bold">{formatTRY(o.total, { whole: true })}</p>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warning">
              <AlertTriangle className="size-3.5" />
              {o.needsApproval === "limit" ? "Kredi limiti %7 aşılıyor" : "₺23.100 vadesi geçmiş borç var"}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm">
                İncele
              </Button>
              <Button size="sm">Onayla</Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ───────── Sipariş akışı ───────── */

export function Pipeline({ highlight }: { highlight?: string[] }) {
  const max = Math.max(...stageMeta.map((s) => pipeline[s.key].count));
  return (
    <Card>
      <CardHeader
        title="Sipariş akışı"
        description="Açık siparişlerin aşamalara dağılımı"
        action={
          <Link href="/panel/uretim" className="text-xs font-semibold text-primary hover:underline">
            Panoyu aç
          </Link>
        }
      />
      <div className="grid grid-cols-3 gap-2 p-4 md:grid-cols-6 md:p-5">
        {stageMeta.map((s, i) => {
          const p = pipeline[s.key];
          const on = !highlight || highlight.includes(s.key);
          return (
            <div key={s.key} className={cn("rounded-xl border border-border p-3 transition-opacity", !on && "opacity-45")}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                {p.late > 0 && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-bold text-danger">
                    <Clock className="size-2.5" /> {p.late}
                  </span>
                )}
              </div>
              <p className="tabular mt-2 text-2xl font-bold tracking-tight">{p.count}</p>
              <p className="truncate text-xs font-medium text-muted-foreground">{s.label}</p>
              <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(p.count / max) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ───────── Temsilci performansı ───────── */

export function RepPerformance() {
  return (
    <Card>
      <CardHeader title="Temsilci performansı" description="Bu ay · tekliften siparişe dönüşüm" />
      <ul className="space-y-4 p-5">
        {repPerformance.map((r) => {
          const conv = Math.round((r.won / r.quotes) * 100);
          const target = Math.round((r.sales / r.target) * 100);
          return (
            <li key={r.name}>
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary-soft-foreground">
                  {r.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{r.name}</p>
                    <p className="tabular text-sm font-bold">{formatTRY(r.sales, { whole: true })}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {r.won}/{r.quotes} teklif · dönüşüm <span className="font-semibold text-foreground">%{conv}</span> · hedef %{target}
                  </p>
                </div>
              </div>
              <div className="mt-2 ml-12 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${target}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ───────── Sipariş tablosu ───────── */

export function OrdersTable({ orders, title, description }: { orders: AdminOrder[]; title: string; description?: string }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={title}
        description={description}
        className="pb-4"
        action={
          <Link href="/panel/siparisler" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Tümü
          </Link>
        }
      />
      <div className="hidden grid-cols-[1.6fr_1fr_1fr_0.9fr_0.8fr_16px] gap-4 border-y border-border px-5 py-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase md:grid">
        <span>Müşteri / sipariş</span>
        <span>Ödeme</span>
        <span>Üretim</span>
        <span>Sevk tarihi</span>
        <span className="text-right">Tutar</span>
        <span />
      </div>
      <ul className="divide-y divide-border border-t border-border md:border-t-0">
        {orders.map((o) => {
          const pay = paymentStatusMeta[o.payment];
          const prod = productionStatusMeta[o.production];
          return (
            <li key={o.id}>
              <Link
                href={`/panel/siparisler/${o.id}`}
                className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 px-5 py-3.5 transition-colors hover:bg-muted/60 md:grid-cols-[1.6fr_1fr_1fr_0.9fr_0.8fr_16px] md:items-center md:gap-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{o.customer}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {o.id} · {o.rep}
                    {o.owner && <span className="md:hidden"> · {o.owner}</span>}
                  </p>
                </div>
                <span className="tabular col-start-2 row-start-1 text-right text-sm font-semibold md:hidden">{formatTRY(o.total, { whole: true })}</span>
                <div className="col-span-2 flex flex-wrap gap-1.5 md:contents">
                  <span>
                    <Badge tone={pay.tone}>{pay.label}</Badge>
                  </span>
                  <span>
                    <Badge tone={prod.tone}>{o.production === "design_review" ? "Müşteri onayında" : prod.label}</Badge>
                  </span>
                  <span className={cn("inline-flex items-center gap-1 text-xs md:text-sm", o.late ? "font-semibold text-danger" : "text-muted-foreground")}>
                    {o.late && <Clock className="size-3.5" />}
                    {formatDate(o.dueDate, { day: "numeric", month: "short" })}
                    {o.late && <span className="md:hidden">· gecikti</span>}
                  </span>
                </div>
                <span className="tabular hidden text-right text-sm font-semibold md:block">{formatTRY(o.total, { whole: true })}</span>
                <ChevronRight className="hidden size-4 text-muted-foreground md:block" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ───────── Görevler ───────── */

const taskIcon: Record<Task["kind"], LucideIcon> = {
  call: Phone,
  quote: Receipt,
  collection: AlertTriangle,
  design: Palette,
  ship: Truck,
};

export function TaskList({ tasks, title = "Bugün yapılacaklar" }: { tasks: Task[]; title?: string }) {
  return (
    <Card>
      <CardHeader
        title={title}
        description={`${tasks.length} açık görev`}
        action={
          <Link href="/panel/gorevler" className="text-xs font-semibold text-primary hover:underline">
            Tümü
          </Link>
        }
      />
      <ul className="space-y-1 p-3">
        {tasks.map((t) => {
          const Icon = taskIcon[t.kind];
          const urgent = t.due === "Bugün" || t.due === "Gecikti" || t.due.startsWith("Bugün");
          return (
            <li key={t.id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-muted/60">
                <input type="checkbox" className="mt-1 size-4 shrink-0 accent-[var(--primary)]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{t.title}</span>
                  {t.customer && <span className="block truncate text-xs text-muted-foreground">{t.customer}</span>}
                </span>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold",
                    t.due === "Gecikti" ? "bg-danger-soft text-danger" : urgent ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-3" /> {t.due}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ───────── İşlem kayıtları ───────── */

export function ActivityFeed() {
  return (
    <Card>
      <CardHeader
        title="Son işlemler"
        description="Fiyat, onay ve durum değişiklikleri kayıt altında"
        action={
          <Link href="/panel/kayitlar" className="text-xs font-semibold text-primary hover:underline">
            Tümü
          </Link>
        }
      />
      <ol className="relative space-y-4 p-5">
        <span aria-hidden className="absolute top-6 bottom-6 left-[27px] w-px bg-border" />
        {activity.map((a, i) => (
          <li key={i} className="relative flex gap-3">
            <span className="relative z-10 mt-1 size-2.5 shrink-0 rounded-full border-2 border-card bg-primary ring-2 ring-primary/20" />
            <div className="min-w-0 text-sm">
              <p>
                <span className="font-semibold">{a.who}</span> <span className="text-muted-foreground">{a.what}</span>
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                <CalendarClock className="size-3" /> {a.when}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
