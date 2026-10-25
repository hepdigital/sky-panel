"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QtyStepper } from "@/components/ui/qty-stepper";
import { recolor, recolored } from "@/lib/terminal/recolor";
import { useOutOfStock } from "./color-stock";
import { COLORS, OPT_SUFFIX, colorName, imgSrc, prodKey, splitKey, val, type CatalogGroup, type CatalogItem, type Mode } from "@/lib/terminal/calc";
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
          if (it.hidden) return null;
          if (it.renk || it.opt) return <VariantItem key={it.id} it={it} prod={prod} setProd={setProd} mode={mode} money={money} />;
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

/**
 * Renk seçilebilir ve/veya ek seçenekli ürün: renk seçilir, seçenek anahtarla açılır; adet o birleşime yazılır.
 * Her birleşim teklifte ayrı satırdır ("1×1 panel · Kumaş baskı dahil", "… · Sarı").
 */
function VariantItem({ it, prod, setProd, mode, money }: { it: CatalogItem; prod: Record<string, number>; setProd: (id: string, n: number) => void; mode: Mode; money: (n: number) => string }) {
  const out = useOutOfStock();
  const [hex, setHex] = useState<string | null>(it.renk ? (COLORS.find((c) => !out.has(c.hex)) ?? COLORS[0]).hex : null);
  // Renkli ürünün görseli seçilen renge boyanır (ör. sarı şemsiye → kırmızı)
  const photo = it.img ? imgSrc(it.img) : null;
  const [painted, setPainted] = useState<{ key: string; url: string } | null>(null);
  const paintKey = photo && hex ? `${photo}|${hex}` : null;
  useEffect(() => {
    if (!photo || !hex) return;
    let live = true;
    void recolor(photo, hex).then((url) => live && setPainted({ key: `${photo}|${hex}`, url }));
    return () => {
      live = false;
    };
  }, [photo, hex]);
  const shown = (paintKey && painted?.key === paintKey ? painted.url : null) ?? (photo && hex ? recolored(photo, hex) : null) ?? photo;
  const [on, setOn] = useState(false);
  const base = val(it.p, mode);
  const extra = it.opt ? val(it.opt.p, mode) : null;
  const pr = base === null ? null : base + (on && extra !== null ? extra : 0);
  const id = on ? it.id + OPT_SUFFIX : it.id;
  const key = prodKey(id, hex);
  const qty = prod[key] || 0;
  // Sepetteki tüm birleşimler (renk × seçenek)
  const lines = Object.keys(prod).filter((k) => (prod[k] || 0) > 0 && [it.id, it.id + OPT_SUFFIX].includes(splitKey(k).id));
  const label = (k: string) => {
    const { id: kid, hex: h } = splitKey(k);
    return [h ? colorName(h) : null, it.opt ? (kid.endsWith(OPT_SUFFIX) ? "baskılı" : "baskısız") : null].filter(Boolean).join(" ");
  };
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border p-3", lines.length ? "border-primary bg-primary-soft/40" : "border-border")}>
      <span className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-white ring-1 ring-border">
        {shown && <Image src={shown} alt="" fill sizes="240px" className="object-contain p-2" unoptimized={!shown.startsWith("/terminal/")} />}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight">{it.n}</p>
        <p className="text-[11px] text-muted-foreground">{it.s}</p>
        {it.warn && <p className="text-[11px] font-medium text-warning">{it.warn}</p>}
      </div>
      {it.opt && extra !== null && (
        <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-2 text-xs font-semibold">
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="size-4 accent-[var(--primary)]" />
          {it.opt.n}
          <span className="ml-auto font-normal text-muted-foreground">+{money(extra)}</span>
        </label>
      )}
      {it.renk && (
        <div>
          <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
            Renk: <span className="text-foreground">{colorName(hex ?? undefined)}</span>
            {hex && out.has(hex) && <span className="ml-1 text-danger">· stokta yok</span>}
          </p>
          <div className="flex flex-wrap gap-1">
            {COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                title={out.has(c.hex) ? `${c.name} · stokta yok` : c.name}
                aria-label={out.has(c.hex) ? `${c.name} (stokta yok)` : c.name}
                aria-pressed={hex === c.hex}
                disabled={out.has(c.hex) && hex !== c.hex}
                onClick={() => setHex(c.hex)}
                style={{ background: c.hex }}
                className={cn(
                  "relative size-6 rounded-full ring-1 ring-black/15",
                  out.has(c.hex) && "cursor-not-allowed opacity-25",
                  hex === c.hex && "ring-2 ring-primary ring-offset-2 ring-offset-card",
                  lines.some((k) => splitKey(k).hex === c.hex) && "after:absolute after:-right-0.5 after:-top-0.5 after:size-2 after:rounded-full after:bg-primary",
                )}
              />
            ))}
          </div>
        </div>
      )}
      {lines.length > 0 && (lines.length > 1 || it.renk) && (
        <p className="text-[11px] text-muted-foreground">Sepette: {lines.map((k) => `${prod[k]} ${label(k)}`).join(", ")}</p>
      )}
      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="tabular text-sm font-bold">{pr === null ? "Fiyat sorunuz" : money(pr)}</span>
        {pr !== null &&
          (qty ? (
            <QtyStepper size="sm" className="w-24" value={qty} onChange={(n) => setProd(key, n)} />
          ) : (
            <Button size="sm" variant="soft" onClick={() => setProd(key, 1)}>
              <Plus /> Ekle
            </Button>
          ))}
      </div>
    </div>
  );
}
