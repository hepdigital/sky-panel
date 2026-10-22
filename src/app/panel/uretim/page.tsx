import type { Metadata } from "next";
import { Kanban } from "@/components/admin/kanban";

export const metadata: Metadata = { title: "Üretim panosu" };

export default function ProductionPage() {
  return <Kanban />;
}
