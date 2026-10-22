"use client";

import Link from "next/link";
import { AlertTriangle, Banknote, ClipboardCheck, Clock, Download, FileText, Inbox, Package, Plus, ReceiptText, Truck, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { adminCustomers, adminOrders, kpis, repPerformance, salesTrend, tasksByRole, type Role } from "@/lib/admin-mock";
import { cn, formatTRY } from "@/lib/utils";
import { useRole } from "./role-context";
import { ActivityFeed, ApprovalQueue, Kpi, OrdersTable, Pipeline, RepPerformance, SalesTrend, TargetKpi, TaskList } from "./widgets";

const greetings: Record<Role, string> = {
  admin: "Şirketin bugünkü durumu",
  sales: "Müşterilerin ve teklif takibin",
  design: "Tasarım kuyruğun",
  production: "Üretim hattının durumu",
  warehouse: "Sevkiyat planın",
  finance: "Tahsilat ve onaylar",
};

export function Dashboard() {
  const { role, user } = useRole();
  const first = user.user.split(" ")[0];

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 md:space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <p className="text-sm text-muted-foreground">16 Ekim 2026, Cuma</p>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Günaydın, {first}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{greetings[role]}.</p>
        </div>
        <HeaderActions role={role} />
      </section>

      {role === "admin" && <AdminDashboard />}
      {role === "sales" && <SalesDashboard />}
      {role === "finance" && <FinanceDashboard />}
      {(role === "design" || role === "production" || role === "warehouse") && <OpsDashboard role={role} />}
    </div>
  );
}

function HeaderActions({ role }: { role: Role }) {
  if (role === "admin" || role === "finance")
    return (
      <button type="button" className={buttonVariants({ variant: "outline" })}>
        <Download /> Rapor indir
      </button>
    );
  if (role === "sales")
    return (
      <div className="flex gap-2">
        <Link href="/panel/siparisler/yeni" className={buttonVariants({ variant: "outline" })}>
          <Package /> Sipariş gir
        </Link>
        <Link href="/panel/teklifler/yeni" className={buttonVariants()}>
          <Plus /> Yeni teklif
        </Link>
      </div>
    );
  return null;
}

/* ───────── Yönetici ───────── */

function AdminDashboard() {
  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Kpi label="Bu ay satış" value={formatTRY(kpis.monthSales, { whole: true })} current={kpis.monthSales} prev={kpis.monthSalesPrev} hint="geçen ayın aynı dönemine göre" icon={Banknote} />
        <Kpi label="Sipariş sayısı" value={String(kpis.orders)} current={kpis.orders} prev={kpis.ordersPrev} hint="bu ay" icon={Package} />
        <Kpi label="Ortalama sipariş" value={formatTRY(kpis.avgOrder, { whole: true })} current={kpis.avgOrder} prev={kpis.avgOrderPrev} icon={ReceiptText} />
        <Kpi label="Vadesi geçen alacak" value={formatTRY(kpis.overdueTotal, { whole: true })} hint={`${kpis.overdueCustomers} müşteri`} tone="danger" icon={AlertTriangle} />
      </section>

      <section className="grid gap-4 md:gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <SalesTrend data={salesTrend} />
        </div>
        <div className="lg:col-span-4">
          <ApprovalQueue orders={adminOrders} />
        </div>
      </section>

      <Pipeline />

      <section className="grid gap-4 md:gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <OrdersTable orders={adminOrders.filter((o) => o.late || o.needsApproval)} title="Dikkat gerektiren siparişler" description="Geciken veya onay bekleyen" />
        </div>
        <div className="lg:col-span-4">
          <RepPerformance />
        </div>
      </section>

      <section className="grid gap-4 md:gap-5 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <TaskList tasks={tasksByRole.admin} />
        </div>
        <div className="lg:col-span-7">
          <ActivityFeed />
        </div>
      </section>
    </>
  );
}

/* ───────── Satış ───────── */

