"use client";

import { useState } from "react";
import Image from "next/image";
import { Ban, ChevronDown, CopyCheck } from "lucide-react";
import { FAB_SHORT, PRESETS, imgSrc, plan, slots, type Gazebo, type Mode, type Side } from "@/lib/terminal/calc";
import { cn } from "@/lib/utils";
import {
  WALL_KINDS,
  closestAvailable,
  emptyWall,
  hasDoor,
  hasWindow,
  kindAvailable,
  kindImage,
  normalizeWall,
  wallAvailable,
  wallName,
  wallPrice,
  type Wall,
} from "./walls";

/**
 * Modüler duvar düzenleyici (satış ekranı ve B2B): kenar başına tip, kumaş ve açıklık ekleri.
 * 6 ve 8 m kenarlar tek parça ya da 2 × 3 m / 2 × 4 m duvar olarak kurulabilir.
 */
export function WallEditor({
  draft,
  onChange,
  mode,
  money,
}: {
  draft: Gazebo;
  onChange: (sides: Side[]) => void;
  mode: Mode;
  money: (n: number) => string;
}) {
  const [open, setOpen] = useState<number | null>(0);
  /** Açıkken bir duvarın kumaşı değişince diğer duvarlar da o kumaşa geçer; yeni duvar mevcut kumaşla gelir */
  const [sameFabric, setSameFabric] = useState(true);
  const p = plan(draft.size);
  const all = slots(draft);
  /** Duvarların ortak kumaşı (ilk duvarlı kenarınki) */
  const currentFabric = all.find((x) => x.wall.kind !== "yok")?.wall.f;

  const setSide = (i: number, side: Side) => onChange(draft.sides.map((s, j) => (j === i ? side : s)));
  const setWall = (i: number, part: number, next: Wall) => {
    const prev = draft.sides[i].walls[part] ?? emptyWall();
    const slot = all.find((x) => x.side === i && x.part === part)!;
    let w = normalizeWall(next);
    // Yeni eklenen duvar diğer duvarların kumaşıyla gelir (o kumaşta varsa)
    if (sameFabric && prev.kind === "yok" && w.kind !== "yok" && currentFabric !== undefined && currentFabric !== w.f && kindAvailable(slot.grup, w.kind, currentFabric, mode))
      w = closestAvailable(slot.grup, { ...w, f: currentFabric }, mode);
    let sides = draft.sides.map((s, j) => (j === i ? { ...s, walls: s.walls.map((x, k) => (k === part ? w : x)) } : s));
    // Kumaş değişti: diğer duvarlar da o kumaşa geçer; o kumaşta olmayan tip eski kumaşında kalır
    if (sameFabric && prev.kind !== "yok" && w.f !== prev.f) {
      const target = w.f;
      sides = sides.map((s, j) => ({
        ...s,
        walls: s.walls.map((x, k) => {
          if ((j === i && k === part) || x.kind === "yok") return x;
          const grup = all.find((sl) => sl.side === j && sl.part === k)?.grup ?? slot.grup;
          return kindAvailable(grup, x.kind, target, mode) ? closestAvailable(grup, { ...x, f: target }, mode) : x;
        }),
      }));
    }
    onChange(sides);
  };
  const toAll = (w: Wall) => onChange(draft.sides.map(() => ({ walls: [normalizeWall(w)] })));

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {PRESETS.map((pr) => (
          <button
            key={pr.n}
            type="button"
            onClick={() => onChange(pr.v.map((kind, i) => ({ walls: [normalizeWall({ kind, f: draft.sides[i]?.walls[0]?.f ?? 0 })] })))}
            className="h-8 rounded-full border border-border bg-card px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            {pr.n}
          </button>
        ))}
      </div>
      <label className="mb-3 flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={sameFabric} onChange={(e) => setSameFabric(e.target.checked)} className="size-4 accent-[var(--primary)]" />
        Tüm duvarlarda aynı kumaş <span className="opacity-70">(kapatınca her duvarın kumaşı ayrı seçilir)</span>
      </label>

      <div className="space-y-2">
        {p.map((pl, i) => {
          const s = draft.sides[i];
          const mine = all.filter((x) => x.side === i);
          const isOpen = open === i;
          const total = mine.reduce((a, x) => a + (wallPrice(x.grup, x.wall, mode) ?? 0), 0);
          const unpriced = mine.some((x) => x.wall.kind !== "yok" && wallPrice(x.grup, x.wall, mode) === null);
          return (
            <div key={pl.label} className={cn("rounded-xl border", isOpen ? "border-primary/50" : "border-border")}>
              <button type="button" onClick={() => setOpen(isOpen ? null : i)} className="flex w-full items-center gap-3 p-2.5 text-left">
                <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-white text-[10px] text-muted-foreground ring-1 ring-border">
                  {mine[0].wall.kind === "yok" ? "yok" : <Image src={imgSrc(kindImage(mine[0].wall.kind)!)} alt="" fill sizes="44px" className="object-contain" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {pl.label} <span className="text-xs font-normal text-muted-foreground">· {pl.cm} cm{s.split ? ` · 2 × ${pl.cm / 2} cm` : ""}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {mine.map((x) => (x.wall.kind === "yok" ? "Duvar yok" : `${wallName(x.wall)} · ${FAB_SHORT[x.wall.f]}`)).join("  |  ")}
                  </span>
                </span>
                {mine.some((x) => x.wall.kind !== "yok") && (
                  <span className={cn("tabular shrink-0 text-xs font-bold", unpriced && "text-warning")}>{unpriced ? "fiyat alınız" : money(total)}</span>
                )}
                <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
              </button>

              {isOpen && (
                <div className="space-y-4 border-t border-border p-3">
                  {pl.splittable && (
                    <div className="inline-flex rounded-full bg-muted p-1">
                      {[false, true].map((split) => (
                        <button
                          key={String(split)}
                          type="button"
                          onClick={() => setSide(i, { split, walls: split ? [s.walls[0] ?? emptyWall(), s.walls[1] ?? s.walls[0] ?? emptyWall()] : [s.walls[0] ?? emptyWall()] })}
                          className={cn("h-8 rounded-full px-3.5 text-xs font-semibold", !!s.split === split ? "bg-card shadow-card" : "text-muted-foreground")}
                        >
                          {split ? `2 × ${pl.cm / 200} m duvar` : `Tek parça ${pl.cm / 100} m`}
                        </button>
                      ))}
                    </div>
                  )}
                  {mine.map((x) => (
                    <WallForm
                      key={x.part}
                      title={mine.length > 1 ? `${x.label} · ${x.cm} cm` : undefined}
                      wall={x.wall}
                      group={x.grup}
                      mode={mode}
                      price={wallPrice(x.grup, x.wall, mode)}
                      money={money}
                      onChange={(w) => setWall(i, x.part, w)}
                      onAll={() => toAll(x.wall)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children, disabled }: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-8 rounded-full border px-3 text-xs font-semibold transition-colors disabled:opacity-40",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Tek duvarın formu: tip, kumaş, pencere ve kapı ekleri. Seçili kumaşta ve duvar ölçüsünde satılmayan tip/ek/kumaş
 * seçilemez (ör. baskılı kumaşta yalnızca düz tam, yarım, çift fermuarlı kapı ve PVC + perde).
 */
function WallForm({
  title,
  wall,
  group,
  mode,
  price,
  money,
  onChange,
  onAll,
}: {
  title?: string;
  wall: Wall;
  group: string;
  mode: Mode;
  price: number | null;
  money: (n: number) => string;
  onChange: (w: Wall) => void;
  onAll: () => void;
}) {
  const w = normalizeWall(wall);
  // Seçim değişince uygun değilse en yakın uygun bileşime geçilir
  const pick = (next: Wall) => onChange(closestAvailable(group, next, mode));
  /** Ek seçeneği: değiştirince uygun bir bileşim kalıyor mu */
  const can = (next: Wall) => wallAvailable(group, next, mode);
  return (
    <div className="space-y-2.5">
      {title && <p className="text-xs font-bold text-muted-foreground">{title}</p>}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-9">
        {WALL_KINDS.map((k) => {
          const img = kindImage(k.kind);
          const active = w.kind === k.kind;
          return (
            <button
              key={k.kind}
              type="button"
              onClick={() => pick({ ...w, kind: k.kind })}
              disabled={!kindAvailable(group, k.kind, w.f, mode)}
              title={kindAvailable(group, k.kind, w.f, mode) ? undefined : "Bu kumaşta yok"}
              aria-pressed={active}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border p-1.5 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-35",
                active ? "border-primary bg-primary-soft/60 ring-1 ring-primary" : "border-border hover:bg-muted/50",
              )}
            >
              <span className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-lg bg-[#f4f4f4]">
                {img ? <Image src={imgSrc(img)} alt="" fill sizes="96px" className="object-contain" /> : <Ban className="size-6 text-muted-foreground/60" />}
              </span>
              <span className={cn("text-[11px] font-semibold leading-tight", active ? "text-primary" : "text-muted-foreground")}>{k.short}</span>
            </button>
          );
        })}
      </div>
      {w.kind !== "yok" && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-xs text-muted-foreground">Kumaş</span>
            <div className="inline-flex rounded-full bg-muted p-1">
              {FAB_SHORT.map((f, i) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => pick({ ...w, f: i })}
                  disabled={!kindAvailable(group, w.kind, i, mode)}
                  title={kindAvailable(group, w.kind, i, mode) ? undefined : "Bu duvar tipi bu kumaşta yok"}
                  className={cn("h-7 rounded-full px-3 text-[11px] font-semibold disabled:opacity-35", w.f === i ? "bg-card shadow-card" : "text-muted-foreground")}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          {hasWindow(w.kind) && w.p && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">Pencere 137×137</span>
              <Chip active={w.p.pvc} disabled={!can({ ...w, p: { ...w.p, pvc: !w.p.pvc } })} onClick={() => pick({ ...w, p: { ...w.p!, pvc: !w.p!.pvc } })}>
                Şeffaf PVC
              </Chip>
              <Chip active={w.p.sineklik} disabled={!can({ ...w, p: { ...w.p, sineklik: !w.p.sineklik } })} onClick={() => pick({ ...w, p: { ...w.p!, sineklik: !w.p!.sineklik } })}>
                Sineklik
              </Chip>
              <Chip active={w.p.perde} disabled={!can({ ...w, p: { ...w.p, perde: !w.p.perde } })} onClick={() => pick({ ...w, p: { ...w.p!, perde: !w.p!.perde } })}>
                Perde
              </Chip>
            </div>
          )}
          {hasDoor(w.kind) && w.k && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">Kapı 90 cm · perdeli</span>
              <Chip active={w.k.sineklik} disabled={!can({ ...w, k: { sineklik: !w.k.sineklik } })} onClick={() => pick({ ...w, k: { sineklik: !w.k!.sineklik } })}>
                Sineklik
              </Chip>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2">
            <span className="min-w-0 text-xs">
              <span className="font-semibold">{wallName(w)}</span> · {FAB_SHORT[w.f]}
            </span>
            <span className="flex items-center gap-3">
              <button type="button" onClick={onAll} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
                <CopyCheck className="size-3.5" /> Tüm kenarlara uygula
              </button>
              <span className={cn("tabular text-sm font-bold", price === null && "text-warning")}>{price === null ? "fiyat alınız" : money(price)}</span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
