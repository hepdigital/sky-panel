"use client";

import { useState } from "react";
import Image from "next/image";
import { AlertTriangle, Copy, FileDown, Pencil, Percent, Plus, ReceiptText, Tag, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QtyStepper } from "@/components/ui/qty-stepper";
import { SZ, TL, cartUnpriced, hesap, iskEtiket, iskYok, imgSrc, modeName, oranEtiket, satirNet, splitKey, wallDetail, type BrandCard, type Catalog, type ExtraLine, type Isk, type QuoteState } from "@/lib/terminal/calc";
import { quoteCargo, type QuoteCargoData } from "@/lib/terminal/cargo";
import type { costOf } from "@/lib/terminal/cost";
import { recolored } from "@/lib/terminal/recolor";
import { newId } from "@/lib/terminal/state";
import { cn } from "@/lib/utils";
import { CopyQuoteButton } from "./copy-quote";
import { DiscountSheet } from "./discount-sheet";
import { ExtraSheet } from "./extra-sheet";

type Props = {
  q: QuoteState;
  setQ: (q: QuoteState) => void;
  catalog: Catalog;
  /** Teklifi veren marka (döküm metninin başlığı) */
  brand: BrandCard;
  /** Yalnızca yöneticide: maliyet ve kâr (satışçıya hiç gönderilmez) */
  cost: ReturnType<typeof costOf> | null;
  /** Tahmini kargo (anlaşmalı tarife ve koli ölçüleri) */
  kargo: QuoteCargoData | null;
  money: (n: number) => string;
  editingId: string | null;
  onEdit: (id: string) => void;
  onCopy: (id: string) => void;
  onSave: () => void;
  onClear: () => void;
};

/** Teklif özeti: sepetteki gazeboler, ürünler ve ek kalemler; satır ve genel iskonto, toplamlar */
export function Summary({ q, setQ, catalog, brand, cost, kargo, money, editingId, onEdit, onCopy, onSave, onClear }: Props) {
  const H = hesap(q, catalog);
  const unpriced = cartUnpriced(q);
  const all = catalog.flatMap((g) => g.items);
  const items = Object.keys(q.prod).filter((k) => (q.prod[k] || 0) > 0);
  const extra = q.extra ?? [];
  // Renkli ürün satırında görsel o rengin boyanmış hâlidir (kartta renk seçilince hazırlanır)
  const rowImage = (key: string) => {
    const { id, hex } = splitKey(key);
    const src = imgSrc(all.find((i) => i.id === id)?.img ?? "r:3x3");
    return (hex && recolored(src, hex)) || src;
  };
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
                      <Image src={gz?.views?.[0] ?? rowImage(r.key)} alt="" fill sizes="44px" className="object-contain p-0.5" unoptimized />
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
                    title={gz ? `Gazebo ${SZ[gz.size]} m` : r.t.replace(/ × \d+$/, "")}
                    vat={q.vat}
                    liste={r.birim}
                    adet={r.adet}
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
          <dt className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="whitespace-nowrap">Genel iskonto</span>
            <DiscountButton title="Genel iskonto" vat={q.vat} liste={H.araNet} adet={1} genel value={q.isk} onChange={(isk) => setQ({ ...q, isk, iskGrup: undefined })} compact />
            {q.iskGrup && !iskYok(q.isk) && <span className="text-[11px] font-semibold text-success">{q.iskGrup}</span>}
          </dt>
          <dd className={cn("tabular shrink-0 whitespace-nowrap font-medium", H.genelIsk > 0 && "text-success")}>{H.genelIsk ? `${H.genelIsk > 0 ? "−" : "+"}${money(Math.abs(H.genelIsk))}` : "—"}</dd>
        </div>
        {/* Ara toplam, KDV ve genel toplam KDV tercihinden bağımsızdır: money KDV dahil modda 1,2 ile çarpar, burada çift KDV olurdu */}
        <Row label="Ara toplam (KDV hariç)" value={TL(H.net)} />
        <Row label="KDV (%20)" value={TL(H.net * 0.2)} muted />
      </dl>
      <div className="mt-3 flex items-end justify-between border-t border-border pt-3">
        <span className="text-sm font-semibold">Genel toplam</span>
        <span className="tabular text-2xl font-bold tracking-tight">{TL(H.net * 1.2)}</span>
      </div>
      <p className="mt-1 text-right text-[11px] text-muted-foreground">{modeName(q.mode)} fiyat listesi · KDV dahil</p>

      {kargo && <CargoEstimate q={q} setQ={setQ} kargo={kargo} />}

      {cost && cost.maliyet !== null && (
        <div className="mt-3 rounded-xl border border-dashed border-border px-3 py-2.5 text-xs">
          <p className="font-semibold text-muted-foreground">Yalnızca yönetici görür · KDV hariç</p>
          <div className="mt-1 flex flex-wrap justify-between gap-x-4 gap-y-1">
            <span>
              Maliyet <b className="tabular">{TL(cost.maliyet)}</b>
            </span>
            <span className={cn(cost.kar !== null && cost.kar < 0 ? "text-danger" : "text-success")}>
              Kâr <b className="tabular">{TL(cost.kar ?? 0)}</b>
              {cost.net > 0 && cost.kar !== null ? ` · %${Math.round((cost.kar / cost.net) * 100)}` : ""}
            </span>
          </div>
          {cost.eksik && <p className="mt-1 text-muted-foreground">Bazı kalemlerin maliyeti girilmemiş; kâr bu kalemler hariç hesaplandı.</p>}
          {cost.alti.length > 0 && (
            <p className="mt-1.5 flex items-start gap-1.5 font-medium text-danger">
              <AlertTriangle className="mt-px size-3.5 shrink-0" /> Maliyetin altında: {cost.alti.join(", ")}. Satışçı bu teklifi kaydedemez; siz kaydedebilirsiniz.
            </p>
          )}
        </div>
      )}

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
      <div className="mt-2 hidden lg:block">
        <CopyQuoteButton q={q} catalog={catalog} brand={brand} disabled={!H.rows.length} />
      </div>
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

/** İskonto düğmesi: yüzde, TL ya da doğrudan fiyat penceresini açar; eksi değer ilave (zam) demektir */
function DiscountButton({ value, onChange, compact, ...sheet }: { value?: Isk; onChange: (i: Isk) => void; compact?: boolean; title: string; vat: 0 | 1; liste: number; adet: number; genel?: boolean }) {
  const [open, setOpen] = useState(false);
  // TL ya da fiyatla verilen satır iskontosunun liste fiyatına göre oranı (PDF'te müşteri bunu görür)
  const o = !sheet.genel && !iskYok(value) && value!.tip !== "yuzde" ? oranEtiket(sheet.liste * sheet.adet, satirNet(sheet.liste, sheet.adet, value).v) : "";
  const oran = o ? ` · ${o.replace(/ (ind\.|ilave)$/, "")}` : "";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-[11px] font-semibold",
          iskYok(value) ? "border-border text-muted-foreground hover:text-foreground" : "border-success/30 bg-success-soft text-success",
          compact && "h-7",
        )}
      >
        {!iskYok(value) && value!.tip === "fiyat" ? <Tag className="size-3" /> : <Percent className="size-3" />} {iskYok(value) ? "İskonto / fiyat" : iskEtiket(value, sheet.vat, sheet.genel) + oran}
      </button>
      {open && <DiscountSheet open onClose={() => setOpen(false)} value={value} onChange={onChange} {...sheet} />}
    </>
  );
}

