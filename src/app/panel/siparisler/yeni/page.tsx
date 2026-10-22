import { Suspense } from "react";
import type { Metadata } from "next";
import { QuoteBuilder } from "@/components/admin/quote-builder";

export const metadata: Metadata = { title: "Müşteri adına sipariş" };

export default function NewOrderPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1300px] animate-pulse rounded-2xl bg-muted" />}>
      <QuoteBuilder mode="order" />
    </Suspense>
  );
}
