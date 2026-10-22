"use client";

import { useState } from "react";
import { CheckCircle2, Clock } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { CardFields, PayLabel, SecureNote } from "@/components/portal/card-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatTRY } from "@/lib/utils";

const request = {
  dealer: "Akdeniz Reklam Ltd. Şti.",
  customer: "Mavi Kafe",
  amount: 12_000,
  description: "Baskılı gazebo çadır · 2 adet",
  expires: "19 Ekim 2026, 23:59",
};

/** Bayinin müşterisinin açtığı herkese açık ödeme sayfası. Giriş gerektirmez. */
export function PublicPay() {
  const [paid, setPaid] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-md items-center justify-between px-5 pt-5">
        <Logo className="h-6" />
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-6 pb-10">
        {paid ? (
          <Card className="p-6 text-center">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-success-soft text-success">
              <CheckCircle2 className="size-8" />
            </span>
            <h1 className="mt-4 text-xl font-bold">Ödemeniz alındı</h1>
            <p className="tabular mt-2 text-3xl font-bold tracking-tight">{formatTRY(request.amount)}</p>
            <p className="mt-3 text-sm text-muted-foreground">
              {request.dealer} bilgilendirildi. Ödeme dekontunuz SMS ile gönderildi.
            </p>
          </Card>
        ) : (
          <>
            <Card className="overflow-hidden">
              <div className="bg-inverse px-5 py-5 text-inverse-foreground">
                <p className="text-xs text-white/60">Ödeme talebi</p>
                <p className="mt-0.5 font-semibold">{request.dealer}</p>
                <p className="tabular mt-4 text-[34px] leading-none font-bold tracking-tight">{formatTRY(request.amount)}</p>
                <p className="mt-2 text-sm text-white/70">{request.description}</p>
              </div>
              <div className="flex items-center gap-2 px-5 py-3 text-xs text-muted-foreground">
                <Clock className="size-3.5" /> Son geçerlilik {request.expires}
              </div>
            </Card>

            <Card className="mt-4 p-5">
              <h2 className="text-[15px] font-semibold">Kart bilgileri</h2>
              <div className="mt-4">
                <CardFields amount={request.amount} />
              </div>
              <Button size="lg" className="mt-5 w-full" onClick={() => setPaid(true)}>
                <PayLabel amount={request.amount} />
              </Button>
              <SecureNote className="mt-3" />
            </Card>
          </>
        )}
      </main>

      <footer className="pb-6 text-center text-[11px] text-muted-foreground">
        Bu ödeme Sky Görsel Çözümler altyapısı ile güvenle alınmaktadır.
      </footer>
    </div>
  );
}
