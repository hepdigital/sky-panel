"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  Flag,
  Landmark,
  Link2,
  Scale,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  daysUntil,
  ledger,
  openInvoices,
  payments,
  prepaidLedger,
  TODAY,
  type LedgerEntry,
  type LedgerType,
} from "@/lib/ledger";
import { account, currentCustomer } from "@/lib/mock";
import { cn, formatDate, formatTRY } from "@/lib/utils";

const tabs = [
  { key: "ledger", label: "Hesap hareketleri" },
  { key: "invoices", label: "Açık faturalar", count: openInvoices.length },
  { key: "payments", label: "Ödemeler" },
  { key: "prepaid", label: "Ön ödeme hesabı" },
] as const;
type Tab = (typeof tabs)[number]["key"];

export function AccountView() {
  const [tab, setTab] = useState<Tab>("ledger");
  const available = account.creditLimit - account.creditUsed;
  const usedPct = Math.round((account.creditUsed / account.creditLimit) * 100);

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* Başlık */}
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Cari hesap</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {currentCustomer.firmName} · Cari kodu {currentCustomer.cariCode}
          </p>
        </div>
        <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
          <Link href="/portal/cari/odeme-linki" className={cn(buttonVariants({ variant: "outline" }), "px-2 text-xs sm:px-4 sm:text-sm")}>
            <Link2 /> Ödeme linki
          </Link>
          <Link href="/portal/cari/bakiye-yukle" className={cn(buttonVariants({ variant: "outline" }), "px-2 text-xs sm:px-4 sm:text-sm")}>
            <Wallet /> Bakiye yükle
          </Link>
          <Link href="/portal/cari/borc-ode" className={cn(buttonVariants(), "px-2 text-xs sm:px-4 sm:text-sm")}>
            <CreditCard /> Borç öde
          </Link>
        </div>
      </div>

      {/* Özet */}
      <div className="mt-5 grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Stat label="Güncel bakiye" value={formatTRY(account.balance)} hint="Borç" emphasis className="col-span-2 lg:col-span-1" />
        <Stat
          label="Vadesi geçmiş"
          value={formatTRY(account.overdue)}
          hint={`${openInvoices.filter((i) => daysUntil(i.due) < 0).length} fatura`}
          tone="danger"
        />
        <Stat label="Ön ödeme bakiyesi" value={formatTRY(account.prepaid)} hint="Siparişlerde kullanılabilir" tone="success" />
        <Card className="col-span-2 p-4 md:p-5 lg:col-span-1">
          <p className="text-xs text-muted-foreground">Kullanılabilir limit</p>
          <p className="tabular mt-1 text-xl font-bold tracking-tight">{formatTRY(available)}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--chart-2)]">
            <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${usedPct}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Limit {formatTRY(account.creditLimit, { whole: true })} · %{usedPct} kullanıldı
          </p>
        </Card>
      </div>

      {/* Sekmeler */}
      <div className="-mx-4 mt-6 flex gap-1 overflow-x-auto border-b border-border px-4 no-scrollbar md:mx-0 md:px-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "relative flex h-11 shrink-0 items-center gap-1.5 px-3 text-sm font-semibold transition-colors",
              tab === t.key ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {"count" in t && (
              <span className="grid min-w-5 place-items-center rounded-full bg-danger-soft px-1 text-[11px] text-danger">{t.count}</span>
            )}
            {tab === t.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "ledger" && <LedgerTab />}
        {tab === "invoices" && <InvoicesTab />}
        {tab === "payments" && <PaymentsTab />}
        {tab === "prepaid" && <PrepaidTab />}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
  emphasis,
  className,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "danger" | "success";
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("p-4 md:p-5", emphasis && "border-transparent bg-inverse text-inverse-foreground", className)}>
      <p className={cn("text-xs", emphasis ? "text-white/60" : "text-muted-foreground")}>{label}</p>
      <p
        className={cn(
          "tabular mt-1 text-lg font-bold tracking-tight md:text-xl",
          tone === "danger" && "text-danger",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </p>
      <p className={cn("mt-1 text-[11px]", emphasis ? "text-white/50" : "text-muted-foreground")}>{hint}</p>
    </Card>
  );
}

/* ───────────── Hesap hareketleri ───────────── */

const typeMeta: Record<LedgerType, { label: string; icon: LucideIcon; tone: string }> = {
  opening: { label: "Devir", icon: Flag, tone: "bg-muted text-muted-foreground" },
  invoice: { label: "Fatura", icon: FileText, tone: "bg-danger-soft text-danger" },
  payment: { label: "Tahsilat", icon: ArrowDownLeft, tone: "bg-success-soft text-success" },
  adjustment: { label: "Düzeltme", icon: Scale, tone: "bg-info-soft text-info" },
};

const periods = [
  { key: "30", label: "Son 30 gün", days: 30 },
  { key: "90", label: "Son 3 ay", days: 90 },
  { key: "all", label: "Tümü", days: Infinity },
] as const;

