"use client";

import { useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { cn, formatTRY } from "@/lib/utils";

/**
 * Ödeme kuruluşunun (iyzico / PayTR / banka sanal POS) kart alanlarını temsil eder.
 * Gerçek sistemde bu alanlar ödeme kuruluşunun güvenli formunda yer alır;
 * kart bilgisi Sky sunucularına hiç ulaşmaz.
 */
export function CardFields({ amount, installments = true }: { amount: number; installments?: boolean }) {
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");

  return (
    <div className="space-y-3">
      <Field label="Kart üzerindeki isim" placeholder="AD SOYAD" autoComplete="cc-name" />
      <Field
        label="Kart numarası"
        placeholder="0000 0000 0000 0000"
        inputMode="numeric"
        autoComplete="cc-number"
        value={number}
        onChange={(e) =>
          setNumber(
            e.target.value
              .replace(/\D/g, "")
              .slice(0, 16)
              .replace(/(\d{4})(?=\d)/g, "$1 "),
          )
        }
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Son kullanma"
          placeholder="AA / YY"
          inputMode="numeric"
          autoComplete="cc-exp"
          value={expiry}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, "").slice(0, 4);
            setExpiry(d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d);
          }}
        />
        <Field label="CVC" placeholder="•••" inputMode="numeric" autoComplete="cc-csc" maxLength={4} />
      </div>
      {installments && (
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Taksit</span>
          <select className="h-11 w-full rounded-xl border border-input bg-card px-3 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15">
            <option>Tek çekim · {formatTRY(amount)}</option>
            <option>3 taksit · {formatTRY(amount / 3)} / ay</option>
            <option>6 taksit · {formatTRY(amount / 6)} / ay</option>
          </select>
        </label>
      )}
    </div>
  );
}

export function SecureNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start justify-center gap-1.5 text-center text-[11px] text-muted-foreground", className)}>
      <ShieldCheck className="mt-px size-3.5 shrink-0" />
      3D Secure ile korunur. Kart bilgileri ödeme kuruluşunda işlenir, Sky sistemlerinde saklanmaz.
    </p>
  );
}

export function PayLabel({ amount }: { amount: number }) {
  return (
    <>
      <Lock /> {formatTRY(amount)} öde
    </>
  );
}

function Field({ label, className, ...props }: { label: string } & React.ComponentProps<"input">) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium">{label}</span>
      <input
        {...props}
        className={cn(
          "tabular h-11 w-full rounded-xl border border-input bg-card px-4 outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/15",
          className,
        )}
      />
    </label>
  );
}