/**
 * Tahmini Yurtiçi kargo: parça ve ürün kolilerinden. "Nakliye bedeli olarak ekle" ek kalemi yazar (varsa günceller);
 * teklif fiyatına kendiliğinden eklenmez.
 */
function CargoEstimate({ q, setQ, kargo }: { q: QuoteState; setQ: (q: QuoteState) => void; kargo: QuoteCargoData }) {
  const c = quoteCargo(q, kargo);
  if (!c.parca) return null;
  const mevcut = (q.extra ?? []).find((x) => x.ad === "Nakliye bedeli");
  const aciklama = `Yurtiçi Kargo · ${c.koli} koli`;
  const ekle = () => {
    const line: ExtraLine = { id: mevcut?.id ?? newId(), ad: "Nakliye bedeli", aciklama, adet: 1, birim: c.haric, isk: mevcut?.isk ?? { tip: "yuzde", d: 0 } };
    setQ({ ...q, extra: mevcut ? (q.extra ?? []).map((x) => (x.id === mevcut.id ? line : x)) : [...(q.extra ?? []), line] });
  };
  return (
    <div className="mt-3 rounded-xl bg-muted/60 px-3 py-2.5 text-xs">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 font-semibold text-muted-foreground">
          <Truck className="size-3.5" /> Tahmini kargo · Yurtiçi
        </p>
        {c.koli > 0 && (
          <span className="text-right">
            <b className="tabular">{TL(c.haric)}</b> <span className="text-muted-foreground">+ KDV</span>
          </span>
        )}
      </div>
      <p className="mt-0.5 text-muted-foreground">
        {c.koli > 0 ? `${c.koli} koli · ${c.desi.toLocaleString("tr-TR")} desi` : "Hiçbir parçanın koli ölçüsü girilmemiş"}
        {c.eksik > 0 && c.koli > 0 && ` · ${c.eksik} parçanın ölçüsü eksik, toplama girmedi`}
      </p>
      {c.koli > 0 && (
        <button type="button" onClick={ekle} disabled={!!mevcut && mevcut.birim === c.haric && mevcut.aciklama === aciklama} className="mt-1.5 font-semibold text-primary hover:underline disabled:text-muted-foreground disabled:no-underline">
          {mevcut ? (mevcut.birim === c.haric && mevcut.aciklama === aciklama ? "Nakliye bedeli teklifte" : "Nakliye bedelini güncelle") : "Nakliye bedeli olarak ekle"}
        </button>
      )}
    </div>
  );
}