function LedgerTab() {
  const [period, setPeriod] = useState<(typeof periods)[number]["key"]>("90");
  const [type, setType] = useState<LedgerType | "all">("all");

  const rows = useMemo(() => {
    const days = periods.find((p) => p.key === period)!.days;
    return ledger
      .filter((e) => -daysUntil(e.date) <= days && (type === "all" || e.type === type))
      .slice()
      .reverse();
  }, [period, type]);

  const sums = rows.reduce((s, r) => ({ d: s.d + r.debit, c: s.c + r.credit }), { d: 0, c: 0 });

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 md:p-4">
        <Segmented value={period} onChange={setPeriod} options={periods.map((p) => ({ value: p.key, label: p.label }))} />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as LedgerType | "all")}
          className="h-9 rounded-full border border-border bg-card px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-ring"
          aria-label="Hareket türü"
        >
          <option value="all">Tüm hareketler</option>
          <option value="invoice">Faturalar</option>
          <option value="payment">Tahsilatlar</option>
          <option value="adjustment">Düzeltmeler</option>
        </select>
        <div className="ml-auto flex gap-1.5">
          <button type="button" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Download /> PDF
          </button>
          <button type="button" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <FileSpreadsheet /> Excel
          </button>
        </div>
      </div>

      {/* Masaüstü tablo */}
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            <th className="px-5 py-3 font-semibold">Tarih</th>
            <th className="px-3 py-3 font-semibold">Belge</th>
            <th className="px-3 py-3 font-semibold">Açıklama</th>
            <th className="px-3 py-3 text-right font-semibold">Borç</th>
            <th className="px-3 py-3 text-right font-semibold">Alacak</th>
            <th className="px-5 py-3 text-right font-semibold">Bakiye</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <LedgerRow key={r.id} entry={r} />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/50 text-sm font-semibold">
            <td className="px-5 py-3" colSpan={3}>
              Dönem toplamı · {rows.length} hareket
            </td>
            <td className="tabular px-3 py-3 text-right">{formatTRY(sums.d)}</td>
            <td className="tabular px-3 py-3 text-right text-success">{formatTRY(sums.c)}</td>
            <td className="tabular px-5 py-3 text-right">{formatTRY(account.balance)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Mobil liste */}
      <ul className="divide-y divide-border md:hidden">
        {rows.map((r) => {
          const m = typeMeta[r.type];
          const Icon = m.icon;
          const amount = r.debit || r.credit;
          return (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3.5">
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", m.tone)}>
                <Icon className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{r.description}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(r.date, { day: "numeric", month: "short" })} · {r.doc}
                </p>
              </div>
              <div className="text-right">
                <p className={cn("tabular text-sm font-bold", r.credit ? "text-success" : "")}>
                  {r.credit ? "−" : "+"}
                  {formatTRY(amount)}
                </p>
                <p className="tabular text-[11px] text-muted-foreground">Bakiye {formatTRY(r.balance)}</p>
              </div>
            </li>
          );
        })}
      </ul>
      {!rows.length && <p className="p-10 text-center text-sm text-muted-foreground">Bu dönemde hareket yok.</p>}
      <p className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground md:px-5">
        Hareketler silinmez; düzeltmeler ayrı bir kayıt olarak işlenir. Son güncelleme {formatDate(TODAY)}.
      </p>
    </Card>
  );
}

function LedgerRow({ entry: r }: { entry: LedgerEntry }) {
  const m = typeMeta[r.type];
  const Icon = m.icon;
  return (
    <tr className="transition-colors hover:bg-muted/50">
      <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">{formatDate(r.date)}</td>
      <td className="px-3 py-3 whitespace-nowrap">
        <span className="inline-flex items-center gap-2">
          <span className={cn("grid size-7 place-items-center rounded-lg", m.tone)}>
            <Icon className="size-3.5" />
          </span>
          <span className="font-medium">{r.doc}</span>
        </span>
      </td>
      <td className="px-3 py-3">{r.description}</td>
      <td className="tabular px-3 py-3 text-right">{r.debit ? formatTRY(r.debit) : <span className="text-muted-foreground">—</span>}</td>
      <td className="tabular px-3 py-3 text-right text-success">{r.credit ? formatTRY(r.credit) : <span className="text-muted-foreground">—</span>}</td>
      <td className="tabular px-5 py-3 text-right font-semibold">{formatTRY(r.balance)}</td>
    </tr>
  );
}

/* ───────────── Açık faturalar ───────────── */

