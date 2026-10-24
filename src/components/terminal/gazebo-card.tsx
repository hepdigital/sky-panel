"use client";

import Image from "next/image";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QtyStepper } from "@/components/ui/qty-stepper";
import {
  COLORS,
  FABRICS,
  FRAMES,
  FRAME_IDS,
  ROOF,
  SIZES,
  SZ,
  colorText,
  gzRows,
  gzTotal,
  imgSrc,
  plan,
  val,
  type Gazebo,
  type Mode,
} from "@/lib/terminal/calc";
import { cn } from "@/lib/utils";
import { WallEditor } from "@/modules/gazebo/wall-editor";
import { useOutOfStock } from "./color-stock";
import { Gazebo3D, type CaptureViews } from "./gazebo-3d";

export type GazeboCardProps = {
  draft: Gazebo;
  setDraft: (g: Gazebo) => void;
  qty: number;
  setQty: (n: number) => void;
  mode: Mode;
  /** Tutar gösterimi (KDV moduna göre) */
  money: (n: number) => string;
  editing: boolean;
  /** Aynı kurulum sepette varsa eklenince adedi artar */
  twin: boolean;
  onAdd: () => void;
  onCancelEdit: () => void;
  /** 3D görüntüleyici hazır olunca iki açıdan görüntü alma fonksiyonu (teklife eklerken PDF görseli için) */
  onCaptureReady: (fn: CaptureViews | null) => void;
};

