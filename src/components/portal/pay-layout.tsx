"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatTRY } from "@/lib/utils";
import { CardFields, PayLabel, SecureNote } from "./card-form";

export type SummaryRow = { label: string; value: string; tone?: "success" | "muted" | "strong" };

/** Borç ödeme ve bakiye yükleme ekranlarının ortak yerleşimi. */
export function PayLayout({
  title,
  description,
  amount,
  summary,
  onPay,
  children,
}: {
  title: string;
  description: string;
  amount: number;
  summary: SummaryRow[];
  onPay: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1100px] pb-24 lg:pb-0">
      <Link href="/portal/cari" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Cari hesap
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight md:text-[28px]">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {children}
          <Card className="p-4 md:p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
              <h2 className="text-[15px] font-semibold">Kart bilgileri</h2>
            </div>
            <CardFields amount={amount} />
          </Card>
        </div>

        <aside className="lg:sticky lg:top-[92px]">
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">Ödeme özeti</h2>
            <dl className="mt-4 space-y-2 text-sm">
              {summary.map((r) => (
                <div
                  key={r.label}
                  className={cn(
                    "flex justify-between gap-3",
                    r.tone === "muted" && "text-muted-foreground",
                    r.tone === "success" && "text-success",
                    r.tone === "strong" && "font-semibold",
                  )}
                >
                  <dt>{r.label}</dt>
                  <dd className="tabular text-right font-medium">{r.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
              <span className="text-sm font-semibold">Karttan çekilecek</span>
              <span className="tabular text-2xl font-bold tracking-tight">{formatTRY(amount)}</span>
            </div>
            <Button size="lg" className="mt-5 hidden w-full lg:inline-flex" onClick={onPay} disabled={amount <= 0}>
              <PayLabel amount={amount} />
            </Button>
            <SecureNote className="mt-3" />
          </Card>
        </aside>
      </div>

      {/* Mobil sabit çubuk */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-[11px] text-muted-foreground">Karttan çekilecek</p>
            <p className="tabular text-lg font-bold">{formatTRY(amount)}</p>
          </div>
          <Button size="lg" onClick={onPay} disabled={amount <= 0}>
            <PayLabel amount={amount} />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function StepCard({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4 md:p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{step}</span>
        <h2 className="text-[15px] font-semibold">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

/** Başarılı ödeme sonrası makbuz. Cari, ödeme kuruluşundan onay geldikten sonra güncellenir. */
export function Receipt({
  title,
  amount,
  rows,
  note,
}: {
  title: string;
  amount: number;
  rows: { label: string; value: string }[];
  note: string;
}) {
  return (
    <div className="mx-auto max-w-md pt-4 md:pt-10">
      <Card className="overflow-hidden">
        <div className="px-6 pt-8 pb-6 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-success-soft text-success">
            <CheckCircle2 className="size-8" />
          </span>
          <h1 className="mt-4 text-xl font-bold">{title}</h1>
          <p className="tabular mt-2 text-3xl font-bold tracking-tight">{formatTRY(amount)}</p>
        </div>
        <div className="relative border-t border-dashed border-border px-6 py-5">
          <span className="absolute -top-3 -left-3 size-6 rounded-full bg-background" />
          <span className="absolute -top-3 -right-3 size-6 rounded-full bg-background" />
          <dl className="space-y-2.5 text-sm">
            {rows.map((r) => (
              <div key={r.label} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{r.label}</dt>
                <dd className="tabular text-right font-semibold">{r.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 rounded-xl bg-muted px-3 py-2.5 text-xs text-muted-foreground">{note}</p>
        </div>
        <div className="flex flex-col gap-2 border-t border-border p-5 sm:flex-row">
          <Button variant="outline" size="lg" className="sm:flex-1">
            <Download /> Makbuz
          </Button>
          <Link href="/portal/cari" className={cn(buttonVariants({ size: "lg" }), "sm:flex-1")}>
            Cari hesaba dön
          </Link>
        </div>
      </Card>
    </div>
  );
}

/** Sabit tutar seçenekleri + serbest tutar. */
export function AmountOption({
  active,
  onClick,
  title,
  hint,
  amount,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint?: string;
  amount?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors",
        active ? "border-primary bg-primary-soft/60" : "border-border hover:bg-muted/50",
      )}
    >
      <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2", active ? "border-primary bg-primary" : "border-input")}>
        {active && <span className="size-2 rounded-full bg-primary-foreground" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      {amount !== undefined && <span className="tabular text-sm font-bold">{formatTRY(amount)}</span>}
    </button>
  );
}

export function MoneyInput({
  value,
  onChange,
  max,
  autoFocus,
}: {
  value: number;
  onChange: (n: number) => void;
  max?: number;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex h-14 items-center gap-2 rounded-xl border border-input bg-card px-4 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
      <span className="text-lg font-semibold text-muted-foreground">₺</span>
      <input
        autoFocus={autoFocus}
        inputMode="decimal"
        value={value ? value.toLocaleString("tr-TR") : ""}
        placeholder="0"
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
          onChange(Number.isFinite(n) ? (max ? Math.min(n, max) : n) : 0);
        }}
        className="tabular w-full bg-transparent text-xl font-bold outline-none placeholder:text-muted-foreground"
      />
      {max !== undefined && (
        <button type="button" onClick={() => onChange(max)} className="shrink-0 text-xs font-semibold text-primary hover:underline">
          Tümü
        </button>
      )}
    </label>
  );
}
