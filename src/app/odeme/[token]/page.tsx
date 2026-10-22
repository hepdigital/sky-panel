import type { Metadata } from "next";
import { PublicPay } from "@/components/public-pay";

export const metadata: Metadata = { title: "Güvenli Ödeme" };

export function generateStaticParams() {
  return [{ token: "demo" }];
}

export default function PublicPayPage() {
  return <PublicPay />;
}