export function GazeboCard({ draft, setDraft, qty, setQty, mode, money, editing, twin, onAdd, onCancelEdit, onCaptureReady }: GazeboCardProps) {
  const p = plan(draft.size);
  const rows = gzRows(draft, mode);
  const total = gzTotal(draft, mode);
  const frames = FRAME_IDS.filter((id) => FRAMES[id].p[draft.size]);

  const set = (patch: Partial<Gazebo>) => setDraft({ ...draft, ...patch });
  const setSize = (size: string) => {
    // Ölçü değişince seçili seri o ölçüde yoksa ilk uygun seriye geçilir
    const frame = draft.frame && FRAMES[draft.frame].p[size] ? draft.frame : (FRAME_IDS.find((id) => FRAMES[id].p[size]) ?? null);
    setDraft({ ...draft, size, frame });
  };

  return (
    <Card className="p-4 md:p-5">
      <Gazebo3D draft={draft} onCaptureReady={onCaptureReady} />
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-[17px] font-bold tracking-tight">{editing ? "Gazeboyu düzenle" : "Gazebo çadır"}</h2>
            <p className="text-xs text-muted-foreground">
              {SZ[draft.size]} m · {p[0].h} cm duvar yüksekliği · iskelet, tavan ve duvarlar ayrı fiyatlanır
            </p>
          </div>
        </div>
        {editing && (
          <Button variant="ghost" size="sm" onClick={onCancelEdit}>
            <X /> Düzenlemeyi bırak
          </Button>
        )}
      </div>

      {/* 1 — Ölçü */}
      <Section n={1} title="Çadır ölçüsü">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              aria-pressed={draft.size === s}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border p-1.5 text-xs font-semibold transition-colors",
                draft.size === s ? "border-primary bg-primary-soft/60 text-primary" : "border-border hover:bg-muted/60",
              )}
            >
              <span className="relative aspect-square w-full">
                <Image src={imgSrc(`r:${s}`)} alt="" fill sizes="80px" className="object-contain" />
              </span>
              <span className="tabular">{SZ[s]}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* 2 — İskelet */}
      <Section n={2} title="İskelet serisi" hint={`${SZ[draft.size]} m için ${frames.length} seri`}>
        <div className="grid gap-2 sm:grid-cols-3">
          {frames.map((id) => (
            <Option
              key={id}
              active={draft.frame === id}
              onClick={() => set({ frame: draft.frame === id ? null : id })}
              img={imgSrc(`f:${id}`)}
              title={id}
              hint={FRAMES[id].desc}
              price={priceText(val(FRAMES[id].p[draft.size], mode), money)}
            />
          ))}
        </div>
      </Section>

      {/* 3 — Tavan */}
      <Section n={3} title="Tavan kumaşı">
        <div className="grid gap-2 sm:grid-cols-3">
          {FABRICS.map((f, i) => (
            <Option
              key={f.n}
              active={draft.roofFab === i}
              onClick={() => set({ roofFab: draft.roofFab === i ? null : i })}
              title={f.n}
              hint={f.d}
              price={priceText(val(ROOF[draft.size][i], mode), money)}
            />
          ))}
        </div>
      </Section>

      {/* 4 — Renk */}
      <Section n={4} title="Kumaş rengi" hint={colorText(draft)}>
        <ColorRow label="Tavan" value={draft.color ?? "#ffffff"} onPick={(hex) => set({ color: hex })} />
        <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={!!draft.wallColor}
            onChange={(e) => set({ wallColor: e.target.checked ? (draft.color ?? "#ffffff") : undefined })}
            className="size-4 accent-[var(--primary)]"
          />
          Duvarlar tavandan farklı renk
        </label>
        {draft.wallColor && <ColorRow label="Duvar" value={draft.wallColor} onPick={(hex) => set({ wallColor: hex })} className="mt-3" />}
      </Section>

      {/* 5 — Duvarlar */}
      <Section n={5} title="Duvarlar" hint="Kenarı açıp duvar tipini, kumaşını ve eklerini seçin">
        <WallEditor draft={draft} onChange={(sides) => set({ sides })} mode={mode} money={money} />
      </Section>

      {/* Döküm ve ekleme */}
      <div className="mt-5 rounded-2xl bg-muted/60 p-4">
        {rows.length ? (
          <ul className="space-y-1.5 text-sm">
            {rows.map((r) => (
              <li key={r.c} className="flex justify-between gap-3">
                <span className="min-w-0">
                  <span className="font-medium">{r.t}</span> <span className="text-xs text-muted-foreground">{r.s}</span>
                </span>
                <span className={cn("tabular shrink-0 font-semibold", r.bad && "text-warning")}>{r.bad ? "fiyat alınız" : money(r.v)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">İskelet, tavan ya da duvar seçin.</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <div className="mr-auto">
            <p className="text-[11px] text-muted-foreground">Gazebo birim fiyatı</p>
            <p className="tabular text-xl font-bold tracking-tight">{money(total)}</p>
          </div>
          <QtyStepper value={qty} onChange={(n) => setQty(Math.max(1, Math.min(99, n)))} size="sm" className="w-28" />
          <Button onClick={onAdd} disabled={!rows.length}>
            {editing ? <Check /> : <Plus />} {editing ? "Değişikliği kaydet" : twin ? "Adedi artır" : "Teklife ekle"}
          </Button>
        </div>
      </div>

    </Card>
  );
}

function priceText(v: number | null, money: (n: number) => string) {
  return v === null ? "fiyat alınız" : money(v);
}

function ColorRow({ label, value, onPick, className }: { label: string; value: string; onPick: (hex: string) => void; className?: string }) {
  const out = useOutOfStock();
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="w-12 shrink-0 text-xs font-semibold text-muted-foreground">{label}</span>
      {COLORS.map((c) => (
        <button
          key={c.hex}
          type="button"
          title={out.has(c.hex) ? `${c.name} · stokta yok` : c.name}
          aria-label={`${label}: ${c.name}${out.has(c.hex) ? " (stokta yok)" : ""}`}
          aria-pressed={value === c.hex}
          disabled={out.has(c.hex) && value !== c.hex}
          onClick={() => onPick(c.hex)}
          className={cn(
            "size-8 rounded-full ring-1 ring-border transition-transform",
            value === c.hex ? "scale-110 ring-2 ring-primary ring-offset-2 ring-offset-card" : "hover:scale-105",
            out.has(c.hex) && "cursor-not-allowed opacity-25 hover:scale-100",
          )}
          style={{ background: c.hex }}
        />
      ))}
      {out.has(value) && <span className="text-xs font-semibold text-danger">{COLORS.find((c) => c.hex === value)?.name} stokta yok</span>}
    </div>
  );
}

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="grid size-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{n}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <span className="ml-auto text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Option({ active, onClick, img, title, hint, price }: { active: boolean; onClick: () => void; img?: string; title: string; hint: string; price: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("flex items-center gap-3 rounded-xl border p-2.5 text-left transition-colors", active ? "border-primary bg-primary-soft/60" : "border-border hover:bg-muted/50")}
    >
      {img && (
        <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-border">
          <Image src={img} alt="" fill sizes="40px" className="object-contain" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{hint}</span>
      </span>
      <span className="tabular shrink-0 text-xs font-bold">{price}</span>
    </button>
  );
}

