import { Suspense } from "react";
import type { Metadata } from "next";
import { PayDebt } from "@/components/portal/pay-debt";

export const metadata: Metadata = { title: "Borç Öde" };

export default function PayDebtPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1100px] animate-pulse rounded-2xl bg-muted" />}>
      <PayDebt />
    </Suspense>
  );
}
