"use client";

import { useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { musteriAra } from "@/app/panel/teklifler/actions";
import { Badge } from "@/components/ui/badge";
import type { QuoteCustomer } from "./save-sheet";

type Hit = Awaited<ReturnType<typeof musteriAra>>[number];

/** "Bayi A · Toptan · %10 ind." */
export function groupText(g: NonNullable<QuoteCustomer["grup"]>) {
  const oran = g.oran ? ` · %${String(Math.abs(g.oran)).replace(".", ",")} ${g.oran > 0 ? "ind." : "ilave"}` : "";
  return `${g.ad} · ${g.liste === "toptan" ? "Toptan" : "Perakende"}${oran}`;
}

export const hitToCustomer = (h: Hit): QuoteCustomer => ({ id: h.id, firma: h.firma, yetkili: h.yetkili ?? "", telefon: h.telefon ?? "", eposta: h.eposta ?? "", grup: h.grup, kanalId: h.kanalId });

/** Teklifin müşterisi: kayıtlı müşterilerde arar; seçilen müşterinin iskonto grubu fiyatlara uygulanır */
export function CustomerBar({ customer, onChange }: { customer: QuoteCustomer | null; onChange: (c: QuoteCustomer | null) => void }) {
  const [text, setText] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const search = (v: string) => {
    clearTimeout(timer.current);
    if (v.trim().length < 2) return setHits([]);
    timer.current = setTimeout(() => musteriAra(v).then(setHits).catch(() => setHits([])), 200);
  };

  if (customer)
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-border bg-card px-4 py-3">
        <span className="text-xs font-semibold text-muted-foreground">Müşteri</span>
        <span className="text-sm font-bold">{customer.firma}</span>
        {(customer.yetkili || customer.telefon) && <span className="text-xs text-muted-foreground">{[customer.yetkili, customer.telefon].filter(Boolean).join(" · ")}</span>}
        {customer.grup ? <Badge tone="success">{groupText(customer.grup)}</Badge> : customer.id ? <Badge tone="neutral">İskonto grubu yok</Badge> : <Badge tone="neutral">Yeni müşteri</Badge>}
        <button type="button" onClick={() => onChange(null)} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-danger">
          <X className="size-3.5" /> Kaldır
        </button>
      </div>
    );

  return (
    <div className="relative">
      <label className="flex h-12 items-center gap-2.5 rounded-2xl border border-border bg-card px-4 text-sm focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
        <Search className="size-4 text-muted-foreground" />
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            search(e.target.value);
          }}
          onBlur={() => setTimeout(() => setHits([]), 150)}
          placeholder="Müşteri seçin — iskonto grubu varsa fiyatlara uygulanır (isteğe bağlı)"
          className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </label>
      {hits.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-pop">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(hitToCustomer(h));
                  setText("");
                  setHits([]);
                }}
                className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted/70"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{h.firma}</span>
                  <span className="block text-[11px] text-muted-foreground">{[h.yetkili, h.telefon].filter(Boolean).join(" · ") || "—"}</span>
                </span>
                {h.grup && <Badge tone="success">{groupText(h.grup)}</Badge>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
