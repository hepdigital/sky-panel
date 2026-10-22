"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import type { Order } from "@/lib/mock";
import { cn } from "@/lib/utils";
import { OrderList } from "./order-list";

const tabs = [
  { key: "all", label: "Tümü", match: () => true },
  { key: "action", label: "Onayınızda", match: (o: Order) => o.production === "design_review" },
  { key: "active", label: "Devam eden", match: (o: Order) => !["delivered"].includes(o.production) },
  { key: "done", label: "Tamamlanan", match: (o: Order) => o.production === "delivered" },
] as const;

export function OrderFilters({ orders }: { orders: Order[] }) {
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("all");
  const current = tabs.find((t) => t.key === tab)!;
  const visible = orders.filter(current.match);

  return (
    <>
      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
        {tabs.map((t) => {
          const count = orders.filter(t.match).length;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors",
                tab === t.key
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "grid min-w-5 place-items-center rounded-full px-1 text-[11px]",
                  t.key === "action" && count ? "bg-warning text-white" : "opacity-70",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
      <Card className="mt-4 overflow-hidden pt-4">
        {visible.length ? (
          <OrderList orders={visible} />
        ) : (
          <p className="p-10 text-center text-sm text-muted-foreground">Bu filtrede sipariş yok.</p>
        )}
      </Card>
    </>
  );
}
