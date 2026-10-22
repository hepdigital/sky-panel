"use client";

import Image from "next/image";
import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QtyStepper } from "@/components/ui/qty-stepper";
import { imgSrc, val, type CatalogGroup, type Mode } from "@/lib/terminal/calc";
import { cn } from "@/lib/utils";

/** Bir ürün grubunun ürünleri: kart, fiyat ve adet */
export function CatalogCard({
  group,
  prod,
  setProd,
  mode,
  money,
}: {
  group: CatalogGroup;
  prod: Record<string, number>;
  setProd: (id: string, n: number) => void;
  mode: Mode;
  money: (n: number) => string;
}) {
  return (
    <Card className="p-4 md:p-5">
      <h2 className="text-[17px] font-bold tracking-tight">{group.title}</h2>
      {group.lead && <p className="mt-1 text-xs text-muted-foreground">{group.lead}</p>}
      {group.warn && (
        <p className="mt-2 flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
          <AlertTriangle className="mt-px size-3.5 shrink-0" /> {group.warn}
        </p>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {group.items.map((it) => {
          const pr = val(it.p, mode);
          const qty = prod[it.id] || 0;
          return (
            <div key={it.id} className={cn("flex flex-col gap-2 rounded-xl border p-3", qty ? "border-primary bg-primary-soft/40" : "border-border")}>
              <span className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-white ring-1 ring-border">
                {it.img && <Image src={imgSrc(it.img)} alt="" fill sizes="240px" className="object-contain p-2" unoptimized={it.img.startsWith("/dosya/")} />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">{it.n}</p>
                <p className="text-[11px] text-muted-foreground">{it.s}</p>
                {it.warn && <p className="text-[11px] font-medium text-warning">{it.warn}</p>}
              </div>
              <div className="mt-auto flex items-center justify-between gap-2">
                <span className="tabular text-sm font-bold">{pr === null ? "Fiyat sorunuz" : money(pr)}</span>
                {pr !== null &&
                  (qty ? (
                    <QtyStepper size="sm" className="w-24" value={qty} onChange={(n) => setProd(it.id, n)} />
                  ) : (
                    <Button size="sm" variant="soft" onClick={() => setProd(it.id, 1)}>
                      <Plus /> Ekle
                    </Button>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
