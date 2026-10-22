"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { daysUntil, openInvoices } from "@/lib/ledger";
import { account } from "@/lib/mock";
import { cn, formatDate, formatTRY } from "@/lib/utils";
import { AmountOption, MoneyInput, PayLayout, Receipt, StepCard } from "./pay-layout";

const MONTH_END = "2026-10-31";

type Mode = "overdue" | "month" | "all" | "invoices" | "custom";

const overdueTotal = openInvoices.filter((i) => daysUntil(i.due) < 0).reduce((s, i) => s + i.amount, 0);
const monthTotal = openInvoices.filter((i) => i.due <= MONTH_END).reduce((s, i) => s + i.amount, 0);

export function PayDebt() {
  const params = useSearchParams();
  const preselected = params.get("faturalar")?.split(",").filter(Boolean) ?? [];
  const [mode, setMode] = useState<Mode>(preselected.length ? "invoices" : "overdue");
  const [selected, setSelected] = useState<string[]>(preselected);
  const [custom, setCustom] = useState(0);
  const [paid, setPaid] = useState(false);

  const invoicesTotal = openInvoices.filter((i) => selected.includes(i.id)).reduce((s, i) => s + i.amount, 0);
  const amount =
    mode === "overdue" ? overdueTotal : mode === "month" ? monthTotal : mode === "all" ? account.balance : mode === "invoices" ? invoicesTotal : custom;
  const newBalance = Math.max(account.balance - amount, 0);

  if (paid) {
    return (
      <Receipt
        title="Ödemeniz alındı"
        amount={amount}
        rows={[
          { label: "Tahsilat no", value: "TH-2026-0412" },
          { label: "İşlem türü", value: "Borç ödeme" },
          { label: "Kart", value: "•••• 4242 · Tek çekim" },
          { label: "Önceki bakiye", value: formatTRY(account.balance) },
          { label: "Yeni bakiye", value: formatTRY(newBalance) },
        ]}
        note="Ödeme kuruluşundan onay alındıktan sonra tutar cari hesabınıza alacak olarak işlendi. Aynı işlem tekrar gönderilse bile ikinci kez çekim yapılmaz."
      />
    );
  }

  return (
    <PayLayout
      title="Borç öde"
      description="Cari borcunuzu kredi kartıyla ödeyin. Ödeme, en eski vadeli faturadan başlayarak kapatılır."
      amount={amount}
      onPay={() => {
        setPaid(true);
        window.scrollTo({ top: 0 });
      }}
      summary={[
        { label: "Güncel borç", value: formatTRY(account.balance), tone: "muted" },
        { label: "Ödenecek tutar", value: `−${formatTRY(amount)}`, tone: "success" },
        { label: "Ödeme sonrası bakiye", value: formatTRY(newBalance), tone: "strong" },
      ]}
    >
      <StepCard step={1} title="Ödenecek tutar">
        <div className="space-y-2">
          <AmountOption active={mode === "overdue"} onClick={() => setMode("overdue")} title="Vadesi geçmiş borç" hint="Gecikme olmaması için önerilir" amount={overdueTotal} />
          <AmountOption active={mode === "month"} onClick={() => setMode("month")} title="Ay sonuna kadar vadesi gelenler" hint="Ekim ayı vadeleri dahil" amount={monthTotal} />
          <AmountOption active={mode === "all"} onClick={() => setMode("all")} title="Tüm borç" amount={account.balance} />
          <AmountOption active={mode === "invoices"} onClick={() => setMode("invoices")} title="Fatura seçerek öde" hint={`${selected.length} fatura seçili`} />
          {mode === "invoices" && (
            <ul className="space-y-1.5 rounded-xl bg-muted/60 p-2">
              {openInvoices.map((inv) => {
                const days = daysUntil(inv.due);
                const on = selected.includes(inv.id);
                return (
                  <li key={inv.id}>
                    <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors", on ? "bg-card shadow-card" : "hover:bg-card/60")}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setSelected((s) => (on ? s.filter((x) => x !== inv.id) : [...s, inv.id]))}
                        className="size-4 accent-[var(--primary)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{inv.id}</span>
                        <span className="block text-xs text-muted-foreground">Vade {formatDate(inv.due, { day: "numeric", month: "short" })}</span>
                      </span>
                      <Badge tone={days < 0 ? "danger" : "neutral"}>{days < 0 ? `${-days} gün gecikti` : `${days} gün`}</Badge>
                      <span className="tabular w-24 text-right text-sm font-bold">{formatTRY(inv.amount)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <AmountOption active={mode === "custom"} onClick={() => setMode("custom")} title="Farklı bir tutar gir" />
          {mode === "custom" && <MoneyInput value={custom} onChange={setCustom} max={account.balance} autoFocus />}
        </div>
        <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" />
          Siparişlerde kullanmak üzere ön ödeme yapmak isterseniz bakiye yükleme ekranını kullanın; iki işlem muhasebede ayrı kaydedilir.
        </p>
      </StepCard>
    </PayLayout>
  );
}
