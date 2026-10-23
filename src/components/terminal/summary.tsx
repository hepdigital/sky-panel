"use client";

import { useState } from "react";
import Image from "next/image";
import { AlertTriangle, Copy, FileDown, Pencil, Percent, Plus, ReceiptText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QtyStepper } from "@/components/ui/qty-stepper";
import { SZ, cartUnpriced, hesap, iskEtiket, iskYok, imgSrc, modeName, wallDetail, type Catalog, type ExtraLine, type Isk, type QuoteState } from "@/lib/terminal/calc";
import { cn } from "@/lib/utils";
import { ExtraSheet } from "./extra-sheet";

type Props = {
  q: QuoteState;
  setQ: (q: QuoteState) => void;
  catalog: Catalog;
  money: (n: number) => string;
  editingId: string | null;
  onEdit: (id: string) => void;
  onCopy: (id: string) => void;
  onSave: () => void;
  onClear: () => void;
};

/** Teklif özeti: sepetteki gazeboler, ürünler ve ek kalemler; satır ve genel iskonto, toplamlar */
export function Summary({ q, setQ, catalog, money, editingId, onEdit, onCopy, onSave, onClear }: Props) {
  const H = hesap(q, catalog);
  const unpriced = cartUnpriced(q);
  const all = catalog.flatMap((g) => g.items);
  const items = all.filter((it) => (q.prod[it.id] || 0) > 0);
  const extra = q.extra ?? [];
  const empty = !q.cart.length && !items.length && !extra.length;
  /** Açık ek kalem penceresi: null kapalı, "yeni" ya da düzenlenen kalem */
  const [extraOpen, setExtraOpen] = useState<ExtraLine | "yeni" | null>(null);

  const setCart = (id: string, patch: Partial<QuoteState["cart"][number]>) => setQ({ ...q, cart: q.cart.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const removeCart = (id: string) => setQ({ ...q, cart: q.cart.filter((c) => c.id !== id) });
  const setProd = (id: string, n: number) => {
    const prod = { ...q.prod };
    if (n > 0) prod[id] = Math.min(999, n);
    else delete prod[id];
    setQ({ ...q, prod });
  };
  const setExtra = (id: string, patch: Partial<ExtraLine>) => setQ({ ...q, extra: extra.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const removeExtra = (id: string) => setQ({ ...q, extra: extra.filter((x) => x.id !== id) });
  const saveExtra = (x: ExtraLine) => setQ({ ...q, extra: extra.some((e) => e.id === x.id) ? extra.map((e) => (e.id === x.id ? x : e)) : [...extra, x] });

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Teklif özeti</h2>
        {!empty && (
          <button type="button" onClick={onClear} className="text-xs font-semibold text-muted-foreground hover:text-danger">
            Sıfırla
          </button>
        )}
      </div>

      {empty ? (
        <p className="mt-4 rounded-xl bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">Gazebo kurup teklife ekleyin ya da ürün seçin.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {H.rows.map((r) => {
            const gz = q.cart.find((c) => c.id === r.key);
            const ex = gz ? undefined : extra.find((x) => x.id === r.key);
            return (
              <li key={r.key} className={cn("py-3", gz && editingId === gz.id && "rounded-xl bg-primary-soft/50 px-2")}>
                <div className="flex gap-3">
                  {ex ? (
                    <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
                      <ReceiptText className="size-5" />
                    </span>
                  ) : (
                    <span className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-border">
                      <Image src={gz?.views?.[0] ?? imgSrc(gz ? `r:${gz.size}` : (all.find((i) => i.id === r.key)?.img ?? `r:3x3`))} alt="" fill sizes="44px" className="object-contain p-0.5" unoptimized />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-tight">{gz ? `Gazebo ${SZ[gz.size]} m` : r.t.replace(/ × \d+$/, "")}</p>
                    <p className="line-clamp-2 text-[11px] text-muted-foreground">{gz ? `${r.s} · ${wallDetail(gz)}` : r.s}</p>
                    {r.bad && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-warning">
                        <AlertTriangle className="size-3" /> Fiyatı olmayan duvar var (fiyat alınız)
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-sm font-bold">{money(r.v)}</p>
                    {r.v !== r.liste && <p className="tabular text-[11px] text-muted-foreground line-through">{money(r.liste)}</p>}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-14">
                  <QtyStepper
                    size="sm"
                    className="w-24"
                    value={r.adet}
                    onChange={(n) =>
                      gz ? (n <= 0 ? removeCart(gz.id) : setCart(gz.id, { qty: Math.min(99, n) })) : ex ? (n <= 0 ? removeExtra(ex.id) : setExtra(ex.id, { adet: Math.min(999, n) })) : setProd(r.key, n)
                    }
                  />
                  <DiscountButton
                    value={r.isk}
                    onChange={(isk) => (gz ? setCart(gz.id, { isk }) : ex ? setExtra(ex.id, { isk }) : setQ({ ...q, prodIsk: { ...q.prodIsk, [r.key]: isk } }))}
                  />
                  {ex && (
                    <IconBtn label="Düzenle" onClick={() => setExtraOpen(ex)}>
                      <Pencil />
                    </IconBtn>
                  )}
                  {gz && (
                    <>
                      <IconBtn label="Düzenle" onClick={() => onEdit(gz.id)}>
                        <Pencil />
                      </IconBtn>
                      <IconBtn label="Kopyala" onClick={() => onCopy(gz.id)}>
                        <Copy />
                      </IconBtn>
                    </>
                  )}
                  <IconBtn label="Kaldır" onClick={() => (gz ? removeCart(gz.id) : ex ? removeExtra(ex.id) : setProd(r.key, 0))}>
                    <Trash2 />
                  </IconBtn>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setExtraOpen("yeni")}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-input py-2.5 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-foreground"
      >
        <Plus className="size-3.5" /> Ek kalem · nakliye, montaj, baskı ücreti…
      </button>
      <ExtraSheet
        key={extraOpen === "yeni" ? "yeni" : (extraOpen?.id ?? "kapali")}
        open={!!extraOpen}
        onClose={() => setExtraOpen(null)}
        line={extraOpen === "yeni" ? null : extraOpen}
        vat={q.vat}
        onSave={saveExtra}
      />

      <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
        <Row label="Liste toplamı" value={money(H.araListe)} muted />
        {H.satirIsk !== 0 && <Row label={H.satirIsk > 0 ? "Satır iskontoları" : "Satır ilaveleri"} value={`${H.satirIsk > 0 ? "−" : "+"}${money(Math.abs(H.satirIsk))}`} success={H.satirIsk > 0} />}
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2">
            Genel iskonto <DiscountButton value={q.isk} onChange={(isk) => setQ({ ...q, isk, iskGrup: undefined })} compact />
            {q.iskGrup && !iskYok(q.isk) && <span className="text-[11px] font-semibold text-success">{q.iskGrup}</span>}
          </dt>
          <dd className={cn("tabular font-medium", H.genelIsk > 0 && "text-success")}>{H.genelIsk ? `${H.genelIsk > 0 ? "−" : "+"}${money(Math.abs(H.genelIsk))}` : "—"}</dd>
        </div>
        <Row label="Ara toplam (KDV hariç)" value={money(H.net)} />
        <Row label="KDV (%20)" value={money(H.net * 0.2)} muted />
      </dl>
      <div className="mt-3 flex items-end justify-between border-t border-border pt-3">
        <span className="text-sm font-semibold">Genel toplam</span>
        <span className="tabular text-2xl font-bold tracking-tight">{money(H.net * 1.2)}</span>
      </div>
      <p className="mt-1 text-right text-[11px] text-muted-foreground">{modeName(q.mode)} fiyat listesi · KDV dahil</p>

      {!q.mode && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-xs font-medium text-warning">
          <AlertTriangle className="mt-px size-3.5 shrink-0" /> Toptan (bayi) fiyatları açık. Müşteriye gidecekse Perakende&apos;ye geçin.
        </p>
      )}
      {unpriced > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-xs font-medium text-warning">
          <AlertTriangle className="mt-px size-3.5 shrink-0" /> {unpriced} duvarın fiyatı listede yok; PDF&apos;te “fiyat alınız” yazar ve toplama girmez.
        </p>
      )}

      <Button size="lg" className="mt-4 hidden w-full lg:inline-flex" disabled={!H.rows.length} onClick={onSave}>
        <FileDown /> Kaydet ve PDF oluştur
      </Button>
    </Card>
  );
}

function Row({ label, value, muted, success }: { label: string; value: string; muted?: boolean; success?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3", muted && "text-muted-foreground", success && "text-success")}>
      <dt className="min-w-0 truncate">{label}</dt>
      <dd className="tabular shrink-0 font-medium">{value}</dd>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-3.5">
      {children}
    </button>
  );
}

/** İskonto: yüzde ya da adet başına TL; eksi değer ilave (zam) demektir */
function DiscountButton({ value, onChange, compact }: { value?: Isk; onChange: (i: Isk) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const isk = value ?? { tip: "yuzde" as const, d: 0 };
  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold",
          iskYok(value) ? "border-border text-muted-foreground hover:text-foreground" : "border-success/30 bg-success-soft text-success",
          compact && "h-7",
        )}
      >
        <Percent className="size-3" /> {iskYok(value) ? "İskonto" : iskEtiket(value)}
      </button>
      {open && (
        <span className="absolute right-0 top-full z-20 mt-1.5 flex w-60 flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-pop">
          <span className="inline-flex rounded-full bg-muted p-1">
            {(["yuzde", "tutar"] as const).map((t) => (
              <button key={t} type="button" onClick={() => onChange({ ...isk, tip: t })} className={cn("h-7 flex-1 rounded-full text-xs font-semibold", isk.tip === t ? "bg-card shadow-card" : "text-muted-foreground")}>
                {t === "yuzde" ? "Yüzde (%)" : "Tutar (TL)"}
              </button>
            ))}
          </span>
          <input
            autoFocus
            inputMode="decimal"
            defaultValue={isk.d || ""}
            placeholder={isk.tip === "yuzde" ? "örn. 10" : "örn. 500"}
            onChange={(e) => {
              const n = Number(e.target.value.replace(",", "."));
              if (Number.isFinite(n)) onChange({ tip: isk.tip, d: isk.tip === "yuzde" ? Math.max(-100, Math.min(100, n)) : n });
            }}
            className="tabular h-9 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-primary"
          />
          <span className="text-[11px] text-muted-foreground">Eksi değer ilave (zam) olarak uygulanır.</span>
          <span className="flex gap-2">
            <Button size="sm" variant="ghost" className="flex-1" onClick={() => { onChange({ tip: "yuzde", d: 0 }); setOpen(false); }}>
              Kaldır
            </Button>
            <Button size="sm" className="flex-1" onClick={() => setOpen(false)}>
              Tamam
            </Button>
          </span>
        </span>
      )}
    </span>
  );
}
