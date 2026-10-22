import type { Metadata } from "next";
import { Checkout } from "@/components/portal/checkout";

export const metadata: Metadata = { title: "Sipariş Ver" };

export default function CheckoutPage() {
  return <Checkout />;
}
