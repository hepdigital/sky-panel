"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { account } from "@/lib/mock";
import { cn, formatTRY } from "@/lib/utils";
import { MoneyInput, PayLayout, Receipt, StepCard } from "./pay-layout";

const presets = [5_000, 10_000, 25_000, 50_000];

export function TopUp() {
  const [amount, setAmount] = useState(10_000);
  const [paid, setPaid] = useState(false);

  if (paid) {
    return (
      <Receipt
        title="Bakiyeniz yüklendi"
        amount={amount}
        rows={[
          { label: "İşlem no", value: "BY-2026-0027" },
          { label: "İşlem türü", value: "Ön ödeme (bakiye yükleme)" },
          { label: "Kart", value: "•••• 4242 · Tek çekim" },
          { label: "Yeni ön ödeme bakiyesi", value: formatTRY(account.prepaid + amount) },
        ]}
        note="Bu tutar cari borcunuzdan ayrı tutulur ve sonraki siparişlerinizde ödeme yöntemi olarak kullanılabilir."
      />
    );
  }

  return (
    <PayLayout
      title="Bakiye yükle"
      description="Sonraki siparişlerinizde kullanmak üzere hesabınıza ön ödeme yapın."
      amount={amount}
      onPay={() => {
        setPaid(true);
        window.scrollTo({ top: 0 });
      }}
      summary={[
        { label: "Mevcut ön ödeme bakiyesi", value: formatTRY(account.prepaid), tone: "muted" },
        { label: "Yüklenecek tutar", value: `+${formatTRY(amount)}`, tone: "success" },
        { label: "Yükleme sonrası bakiye", value: formatTRY(account.prepaid + amount), tone: "strong" },
      ]}
    >
      <StepCard step={1} title="Yüklenecek tutar">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmount(p)}
              className={cn(
                "tabular h-12 rounded-xl border text-sm font-bold transition-colors",
                amount === p ? "border-primary bg-primary-soft/60 text-primary-soft-foreground" : "border-border hover:bg-muted/50",
              )}
            >
              {formatTRY(p, { whole: true })}
            </button>
          ))}
        </div>
        <p className="mt-4 mb-1.5 text-sm font-medium">veya tutar girin</p>
        <MoneyInput value={amount} onChange={setAmount} />

        <div className="mt-4 flex gap-3 rounded-xl bg-success-soft/70 p-4">
          <Wallet className="mt-0.5 size-5 shrink-0 text-success" />
          <p className="text-sm">
            <span className="font-semibold">Ön ödeme borçtan ayrıdır.</span>{" "}
            <span className="text-muted-foreground">
              Yüklediğiniz tutar mevcut borcunuzu kapatmaz; sipariş verirken &quot;Ön ödeme bakiyemi kullan&quot; seçeneğiyle harcanır.
            </span>
          </p>
        </div>
      </StepCard>
    </PayLayout>
  );
}
