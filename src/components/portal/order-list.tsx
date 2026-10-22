import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { paymentStatusMeta, productionStatusMeta, type Order } from "@/lib/mock";
import { formatDate, formatTRY } from "@/lib/utils";

/** Masaüstünde tablo, mobilde kart görünümü. Ödeme ve üretim durumu ayrı rozetlerle gösterilir. */
export function OrderList({ orders }: { orders: Order[] }) {
  return (
    <div>
      {/* Başlık satırı — yalnızca masaüstü */}
      <div className="hidden grid-cols-[1.4fr_0.8fr_1fr_1fr_0.9fr_20px] gap-4 border-b border-border px-5 pb-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase md:grid">
        <span>Sipariş</span>
        <span>Tarih</span>
        <span>Ödeme</span>
        <span>Üretim</span>
        <span className="text-right">Tutar</span>
        <span />
      </div>

      <ul className="divide-y divide-border">
        {orders.map((o) => {
          const pay = paymentStatusMeta[o.payment];
          const prod = productionStatusMeta[o.production];
          return (
            <li key={o.id}>
              <Link
                href={`/portal/siparisler/${o.id}`}
                className="group grid grid-cols-[1fr_auto] gap-x-3 gap-y-2.5 px-5 py-4 transition-colors hover:bg-muted/60 md:grid-cols-[1.4fr_0.8fr_1fr_1fr_0.9fr_20px] md:items-center md:gap-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{o.items}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {o.id}
                    <span className="md:hidden"> · {formatDate(o.date, { day: "numeric", month: "short" })}</span>
                    {o.itemCount > 1 && ` · ${o.itemCount} adet`}
                  </p>
                </div>
                <span className="hidden text-sm text-muted-foreground md:block">{formatDate(o.date)}</span>
                <div className="col-span-2 row-start-2 flex flex-wrap gap-1.5 md:hidden">
                  <Badge tone={pay.tone}>{pay.label}</Badge>
                  <Badge tone={prod.tone}>{prod.label}</Badge>
                </div>
                <span className="hidden md:block">
                  <Badge tone={pay.tone}>{pay.label}</Badge>
                </span>
                <span className="hidden md:block">
                  <Badge tone={prod.tone}>{prod.label}</Badge>
                </span>
                <span className="tabular col-start-2 row-start-1 text-right text-sm font-semibold md:col-start-auto md:row-start-auto">
                  {formatTRY(o.total)}
                </span>
                <ChevronRight className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 md:block" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
