"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function QtyStepper({
  value,
  onChange,
  size = "md",
  className,
}: {
  value: number;
  onChange: (qty: number) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const h = size === "sm" ? "h-9" : "h-10";
  const btn = size === "sm" ? "size-9" : "size-10";
  return (
    <div className={cn("inline-flex items-center rounded-full border border-border bg-card", h, className)}>
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        className={cn("grid shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", btn)}
        aria-label={value === 1 ? "Sepetten çıkar" : "Azalt"}
      >
        {value === 1 ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
      </button>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
          onChange(Number.isNaN(n) ? 0 : n);
        }}
        className="tabular w-full min-w-8 bg-transparent text-center text-sm font-semibold outline-none"
        aria-label="Adet"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className={cn("grid shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-muted", btn)}
        aria-label="Arttır"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
