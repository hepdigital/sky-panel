"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { QtyStepper } from "@/components/ui/qty-stepper";
import { Sheet } from "@/components/ui/sheet";
import { EXTRA_PRESETS, TL, newIsk, type ExtraLine } from "@/lib/terminal/calc";
import { cn } from "@/lib/utils";

const input = "h-11 w-full rounded-xl border border-input bg-card px-4 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";
const label = "mb-1.5 block text-xs font-semibold text-muted-foreground";
/** "1.250" / "1250,50" → 1250.5 */
const parse = (v: string) => Number(v.trim().replace(/\./g, "").replace(",", "."));

let seq = 0;
const newId = () => `x${Date.now().toString(36)}${seq++}`;

/**
 * Ek kalem ekleme/düzenleme: nakliye, montaj, baskı ücreti gibi katalog dışı satırlar.
 * Fiyat KDV hariç ya da dahil girilebilir; KDV hariç saklanır.
 */
export function ExtraSheet({ open, onClose, line, vat, onSave }: { open: boolean; onClose: () => void; line: ExtraLine | null; vat: 0 | 1; onSave: (x: ExtraLine) => void }) {
  const [ad, setAd] = useState(line?.ad ?? "");
  const [aciklama, setAciklama] = useState(line?.aciklama ?? "");
  const [adet, setAdet] = useState(line?.adet ?? 1);
  const [kdvDahil, setKdvDahil] = useState<boolean>(!!vat);
  const [fiyat, setFiyat] = useState(line ? String(Math.round((vat ? line.birim * 1.2 : line.birim) * 100) / 100).replace(".", ",") : "");
  const [err, setErr] = useState<string | null>(null);

  const n = parse(fiyat);
  const net = Number.isFinite(n) ? Math.round((kdvDahil ? n / 1.2 : n) * 100) / 100 : NaN;

  function save() {
    if (!ad.trim()) return setErr("Kalem adını yazın.");
    if (!fiyat.trim() || !Number.isFinite(net) || net < 0) return setErr("Birim fiyatı rakamla yazın (ör. 1.500).");
    onSave({ id: line?.id ?? newId(), ad: ad.trim().slice(0, 160), aciklama: aciklama.trim().slice(0, 300), adet: Math.max(1, Math.min(999, adet)), birim: net, isk: line?.isk ?? newIsk() });
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={line ? "Ek kalemi düzenle" : "Ek kalem"} className="md:max-w-lg">
      <div className="space-y-3">
        <div>
          <span className={label}>Kalem</span>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {EXTRA_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setAd(p)}
                className={cn("h-8 rounded-full border px-3 text-xs font-semibold", ad === p ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground")}
              >
                {p}
              </button>
            ))}
          </div>
          <input value={ad} onChange={(e) => setAd(e.target.value)} maxLength={160} className={input} placeholder="ya da kendiniz yazın: ör. Ekspres üretim farkı" />
        </div>
        <label className="block">
          <span className={label}>Açıklama (isteğe bağlı · PDF&apos;te adın altında yazar)</span>
          <input value={aciklama} onChange={(e) => setAciklama(e.target.value)} maxLength={300} className={input} placeholder="ör. İstanbul Anadolu yakası, kapıya teslim" />
        </label>
        <div className="grid grid-cols-[auto_1fr] items-end gap-3">
          <div>
            <span className={label}>Adet</span>
            <QtyStepper className="h-11 w-32" value={adet} onChange={(v) => setAdet(Math.max(1, v))} />
          </div>
          <label className="block">
            <span className={label}>Birim fiyat</span>
            <input value={fiyat} onChange={(e) => setFiyat(e.target.value)} inputMode="decimal" className={`${input} tabular text-right`} placeholder="ör. 1.500" />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-full bg-muted p-1">
            {[
              [false, "KDV hariç"],
              [true, "KDV dahil"],
            ].map(([v, l]) => (
              <button key={String(l)} type="button" onClick={() => setKdvDahil(v as boolean)} className={cn("h-8 rounded-full px-3.5 text-xs font-semibold", kdvDahil === v ? "bg-card shadow-card" : "text-muted-foreground")}>
                {l}
              </button>
            ))}
          </div>
          {Number.isFinite(net) && fiyat.trim() && (
            <p className="tabular text-xs text-muted-foreground">
              KDV hariç {TL(net)} · dahil {TL(net * 1.2)}
              {adet > 1 ? ` · toplam ${TL(net * adet)} + KDV` : ""}
            </p>
          )}
        </div>
        {err && <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{err}</p>}
        <Button size="lg" className="w-full" onClick={save}>
          {line ? "Kaydet" : "Teklife ekle"}
        </Button>
      </div>
    </Sheet>
  );
}
