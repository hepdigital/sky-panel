import type { Metadata } from "next";
import { PaymentLinks } from "@/components/portal/payment-links";

export const metadata: Metadata = { title: "Ödeme Linki" };

export default function PaymentLinkPage() {
  return <PaymentLinks />;
}
