import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { OrderFilters } from "@/components/portal/order-filters";
import { buttonVariants } from "@/components/ui/button";
import { recentOrders } from "@/lib/mock";

export const metadata: Metadata = { title: "Siparişler" };

export default function OrdersPage() {
  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Siparişler</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ödeme ve üretim durumlarını ayrı ayrı takip edin.</p>
        </div>
        <Link href="/portal/urunler" className={buttonVariants({ variant: "outline" })}>
          <Plus /> Yeni sipariş
        </Link>
      </div>
      <OrderFilters orders={recentOrders} />
    </div>
  );
}
