"use client";

import { useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Adet: − / + ve elle yazma. Yazarken alan boşalabilir (silip yeni sayı yazmak için); boş ya da 0 adet gönderilmez,
 * alandan çıkınca eski adete döner. Kaldırma yalnızca 1'deyken çöp kutusuyla.
 */
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
  /** Yazılmakta olan metin; null: alan adeti gösterir */
  const [text, setText] = useState<string | null>(null);
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
        value={text ?? value}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const t = e.target.value.replace(/\D/g, "").slice(0, 4);
          setText(t);
          const n = parseInt(t, 10);
          if (n > 0) onChange(n);
        }}
        onBlur={() => setText(null)}
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
