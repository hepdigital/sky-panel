"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { TL, haricOf, satirNet, type Isk } from "@/lib/terminal/calc";
import { cn } from "@/lib/utils";

const input = "tabular h-11 w-full rounded-xl border border-input bg-card px-4 text-right text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";
const label = "mb-1.5 block text-xs font-semibold text-muted-foreground";
/** "1.250,50" / "1250.5" / "1.250" → sayı; boşsa NaN */
function parse(v: string) {
  let s = v.trim().replace(/\s|tl|%/gi, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  return s ? Number(s) : NaN;
}
const show = (n: number) => (Number.isFinite(n) ? n.toLocaleString("tr-TR", { maximumFractionDigits: 2 }) : "");

type Tab = "yuzde" | "tl" | "fiyat";
const tabOf = (i: Isk): Tab => (i.tip === "yuzde" ? "yuzde" : i.tip === "fiyat" ? "fiyat" : "tl");

/**
 * Satır ya da genel iskonto: yüzde, TL (satırda adet başına ya da satır toplamından) veya doğrudan fiyat
 * (satırda birim fiyat — toplam da yazılabilir, adetten hesaplanır; genelde hedef ara toplam).
 * Tutarlar KDV hariç ya da dahil yazılır, KDV hariç saklanır.
 */
export function DiscountSheet({
  open,
  onClose,
  title,
  value,
  onChange,
  vat,
  liste,
  adet,
  genel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  value?: Isk;
  onChange: (i: Isk) => void;
  vat: 0 | 1;
  /** Satırda liste birim fiyatı, genelde satır iskontoları sonrası ara toplam (KDV hariç) */
  liste: number;
  /** Satır adedi (genelde 1) */
  adet: number;
  genel?: boolean;
}) {
  const v = value ?? { tip: "yuzde" as const, d: 0 };
  const [tab, setTab] = useState<Tab>(tabOf(v));
  const [satir, setSatir] = useState(v.tip === "satir");
  // Genel iskontoda tutarlar ekrandaki genel toplam gibi KDV dahil düşünülür
  const [kdv, setKdv] = useState<boolean>(genel ? true : !!vat);
  const goster = (n: number) => show(kdv ? n * 1.2 : n);
  const [yuzde, setYuzde] = useState(v.tip === "yuzde" && v.d ? show(v.d) : "");
  const [tl, setTl] = useState(v.tip === "tutar" || v.tip === "satir" ? goster(v.d) : "");
  const [birim, setBirim] = useState(v.tip === "fiyat" ? goster(v.d) : "");
  const [toplam, setToplam] = useState(v.tip === "fiyat" && !genel ? goster(v.d * adet) : "");

  const ham = (n: number) => haricOf(n, kdv ? 1 : 0);
  // Taslak iskonto (KDV hariç)
  const n = parse(tab === "yuzde" ? yuzde : tab === "tl" ? tl : birim);
  const isk: Isk | null = !Number.isFinite(n)
    ? null
    : tab === "yuzde"
      ? { tip: "yuzde", d: Math.max(-100, Math.min(100, n)) }
      : tab === "tl"
        ? { tip: genel ? "tutar" : satir ? "satir" : "tutar", d: ham(n) }
        : n < 0
          ? null
          : { tip: "fiyat", d: ham(n) };
  const listeTop = liste * adet;
  const sonuc = isk ? (genel ? { net: 0, v: isk.tip === "yuzde" ? listeTop * (1 - isk.d / 100) : isk.tip === "fiyat" ? isk.d : listeTop - isk.d } : satirNet(liste, adet, isk)) : null;
  const para = (x: number) => TL(kdv ? x * 1.2 : x);
  const fark = sonuc ? listeTop - sonuc.v : 0;

  // Kutucuklar ekrandaki değerleri KDV tercihine göre gösterir; tercih değişince yazılanlar çevrilir
  const setKdvTercih = (yeni: boolean) => {
    if (yeni === kdv) return;
    const cevir = (s: string) => {
      const x = parse(s);
      return Number.isFinite(x) ? show(yeni ? x * 1.2 : x / 1.2) : s;
    };
    setTl(cevir(tl));
    setBirim(cevir(birim));
    setToplam(cevir(toplam));
    setKdv(yeni);
  };

  const uygula = () => {
    onChange(isk ?? { tip: "yuzde", d: 0 });
    onClose();
  };
  const kaldir = () => {
    onChange({ tip: "yuzde", d: 0 });
    onClose();
  };

  const tabs: [Tab, string][] = [
    ["yuzde", "Yüzde (%)"],
    ["tl", "TL indirim"],
    ["fiyat", genel ? "Hedef toplam" : "Birim fiyat"],
  ];

  return (
    <Sheet open={open} onClose={onClose} title={title} className="md:max-w-md">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
          {tabs.map(([t, l]) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={cn("h-9 rounded-full text-xs font-semibold", tab === t ? "bg-card shadow-card" : "text-muted-foreground")}>
              {l}
            </button>
          ))}
        </div>

        {tab === "yuzde" && (
          <label className="block">
            <span className={label}>İskonto oranı (%)</span>
            <input autoFocus value={yuzde} onChange={(e) => setYuzde(e.target.value)} inputMode="decimal" placeholder="ör. 10" className={input} />
          </label>
        )}

        {tab === "tl" && (
          <>
            {!genel && adet > 1 && (
              <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
                {[
                  [false, "Adet başına"],
                  [true, `Satır toplamından (${adet} adet)`],
                ].map(([s, l]) => (
                  <button key={String(s)} type="button" onClick={() => setSatir(s as boolean)} className={cn("h-8 rounded-full text-[11px] font-semibold", satir === s ? "bg-card shadow-card" : "text-muted-foreground")}>
                    {l}
                  </button>
                ))}
              </div>
            )}
            <label className="block">
              <span className={label}>{genel ? "Toplamdan indirim (TL)" : satir || adet === 1 ? "Satırdan indirim (TL)" : "Her adetten indirim (TL)"}</span>
              <input autoFocus value={tl} onChange={(e) => setTl(e.target.value)} inputMode="decimal" placeholder="ör. 5.000" className={input} />
            </label>
          </>
        )}

        {tab === "fiyat" &&
          (genel ? (
            <label className="block">
              <span className={label}>Teklifin toplamı bu olsun (TL)</span>
              <input autoFocus value={birim} onChange={(e) => setBirim(e.target.value)} inputMode="decimal" placeholder="ör. 940.000" className={input} />
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={label}>Birim fiyat (TL)</span>
                <input
                  autoFocus
                  value={birim}
                  onChange={(e) => {
                    setBirim(e.target.value);
                    const x = parse(e.target.value);
                    setToplam(Number.isFinite(x) ? show(x * adet) : "");
                  }}
                  inputMode="decimal"
                  placeholder="ör. 10.000"
                  className={input}
                />
              </label>
              <label className="block">
                <span className={label}>Satır toplamı ({adet} adet)</span>
                <input
                  value={toplam}
                  onChange={(e) => {
                    setToplam(e.target.value);
                    const x = parse(e.target.value);
                    setBirim(Number.isFinite(x) && adet ? show(x / adet) : "");
                  }}
                  inputMode="decimal"
                  placeholder="ör. 450.000"
                  className={input}
                />
              </label>
            </div>
          ))}

        {tab !== "yuzde" && (
          <div className="inline-flex rounded-full bg-muted p-1">
            {[
              [false, "KDV hariç"],
              [true, "KDV dahil"],
            ].map(([k, l]) => (
              <button key={String(l)} type="button" onClick={() => setKdvTercih(k as boolean)} className={cn("h-8 rounded-full px-3.5 text-xs font-semibold", kdv === k ? "bg-card shadow-card" : "text-muted-foreground")}>
                {l}
              </button>
            ))}
          </div>
        )}

        <dl className="space-y-1 rounded-xl bg-muted/60 px-4 py-3 text-xs">
          <Line l={genel ? "Ara toplam" : adet > 1 ? `Liste · ${adet} × ${para(liste)}` : "Liste fiyatı"} r={para(listeTop)} />
          {sonuc && !genel && adet > 1 && <Line l="Net birim" r={para(sonuc.net)} />}
          {sonuc && fark !== 0 && (
            <Line
              l={fark > 0 ? "İndirim" : "İlave"}
              r={`${fark > 0 ? "−" : "+"}${para(Math.abs(fark))}${listeTop > 0 ? ` · %${(Math.round((Math.abs(fark) / listeTop) * 1000) / 10).toLocaleString("tr-TR")}` : ""}`}
              className={fark > 0 ? "text-success" : "text-warning"}
            />
          )}
          <Line l={genel ? "Yeni ara toplam" : "Satır toplamı"} r={sonuc ? para(sonuc.v) : "—"} bold />
          <p className="pt-0.5 text-[11px] text-muted-foreground">{kdv ? "Tutarlar KDV dahil." : "Tutarlar KDV hariç."} Eksi değer ilave (zam) olarak uygulanır.</p>
        </dl>

        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={kaldir}>
            Kaldır
          </Button>
          <Button className="flex-1" disabled={!isk && !!(tab === "yuzde" ? yuzde : tab === "tl" ? tl : birim).trim()} onClick={uygula}>
            Uygula
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function Line({ l, r, bold, className }: { l: string; r: string; bold?: boolean; className?: string }) {
  return (
    <div className={cn("flex justify-between gap-3", bold && "border-t border-border pt-1 text-sm font-semibold", className)}>
      <dt className="min-w-0 truncate">{l}</dt>
      <dd className="tabular shrink-0">{r}</dd>
    </div>
  );
}