function InvoicesTab() {
  const [selected, setSelected] = useState<string[]>(openInvoices.filter((i) => daysUntil(i.due) < 0).map((i) => i.id));
  const total = openInvoices.filter((i) => selected.includes(i.id)).reduce((s, i) => s + i.amount, 0);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-border">
        {openInvoices.map((inv) => {
          const days = daysUntil(inv.due);
          const overdue = days < 0;
          return (
            <li key={inv.id}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/50 md:px-5">
                <input
                  type="checkbox"
                  checked={selected.includes(inv.id)}
                  onChange={() => toggle(inv.id)}
                  className="size-4 shrink-0 accent-[var(--primary)]"
                />
                <div className="min-w-0 flex-1 md:grid md:grid-cols-[1fr_1fr_1fr] md:items-center md:gap-4">
                  <div>
                    <p className="text-sm font-semibold">{inv.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(inv.date)} · {inv.order}
                    </p>
                  </div>
                  <div className="mt-1.5 md:mt-0">
                    <Badge tone={overdue ? "danger" : days <= 10 ? "warning" : "neutral"}>
                      {overdue ? `${-days} gün gecikti` : `${days} gün kaldı`}
                    </Badge>
                    <span className="ml-2 text-xs text-muted-foreground">Vade {formatDate(inv.due, { day: "numeric", month: "short" })}</span>
                  </div>
                  <a
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    className="hidden items-center gap-1.5 text-sm font-medium text-primary hover:underline md:inline-flex"
                  >
                    <FileText className="size-4" /> e-Fatura
                  </a>
                </div>
                <p className="tabular text-sm font-bold">{formatTRY(inv.amount)}</p>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-4 md:px-5">
        <p className="text-sm">
          <span className="text-muted-foreground">{selected.length} fatura seçildi · </span>
          <span className="tabular font-bold">{formatTRY(total)}</span>
        </p>
        <Link
          href={`/portal/cari/borc-ode?faturalar=${selected.join(",")}`}
          aria-disabled={!selected.length}
          className={cn(buttonVariants(), !selected.length && "pointer-events-none opacity-50")}
        >
          <CreditCard /> Seçilenleri öde
        </Link>
      </div>
    </Card>
  );
}

/* ───────────── Ödemeler ───────────── */

const kindLabel = { debt: "Borç ödeme", topup: "Bakiye yükleme", link: "Ödeme linki" } as const;
const kindIcon = { debt: Landmark, topup: Wallet, link: Link2 } as const;

function PaymentsTab() {
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-border">
        {payments.map((p, i) => {
          const Icon = p.status === "failed" ? XCircle : kindIcon[p.kind];
          return (
            <li key={`${p.id}-${i}`} className="flex items-center gap-3 px-4 py-4 md:px-5">
              <span
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-xl",
                  p.status === "failed" ? "bg-danger-soft text-danger" : p.kind === "topup" ? "bg-success-soft text-success" : "bg-primary-soft text-primary",
                )}
              >
                <Icon className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1 md:grid md:grid-cols-[1.2fr_1fr_1fr] md:items-center md:gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{kindLabel[p.kind]}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.method}</p>
                </div>
                <p className="hidden text-sm text-muted-foreground md:block">
                  {formatDate(p.date)} · {p.id}
                </p>
                <div className="mt-1.5 md:mt-0">
                  {p.status === "success" ? <Badge tone="success">Başarılı</Badge> : <Badge tone="danger">Başarısız</Badge>}
                  {p.note && <p className="mt-1 text-[11px] text-muted-foreground">{p.note}</p>}
                </div>
              </div>
              <div className="text-right">
                <p className={cn("tabular text-sm font-bold", p.status === "failed" && "text-muted-foreground line-through")}>
                  {formatTRY(p.amount)}
                </p>
                <p className="text-[11px] text-muted-foreground md:hidden">{formatDate(p.date, { day: "numeric", month: "short" })}</p>
                {p.status === "success" && (
                  <button type="button" className="mt-0.5 hidden text-xs font-semibold text-primary hover:underline md:inline">
                    Makbuz
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ───────────── Ön ödeme ───────────── */

function PrepaidTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card className="overflow-hidden">
        <ul className="divide-y divide-border">
          {prepaidLedger
            .slice()
            .reverse()
            .map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-4 md:px-5">
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-xl",
                    e.amount > 0 ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
                  )}
                >
                  {e.amount > 0 ? <ArrowDownLeft className="size-[18px]" /> : <ArrowUpRight className="size-[18px]" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{e.description}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(e.date)}</p>
                </div>
                <div className="text-right">
                  <p className={cn("tabular text-sm font-bold", e.amount > 0 && "text-success")}>
                    {e.amount > 0 ? "+" : "−"}
                    {formatTRY(Math.abs(e.amount))}
                  </p>
                  <p className="tabular text-[11px] text-muted-foreground">Bakiye {formatTRY(e.balance)}</p>
                </div>
              </li>
            ))}
        </ul>
      </Card>
      <Card className="p-5">
        <p className="text-sm font-semibold">Ön ödeme nasıl çalışır?</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Yüklediğiniz tutar cari borcunuzdan ayrı tutulur ve sipariş verirken kullanılabilir. Borcunuzu kapatmak için{" "}
          <Link href="/portal/cari/borc-ode" className="font-semibold text-primary hover:underline">
            borç ödeme
          </Link>{" "}
          ekranını kullanın.
        </p>
        <Link href="/portal/cari/bakiye-yukle" className={cn(buttonVariants({ variant: "soft" }), "mt-4 w-full")}>
          <Wallet /> Bakiye yükle
        </Link>
      </Card>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-full bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 rounded-full px-3 text-xs font-semibold transition-colors",
            value === o.value ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
