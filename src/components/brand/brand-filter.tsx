"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export type BrandOption = { kod: string; ad: string; renk: string };

/** Marka etiketi: renkli nokta + ad */
export function BrandTag({ ad, renk, className }: { ad: string | null; renk?: string | null; className?: string }) {
  if (!ad) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold", className)}>
      <span className="size-2 rounded-full" style={{ background: renk ?? "#888" }} />
      {ad}
    </span>
  );
}

/** Marka süzgeci (?marka=kod); birden az marka varsa gösterilmez. Diğer adres parametreleri korunur. */
export function BrandFilter({ brands, active }: { brands: BrandOption[]; active: string | null }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  if (brands.length < 2) return null;
  const href = (kod: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (kod) p.set("marka", kod);
    else p.delete("marka");
    return p.size ? `${pathname}?${p}` : pathname;
  };
  return (
    <div className="inline-flex flex-wrap rounded-full bg-muted p-1">
      {[{ kod: null as string | null, ad: "Tüm markalar", renk: "" }, ...brands].map((b) => (
        <Link
          key={b.kod ?? "hepsi"}
          href={href(b.kod)}
          className={cn("flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold", active === b.kod ? "bg-card shadow-card" : "text-muted-foreground")}
        >
          {b.kod && <span className="size-2 rounded-full" style={{ background: b.renk }} />}
          {b.ad}
        </Link>
      ))}
    </div>
  );
}
