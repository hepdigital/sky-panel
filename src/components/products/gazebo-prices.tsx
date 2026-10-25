"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Info, Save } from "lucide-react";
import { gazeboFiyatKaydet } from "@/app/panel/urunler/gazebo/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FABRICS, FRAME_IDS, SZ } from "@/lib/terminal/calc";
import {
  DEFAULT_TABLE,
  applyEdits,
  cellOf,
  type CostEdits,
  type Pair,
  type PriceEdits,
} from "@/lib/terminal/price-table";
import { cn } from "@/lib/utils";
import { LIST_PRODUCTS } from "@/modules/gazebo/walls";

type Brand = { id: number; ad: string; renk: string };
type Scope = "ortak" | "maliyet" | number;
type Section = "iskelet" | "tavan" | "duvar";
/** Hücre taslağı: [toptan, perakende] metin olarak; maliyette yalnızca ilk alan kullanılır */
type Draft = Record<string, [string, string]>;

/** "1.250" / "1250,50" → 1250.5; boş → null */
const parse = (v: string) => {
  const t = v.trim().replace(/\./g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};
const show = (n: number | null | undefined) =>
  n == null ? "" : n.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
const pairText = (p: Pair | undefined): [string, string] =>
  p ? [show(p[0]), show(p[1])] : ["", ""];

/** Ekrandaki satırlar: bölüme ve seçili sekmeye (seri / kumaş / duvar ölçüsü) göre */
function rowsOf(section: Section, pick: string, fabric: number) {
  if (section === "iskelet")
    return Object.keys(DEFAULT_TABLE.FRAMES[pick]?.p ?? {}).map((size) => ({
      key: `f|${pick}|${size}`,
      label: `${SZ[size] ?? size} m`,
    }));
  if (section === "tavan")
    return Object.keys(DEFAULT_TABLE.ROOF).map((size) => ({
      key: `r|${size}|${fabric}`,
      label: `${SZ[size] ?? size} m`,
    }));
  return LIST_PRODUCTS.filter((p) => DEFAULT_TABLE.WALL[pick]?.[p.id]).map(
    (p) => ({ key: `w|${pick}|${p.id}|${fabric}`, label: p.name }),
  );
}
const WALL_GROUPS = Object.keys(DEFAULT_TABLE.WALL);
const groupLabel = (g: string) => g.replace("x", " × ") + " cm";

/**
 * Modüler gazebo fiyatları (yalnızca yönetici): ortak fiyat, markaya özel fiyat ve maliyet.
 * Ortak fiyat tüm markalarda geçerlidir; markada boş bırakılan hücre ortak fiyatı kullanır. Maliyet satışçıya gösterilmez.
 */
export function GazeboPriceAdmin({
  brands,
  ortak,
  markalar,
  maliyet,
}: {
  brands: Brand[];
  ortak: PriceEdits;
  markalar: Record<number, PriceEdits>;
  maliyet: CostEdits;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [scope, setScope] = useState<Scope>("ortak");
  const [section, setSection] = useState<Section>("iskelet");
  const [frame, setFrame] = useState(FRAME_IDS[0]);
  const [group, setGroup] = useState(WALL_GROUPS[0]);
  const [fabric, setFabric] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Ortak (varsayılan + ortak düzeltmeler): ortak sekmesinin değerleri, marka sekmelerinin yer tutucusu
  const common = useMemo(() => applyEdits(DEFAULT_TABLE, ortak), [ortak]);
  const initial = useMemo(() => {
    const keys = [
      ...Object.keys(DEFAULT_TABLE.FRAMES).flatMap((id) =>
        Object.keys(DEFAULT_TABLE.FRAMES[id].p).map((s) => `f|${id}|${s}`),
      ),
    ];
    const all = [
      ...keys,
      ...Object.keys(DEFAULT_TABLE.ROOF).flatMap((s) =>
        [0, 1, 2].map((i) => `r|${s}|${i}`),
      ),
    ];
    for (const g of WALL_GROUPS)
      for (const k of Object.keys(DEFAULT_TABLE.WALL[g]))
        for (const i of [0, 1, 2]) all.push(`w|${g}|${k}|${i}`);
    const out: Record<string, Draft> = { ortak: {}, maliyet: {} };
    for (const key of all) {
      out.ortak[key] = pairText(cellOf(common, key));
      out.maliyet[key] = [show(maliyet[key]), ""];
    }
    for (const b of brands)
      out[`m${b.id}`] = Object.fromEntries(
        Object.entries(markalar[b.id] ?? {}).map(([k, v]) => [
          k,
          pairText(v ?? undefined),
        ]),
      );
    return out;
  }, [common, maliyet, markalar, brands]);
  const [drafts, setDrafts] = useState(initial);
  const sk = typeof scope === "number" ? `m${scope}` : scope;
  const draft = drafts[sk] ?? {};
  const dirty = (s: string) =>
    JSON.stringify(drafts[s]) !== JSON.stringify(initial[s]);

  const set = (key: string, i: 0 | 1, v: string) =>
    setDrafts({
      ...drafts,
      [sk]: {
        ...draft,
        [key]: (i === 0
          ? [v, draft[key]?.[1] ?? ""]
          : [draft[key]?.[0] ?? "", v]) as [string, string],
      },
    });

  function save() {
    const edits: Record<string, unknown> = {};
    for (const [key, [a, b]] of Object.entries(draft)) {
      const t = parse(a);
      const p = parse(b);
      if (Number.isNaN(t) || Number.isNaN(p))
        return setMsg({
          ok: false,
          text: "Fiyatları rakamla yazın (ör. 1.250).",
        });
      if (scope === "maliyet") {
        if (t !== null) edits[key] = t;
      } else if (t !== null || p !== null) {
        // Markada boş taraf ortak fiyatı alır; ortakta diğer taraf kopyalanır
        const base = scope === "ortak" ? null : cellOf(common, key);
        edits[key] = [t ?? base?.[0] ?? p, p ?? base?.[1] ?? t];
      }
      else if (scope === "ortak") edits[key] = null; // ortakta boş = fiyat sorunuz
    }
    start(async () => {
      const r = await gazeboFiyatKaydet(scope, edits);
      setMsg(
        r.ok
          ? {
              ok: true,
              text: "Kaydedildi. Teklif ekranı yeni fiyatlarla açılır.",
            }
          : { ok: false, text: r.hata },
      );
      if (r.ok) router.refresh();
    });
  }

  const pickTabs =
    section === "iskelet"
      ? FRAME_IDS.map((id) => ({
          id,
          label: `${id} · ${DEFAULT_TABLE.FRAMES[id].desc}`,
          on: frame === id,
          go: () => setFrame(id),
        }))
      : section === "duvar"
        ? WALL_GROUPS.map((g) => ({
            id: g,
            label: groupLabel(g),
            on: group === g,
            go: () => setGroup(g),
          }))
        : [];
  const rows = rowsOf(section, section === "iskelet" ? frame : group, fabric);
  const brandOf =
    typeof scope === "number" ? brands.find((b) => b.id === scope) : null;

  return (
    <div className="mx-auto max-w-[1000px]">
      <Link
        href="/panel/urunler"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Ürünler
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight md:text-[28px]">
        Modüler gazebo fiyatları
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        İskelet, tavan kumaşı ve duvar fiyatları · KDV hariç · teklif ekranı bu
        fiyatlarla hesaplar
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {(
          [
            ["ortak", "Ortak fiyat"],
            ...brands.map((b) => [b.id, b.ad] as const),
            ["maliyet", "Maliyet"],
          ] as [Scope, string][]
        ).map(([s, l]) => {
          const k = typeof s === "number" ? `m${s}` : s;
          return (
            <button
              key={k}
              type="button"
              onClick={() => {
                setScope(s);
                setMsg(null);
              }}
              className={cn(
                "flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold",
                scope === s
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {l}
              {dirty(k) && (
                <span
                  className="size-2 rounded-full bg-warning"
                  title="Kaydedilmemiş değişiklik"
                />
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-3 flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" />
        {scope === "ortak"
          ? "Ortak fiyat tüm markalarda geçerlidir. Boş bırakılan hücre teklifte “fiyat alınız” olur."
          : scope === "maliyet"
            ? "Maliyet yalnızca yöneticiye görünür. Bir gazebonun tüm parçalarının (iskelet, tavan, duvarlar) maliyeti girilmişse satışçı o gazeboyu maliyetin altında teklif edemez. Boş bırakılabilir."
            : `${brandOf?.ad} tekliflerinde bu fiyatlar kullanılır. Boş hücre ortak fiyatı kullanır (soluk yazan değer).`}
      </p>

      <Card className="mt-4 p-4 md:p-5">
        <div className="flex flex-wrap gap-1 rounded-full bg-muted p-1 sm:inline-flex">
          {(
            [
              ["iskelet", "İskelet"],
              ["tavan", "Tavan kumaşı"],
              ["duvar", "Duvarlar"],
            ] as [Section, string][]
          ).map(([s, l]) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              className={cn(
                "h-9 rounded-full px-4 text-sm font-semibold",
                section === s ? "bg-card shadow-card" : "text-muted-foreground",
              )}
            >
              {l}
            </button>
          ))}
        </div>
        {pickTabs.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {pickTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={t.go}
                className={cn(
                  "h-8 rounded-full border px-3 text-xs font-semibold",
                  t.on
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        {section !== "iskelet" && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {FABRICS.map((f, i) => (
              <button
                key={f.n}
                type="button"
                onClick={() => setFabric(i)}
                className={cn(
                  "h-8 rounded-full border px-3 text-xs font-semibold",
                  fabric === i
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {f.n}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-semibold">
                  {section === "duvar" ? "Duvar" : "Ölçü"}
                </th>
                {scope === "maliyet" ? (
                  <th className="w-40 pb-2 text-right font-semibold">
                    Maliyet
                  </th>
                ) : (
                  <>
                    <th className="w-36 pb-2 text-right font-semibold">
                      Toptan
                    </th>
                    <th className="w-36 pb-2 text-right font-semibold">
                      Perakende
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const v = draft[r.key] ?? ["", ""];
                const base = pairText(cellOf(common, r.key));
                const def = pairText(cellOf(DEFAULT_TABLE, r.key));
                const changed =
                  scope === "ortak" && (v[0] !== def[0] || v[1] !== def[1]);
                const cell = (i: 0 | 1, ph: string) => (
                  <td className="py-1.5 pl-2">
                    <input
                      value={v[i]}
                      onChange={(e) => set(r.key, i, e.target.value)}
                      inputMode="decimal"
                      placeholder={ph}
                      aria-label={`${r.label} ${scope === "maliyet" ? "maliyet" : i ? "perakende" : "toptan"}`}
                      className="tabular h-9 w-full rounded-lg border border-input bg-card px-2.5 text-right text-sm font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground/70 focus:border-primary"
                    />
                  </td>
                );
                return (
                  <tr key={r.key}>
                    <td className="py-1.5 pr-2">
                      <span className="font-medium">{r.label}</span>
                      {changed && (
                        <Badge tone="info" className="ml-2">
                          değişti
                        </Badge>
                      )}
                    </td>
                    {scope === "maliyet" ? (
                      cell(0, "—")
                    ) : scope === "ortak" ? (
                      <>
                        {cell(0, "sorunuz")}
                        {cell(1, "sorunuz")}
                      </>
                    ) : (
                      <>
                        {cell(0, base[0] || "sorunuz")}
                        {cell(1, base[1] || "sorunuz")}
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {section === "duvar" && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Listede olmayan pencere/kapı birleşimleri (ör. sineklikli pencere +
            kapı) bu listedeki fiyatlardan modül modül hesaplanır; listeyi
            güncellemek yeterlidir.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          {msg ? (
            <p
              className={cn(
                "text-sm font-medium",
                msg.ok ? "text-success" : "text-danger",
              )}
            >
              {msg.text}
            </p>
          ) : (
            <span className="text-xs text-muted-foreground">
              Kaydet, seçili sekmenin (
              {scope === "ortak"
                ? "ortak fiyat"
                : scope === "maliyet"
                  ? "maliyet"
                  : brandOf?.ad}{" "}
              · tüm bölümler) değişikliklerini kaydeder.
            </span>
          )}
          <Button disabled={pending || !dirty(sk)} onClick={save}>
            <Save /> {pending ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
