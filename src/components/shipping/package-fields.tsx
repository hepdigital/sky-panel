"use client";

import { cargoOf, chargeable, desiOf, type Paket, type Tariff } from "@/lib/cargo-tariff";
import { cn } from "@/lib/utils";

/** Koli taslağı: alanlar metin olarak (boş = girilmedi) */
export type PaketDraft = { en: string; boy: string; yukseklik: string; kg: string; adet: string };

const num = (v: string) => {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const show = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

export const draftOf = (p: Paket | null | undefined): PaketDraft => ({ en: show(p?.en), boy: show(p?.boy), yukseklik: show(p?.yukseklik), kg: show(p?.kg), adet: p && p.adet > 1 ? String(p.adet) : "" });
export const paketOf = (d: PaketDraft): Paket | null => {
  const p = { en: num(d.en), boy: num(d.boy), yukseklik: num(d.yukseklik), kg: num(d.kg), adet: Math.max(1, Math.round(num(d.adet) ?? 1)) };
  return p.en === null && p.boy === null && p.yukseklik === null && p.kg === null ? null : p;
};

export const tl = (n: number) => `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;

/** Koli ücreti özeti: "36 desi · 1 koli · 518,46 ₺ + KDV (622,15 ₺)" */
export function CargoLine({ tarife, paket, className }: { tarife: Tariff; paket: Paket | null; className?: string }) {
  if (!paket) return <span className={cn("text-[11px] text-muted-foreground", className)}>Ölçü ya da kilo girilince Yurtiçi ücreti hesaplanır.</span>;
  const d = desiOf(paket);
  const u = chargeable(paket);
  const c = cargoOf(tarife, [paket]);
  return (
    <span className={cn("text-[11px] text-muted-foreground", className)}>
      {d !== null && `${d.toLocaleString("tr-TR")} desi · `}
      {paket.kg ? `${paket.kg.toLocaleString("tr-TR")} kg · ` : ""}
      ücretli {u} desi{c.koli > 1 ? ` × ${c.koli} koli` : ""} · Yurtiçi <b className="text-foreground">{tl(c.haric)}</b> + KDV ({tl(c.dahil)})
    </span>
  );
}

/** En / boy / yükseklik (cm), kilo ve koli adedi; altında desi ve Yurtiçi ücreti */
export function PackageFields({ value, onChange, tarife, compact }: { value: PaketDraft; onChange: (v: PaketDraft) => void; tarife: Tariff; compact?: boolean }) {
  const input = cn("w-full rounded-xl border border-input bg-card px-2.5 text-right text-sm outline-none tabular focus:border-primary", compact ? "h-9" : "h-10");
  const fields: [keyof PaketDraft, string][] = [
    ["en", "En (cm)"],
    ["boy", "Boy (cm)"],
    ["yukseklik", "Yükseklik (cm)"],
    ["kg", "Kilo"],
    ["adet", "Koli"],
  ];
  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {fields.map(([k, l]) => (
          <label key={k} className="block">
            <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">{l}</span>
            <input value={value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.value })} inputMode="decimal" className={input} placeholder={k === "adet" ? "1" : ""} />
          </label>
        ))}
      </div>
      <CargoLine tarife={tarife} paket={paketOf(value)} className="mt-1.5 block" />
    </div>
  );
}
