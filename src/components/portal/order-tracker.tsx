import { Check } from "lucide-react";
import { productionSteps, type ProductionStatus } from "@/lib/mock";
import { cn } from "@/lib/utils";

type StepLog = { date?: string; by?: string; note?: string };

/** Sipariş üretim sürecini dikey zaman çizelgesi olarak gösterir. */
export function OrderTracker({
  current,
  logs,
}: {
  current: ProductionStatus;
  logs: Partial<Record<ProductionStatus, StepLog>>;
}) {
  const currentIndex = productionSteps.findIndex((s) => s.key === current);

  return (
    <ol className="relative">
      {productionSteps.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const log = i <= currentIndex ? logs[step.key] : undefined;
        const last = i === productionSteps.length - 1;
        return (
          <li key={step.key} className="relative flex gap-3.5 pb-5 last:pb-0">
            {!last && (
              <span
                className={cn("absolute top-7 bottom-0 left-[13px] w-0.5 rounded-full", done ? "bg-primary" : "bg-border")}
              />
            )}
            <span
              className={cn(
                "relative z-10 grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                done && "bg-primary text-primary-foreground",
                active && "bg-warning-soft text-warning ring-4 ring-warning/15",
                !done && !active && "border-2 border-border bg-card text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={cn("text-sm font-semibold", !done && !active && "text-muted-foreground")}>{step.label}</p>
              {log && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[log.date, log.by].filter(Boolean).join(" · ")}
                </p>
              )}
              {active && log?.note && (
                <p className="mt-2 rounded-lg bg-warning-soft px-3 py-2 text-xs font-medium text-warning">{log.note}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
