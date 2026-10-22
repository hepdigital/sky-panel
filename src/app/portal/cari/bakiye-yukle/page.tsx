import type { Metadata } from "next";
import { TopUp } from "@/components/portal/top-up";

export const metadata: Metadata = { title: "Bakiye Yükle" };

export default function TopUpPage() {
  return <TopUp />;
}