function SalesDashboard() {
  const me = repPerformance[0];
  const mine = adminOrders.filter((o) => o.rep === "Elif Kaya");
  const myCustomers = adminCustomers.filter((c) => c.rep === "Elif Kaya");
  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <TargetKpi label="Bu ay satışım" value={me.sales} target={me.target} />
        <Kpi label="Açık teklifler" value="6" hint="₺186.400 toplam" icon={FileText} />
        <Kpi label="Dönüşüm oranı" value={`%${Math.round((me.won / me.quotes) * 100)}`} current={69} prev={62} hint="geçen aya göre" icon={ClipboardCheck} />
        <Kpi label="Müşterilerimin gecikmesi" value={formatTRY(98_700, { whole: true })} hint="2 müşteri" tone="danger" icon={AlertTriangle} />
      </section>

      <section className="grid gap-4 md:gap-5 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <TaskList tasks={tasksByRole.sales} />
        </div>
        <div className="lg:col-span-7">
          <QuotesWaiting />
        </div>
      </section>

      <section className="grid gap-4 md:gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <OrdersTable orders={mine} title="Siparişlerim" description="Sorumlu olduğun müşterilerin siparişleri" />
        </div>
        <div className="lg:col-span-4">
          <Card>
            <CardHeader title="Müşterilerim" description={`${myCustomers.length} aktif müşteri`} />
            <ul className="space-y-1 p-3">
              {myCustomers.map((c) => (
                <li key={c.id}>
                  <Link href={`/panel/musteriler/${c.id}`} className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-muted/60">
                    <span className="grid size-9 place-items-center rounded-full bg-muted text-xs font-bold">{c.name.slice(0, 2).toLocaleUpperCase("tr")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{c.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {c.group} · Bakiye {formatTRY(c.balance, { whole: true })}
                      </span>
                    </span>
                    {c.overdue > 0 && <span className="rounded-full bg-danger-soft px-2 py-1 text-[10px] font-bold text-danger">Gecikme</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>
    </>
  );
}

function QuotesWaiting() {
  const quotes = [
    { id: "TK-2026-0312", customer: "Akdeniz Reklam", title: "Fuar standı paketi · 4 kalem", total: 64_500, status: "Müşteri inceliyor", days: 2 },
    { id: "TK-2026-0318", customer: "Marmara Fuarcılık", title: "3x6 gazebo · 3 adet", total: 95_550, status: "Gönderildi", days: 1 },
    { id: "TK-2026-0305", customer: "Başkent Organizasyon", title: "Beach flag · 40 adet", total: 26_350, status: "Süresi doluyor", days: 0 },
  ];
  return (
    <Card>
      <CardHeader
        title="Yanıt bekleyen teklifler"
        description="Müşteri dönüşü beklenenler"
        action={
          <Link href="/panel/teklifler" className="text-xs font-semibold text-primary hover:underline">
            Tümü
          </Link>
        }
      />
      <ul className="divide-y divide-border p-2">
        {quotes.map((q) => (
          <li key={q.id} className="flex items-center gap-3 px-3 py-3">
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", q.days === 0 ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary")}>
              <FileText className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{q.customer}</p>
              <p className="truncate text-xs text-muted-foreground">
                {q.id} · {q.title}
              </p>
            </div>
            <div className="text-right">
              <p className="tabular text-sm font-bold">{formatTRY(q.total, { whole: true })}</p>
              <p className={cn("text-[11px]", q.days === 0 ? "font-semibold text-danger" : "text-muted-foreground")}>{q.status}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ───────── Finans ───────── */

function FinanceDashboard() {
  const risky = adminCustomers.filter((c) => c.overdue > 0).sort((a, b) => b.overdue - a.overdue);
  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Kpi label="Bu ay tahsilat" value={formatTRY(kpis.collections, { whole: true })} current={kpis.collections} prev={372_000} hint="geçen aya göre" icon={Banknote} />
        <Kpi label="Vadesi geçen" value={formatTRY(kpis.overdueTotal, { whole: true })} hint={`${kpis.overdueCustomers} müşteri`} tone="danger" icon={AlertTriangle} />
        <Kpi label="Onay bekleyen" value="2" hint="limit / vade kuralı" tone="warning" icon={ClipboardCheck} />
        <Kpi label="Tanımsız havale" value="3" hint="eşleştirilmeli · ₺41.200" icon={Inbox} />
      </section>

      <section className="grid gap-4 md:gap-5 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <ApprovalQueue orders={adminOrders} />
        </div>
        <div className="lg:col-span-8">
          <Card className="overflow-hidden">
            <CardHeader title="Vadesi geçen alacaklar" description="Gecikme tutarına göre" className="pb-4" />
            <ul className="divide-y divide-border border-t border-border">
              {risky.map((c) => {
                const usage = Math.round((c.balance / c.limit) * 100);
                return (
                  <li key={c.id} className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-3.5 md:grid-cols-[1.5fr_1fr_1fr_auto]">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.rep} · {c.status === "blocked" ? "Sipariş bloke" : c.group}
                      </p>
                    </div>
                    <div className="hidden md:block">
                      <p className="text-[11px] text-muted-foreground">Limit kullanımı</p>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className={cn("h-full rounded-full", usage > 100 ? "bg-danger" : "bg-primary")} style={{ width: `${Math.min(usage, 100)}%` }} />
                        </div>
                        <span className={cn("tabular text-xs font-semibold", usage > 100 && "text-danger")}>%{usage}</span>
                      </div>
                    </div>
                    <p className="tabular hidden text-sm text-muted-foreground md:block">Bakiye {formatTRY(c.balance, { whole: true })}</p>
                    <div className="text-right">
                      <p className="tabular text-sm font-bold text-danger">{formatTRY(c.overdue, { whole: true })}</p>
                      <button type="button" className="text-[11px] font-semibold text-primary hover:underline">
                        Hatırlatma gönder
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 md:gap-5 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <TaskList tasks={tasksByRole.finance} />
        </div>
        <div className="lg:col-span-7">
          <ActivityFeed />
        </div>
      </section>
    </>
  );
}

/* ───────── Tasarım / Üretim / Depo ───────── */

const opsConfig = {
  design: {
    stages: ["design", "design_review"],
    kpis: [
      { label: "Kuyruğumdaki iş", value: "7", icon: Inbox },
      { label: "Müşteri onayında", value: "4", icon: Users },
      { label: "Bugün teslim", value: "3", icon: Clock, tone: "warning" as const },
      { label: "Geciken", value: "2", icon: AlertTriangle, tone: "danger" as const },
    ],
    title: "Tasarım kuyruğu",
  },
  production: {
    stages: ["production"],
    kpis: [
      { label: "Üretimdeki iş", value: "12", icon: Package },
      { label: "Bugün bitecek", value: "4", icon: Clock, tone: "warning" as const },
      { label: "Geciken", value: "2", icon: AlertTriangle, tone: "danger" as const },
      { label: "Bu hafta tamamlanan", value: "26", icon: ClipboardCheck },
    ],
    title: "Üretim kuyruğu",
  },
  warehouse: {
    stages: ["ready", "shipped"],
    kpis: [
      { label: "Sevke hazır", value: "5", icon: Package },
      { label: "Bugün kargoya", value: "5", icon: Truck, tone: "warning" as const },
      { label: "Geciken sevk", value: "1", icon: AlertTriangle, tone: "danger" as const },
      { label: "Fabrikadan teslim", value: "2", icon: Users },
    ],
    title: "Sevkiyat kuyruğu",
  },
};

function OpsDashboard({ role }: { role: "design" | "production" | "warehouse" }) {
  const cfg = opsConfig[role];
  const queue = adminOrders.filter((o) => cfg.stages.includes(o.production));
  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {cfg.kpis.map((k) => (
          <Kpi key={k.label} label={k.label} value={k.value} icon={k.icon} tone={"tone" in k ? k.tone : undefined} />
        ))}
      </section>
      <Pipeline highlight={cfg.stages} />
      <section className="grid gap-4 md:gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <OrdersTable orders={queue} title={cfg.title} description="Sevk tarihine göre sıralı" />
        </div>
        <div className="lg:col-span-4">
          <TaskList tasks={tasksByRole[role]} />
        </div>
      </section>
    </>
  );
}
