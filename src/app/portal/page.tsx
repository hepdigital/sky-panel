import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  CreditCard,
  FileText,
  MapPin,
  Plus,
  Send,
  Tag,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { ActivityChart } from "@/components/portal/activity-chart";
import { CreditGauge } from "@/components/portal/credit-gauge";
import { OrderList } from "@/components/portal/order-list";
import { OrderTracker } from "@/components/portal/order-tracker";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { account, currentCustomer, monthlyActivity, pendingQuote, recentOrders, upcomingDues } from "@/lib/mock";
import { cn, formatDate, formatTRY } from "@/lib/utils";

export const metadata: Metadata = { title: "Ana Sayfa" };

const quickActions: { href: string; label: string; hint: string; icon: LucideIcon }[] = [
  { href: "/portal/siparis-ver", label: "Yeni sipariş", hint: "Ürün seç, fiyatını gör", icon: Plus },
  { href: "/portal/cari/borc-ode", label: "Borç öde", hint: "Kartla cari ödeme", icon: CreditCard },
  { href: "/portal/cari/bakiye-yukle", label: "Bakiye yükle", hint: "Ön ödeme yap", icon: Wallet },
  { href: "/portal/cari/odeme-linki", label: "Ödeme linki", hint: "Müşterine gönder", icon: Send },
  { href: "/portal/adresler", label: "Adreslerim", hint: "Teslimat adresleri", icon: MapPin },
  { href: "/portal/cari", label: "Ekstre indir", hint: "PDF / Excel", icon: ArrowDownToLine },
];

export default function PortalHomePage() {
  const firstName = currentCustomer.contactName.split(" ")[0];
  const trackedOrder = recentOrders[0];

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 md:space-y-6">
      {/* ── Karşılama ── */}
      <section className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Merhaba, {firstName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Hesabınızın güncel özeti aşağıda.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pr-3.5 pl-1.5 text-xs shadow-card">
          <span className="grid size-6 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground">
            <Tag className="size-3.5" />
          </span>
          <span className="text-muted-foreground">İskonto grubunuz</span>
          <span className="font-semibold">
            {currentCustomer.discountGroup} · %{currentCustomer.discountRate}
          </span>
        </div>
      </section>

      {/* ── Teklif uyarısı ── */}
      <Link
        href={`/portal/teklifler/${pendingQuote.id}`}
        className="group flex items-center gap-3 rounded-2xl border border-primary/15 bg-primary-soft px-4 py-3 transition-colors hover:border-primary/30 md:px-5"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-card text-primary shadow-card">
          <FileText className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-primary-soft-foreground">
            Yanıtınızı bekleyen 1 teklif var
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {pendingQuote.title} · {formatTRY(pendingQuote.total)} · Son gün{" "}
            {formatDate(pendingQuote.validUntil, { day: "numeric", month: "long" })}
          </p>
        </div>
        <span className="hidden items-center gap-1 text-sm font-semibold text-primary sm:flex">
          İncele <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
        <ArrowRight className="size-4 shrink-0 text-primary sm:hidden" />
      </Link>

      {/* ── Finans özeti ── */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-12 md:gap-5">
        {/* Bakiye (hero) */}
        <div className="relative overflow-hidden rounded-2xl bg-inverse p-5 text-inverse-foreground md:col-span-2 md:p-6 lg:col-span-5">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full bg-brand-500/25 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]"
          />
          <div className="relative flex h-full flex-col">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white/70">Güncel cari bakiye</p>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold">Borç</span>
            </div>
            <p className="tabular mt-2 text-[34px] leading-none font-bold tracking-tight md:text-[40px]">
              {formatTRY(account.balance)}
            </p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[#ff8a8a]" />
                <span className="text-white/60">Vadesi geçmiş</span>
                <span className="tabular font-semibold">{formatTRY(account.overdue)}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-brand-300" />
                <span className="text-white/60">
                  {formatDate(account.nextDue.date, { day: "numeric", month: "short" })} vadeli
                </span>
                <span className="tabular font-semibold">{formatTRY(account.nextDue.amount)}</span>
              </span>
            </div>
            <dl className="mt-5 grid grid-cols-3 divide-x divide-white/10 rounded-xl bg-white/[0.06] py-3 text-center ring-1 ring-white/10">
              {[
                { label: "Toplam borç", value: account.totalDebit },
                { label: "Toplam alacak", value: account.totalCredit },
                { label: "Son ödeme", value: account.lastPayment.amount },
              ].map((s) => (
                <div key={s.label} className="px-2">
                  <dt className="text-[11px] text-white/55">{s.label}</dt>
                  <dd className="tabular mt-0.5 text-sm font-semibold">{formatTRY(s.value, { whole: true })}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 flex gap-2 lg:mt-auto lg:pt-5">
              <Link href="/portal/cari/borc-ode" className={cn(buttonVariants({ variant: "inverse" }), "flex-1 sm:flex-none")}>
                <CreditCard /> Borç öde
              </Link>
              <Link
                href="/portal/cari/bakiye-yukle"
                className={cn(buttonVariants({ variant: "inverse-ghost" }), "flex-1 sm:flex-none")}
              >
                <Wallet /> Bakiye yükle
              </Link>
            </div>
          </div>
        </div>

        {/* Kredi limiti */}
        <Card className="lg:col-span-4">
          <CardHeader
            title="Kredi limiti"
            description={`Toplam limit ${formatTRY(account.creditLimit)}`}
            action={
              <Link href="/portal/cari" className="text-xs font-semibold text-primary hover:underline">
                Detay
              </Link>
            }
          />
          <div className="px-5 pt-4 pb-5">
            <CreditGauge used={account.creditUsed} limit={account.creditLimit} />
            <div className="mt-4 flex justify-center gap-5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[var(--chart-1)]" /> Kullanılan
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[var(--chart-2)]" /> Kullanılabilir
              </span>
            </div>
          </div>
        </Card>

        {/* Ön ödeme + Satış temsilcisi */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-1 md:gap-5 lg:col-span-3">
          <Card className="flex flex-col justify-between p-4 md:p-5">
            <span className="grid size-9 place-items-center rounded-xl bg-success-soft text-success">
              <Wallet className="size-[18px]" />
            </span>
            <div className="mt-4">
              <p className="text-xs text-muted-foreground">Ön ödeme bakiyesi</p>
              <p className="tabular mt-1 text-lg font-bold tracking-tight md:text-xl">{formatTRY(account.prepaid)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Sonraki siparişte kullanılabilir</p>
            </div>
          </Card>
          <Card className="flex flex-col justify-between p-4 md:p-5">
            <span className="grid size-9 place-items-center rounded-xl bg-danger-soft text-danger">
              <CreditCard className="size-[18px]" />
            </span>
            <div className="mt-4">
              <p className="text-xs text-muted-foreground">Vadesi geçmiş</p>
              <p className="tabular mt-1 text-lg font-bold tracking-tight text-danger md:text-xl">
                {formatTRY(account.overdue)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">8 gün gecikmiş · 1 fatura</p>
            </div>
          </Card>
        </div>
      </section>

      {/* ── Hızlı işlemler ── */}
      <section>
        <div className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 no-scrollbar md:mx-0 md:grid md:grid-cols-3 md:gap-3 md:overflow-visible md:px-0 xl:grid-cols-6">
          {quickActions.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.href}
                href={a.href}
                className="group flex w-[148px] shrink-0 snap-start flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/30 md:w-auto md:flex-row md:items-center"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="size-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{a.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{a.hint}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Siparişler + Takip ── */}
      <section className="grid gap-4 md:gap-5 lg:grid-cols-12">
        <Card className="overflow-hidden lg:col-span-8">
          <CardHeader
            title="Son siparişler"
            description="Ödeme ve üretim durumları ayrı takip edilir"
            action={
              <Link href="/portal/siparisler" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Tümü
              </Link>
            }
            className="pb-4"
          />
          <OrderList orders={recentOrders} />
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader
            title="Sipariş takibi"
            description={`${trackedOrder.id} · ${trackedOrder.items}`}
            action={<Badge tone="warning">İşlem bekliyor</Badge>}
          />
          <div className="px-5 pt-5 pb-5">
            <OrderTracker
              current={trackedOrder.production}
              logs={{
                awaiting_approval: { date: "14 Eki 10:12", by: "Elif Kaya" },
                design: { date: "14 Eki 15:40", by: "Tasarım · Burak A." },
                design_review: {
                  date: "15 Eki 09:05",
                  note: "Tasarım dosyanız hazır. Onaylamanız veya revizyon istemeniz bekleniyor.",
                },
              }}
            />
            <Link
              href={`/portal/siparisler/${trackedOrder.id}`}
              className={cn(buttonVariants({ size: "md" }), "mt-5 w-full")}
            >
              Tasarımı incele ve onayla
            </Link>
          </div>
        </Card>
      </section>

      {/* ── Hesap hareketi + Vadeler ── */}
      <section className="grid gap-4 md:gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader
            title="Alım ve ödemeler"
            description="Son 6 ay"
            action={
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[var(--chart-1)]" /> Alım
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[var(--chart-2)]" /> Ödeme
                </span>
              </div>
            }
          />
          <div className="px-3 pt-4 pb-4 md:px-5">
            <ActivityChart data={monthlyActivity} />
          </div>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader
            title="Vade takvimi"
            description="Ödenmemiş faturalar"
            action={
              <Link href="/portal/cari" className="text-xs font-semibold text-primary hover:underline">
                Ekstre
              </Link>
            }
          />
          <ul className="space-y-2 px-3 pt-3 pb-3">
            {upcomingDues.map((d) => {
              const day = new Date(d.date);
              return (
                <li key={d.id} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/60">
                  <span
                    className={cn(
                      "flex w-12 shrink-0 flex-col items-center rounded-xl py-1.5 leading-none",
                      d.overdue ? "bg-danger-soft text-danger" : "bg-muted text-foreground",
                    )}
                  >
                    <span className="text-base font-bold">{day.getDate()}</span>
                    <span className="mt-0.5 text-[10px] font-semibold uppercase">
                      {new Intl.DateTimeFormat("tr-TR", { month: "short" }).format(day)}
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{d.id}</p>
                    <p className={cn("text-xs", d.overdue ? "font-medium text-danger" : "text-muted-foreground")}>
                      {d.overdue ? "Vadesi geçti" : "Vadesi yaklaşıyor"}
                    </p>
                  </div>
                  <span className="tabular text-sm font-semibold">{formatTRY(d.amount)}</span>
                </li>
              );
            })}
          </ul>
          <div className="px-5 pb-5">
            <Link href="/portal/cari/borc-ode" className={cn(buttonVariants({ variant: "soft" }), "w-full")}>
              <CreditCard /> Vadesi gelenleri öde
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
