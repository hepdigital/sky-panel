"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, RotateCcw, Save, Trash2, Truck } from "lucide-react";
import { kargoTarifeKaydet } from "@/app/panel/sevkiyat/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { YURTICI_DEFAULT, type Tariff } from "@/lib/cargo-tariff";
import { cn } from "@/lib/utils";
import { PackageFields, draftOf, type PaketDraft } from "./package-fields";

const input = "h-9 w-full rounded-lg border border-input bg-card px-2.5 text-right text-sm font-semibold outline-none tabular focus:border-primary";
const parse = (v: string) => {
  const t = v.trim().replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};
const show = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
type Draft = { kademeler: { ust: string; ucret: string }[]; ustuDesi: string; ekYuzde: string; kdv: string };
const tariffDraft = (t: Tariff): Draft => ({
  kademeler: t.kademeler.map((k) => ({ ust: String(k.ust), ucret: show(k.ucret) })),
  ustuDesi: show(t.ustuDesi), ekYuzde: show(t.ekYuzde), kdv: show(t.kdv),
});

/**
 * Sevkiyat: Yurtiçi Kargo anlaşmalı tarifesi (mesafeden bağımsız, desi kademeli) ve hesap makinesi. Tarife ürün kartlarında,
 * modüler gazebo parçalarında ve teklif özetinde kargo ücretini hesaplar.
 */
export function ShippingAdmin({ tarife }: { tarife: Tariff }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(() => tariffDraft(tarife));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [calc, setCalc] = useState<PaketDraft>(draftOf(null));

  const parsed = (): Tariff | string => {
    const kademeler = d.kademeler.map((k) => ({ ust: parse(k.ust), ucret: parse(k.ucret) }));
    const rest = [parse(d.ustuDesi), parse(d.ekYuzde), parse(d.kdv)];
    if ([...kademeler.flatMap((k) => [k.ust, k.ucret]), ...rest].some((n) => n === null || Number.isNaN(n))) return "Tüm alanları rakamla doldurun.";
    return { kademeler: kademeler as { ust: number; ucret: number }[], ustuDesi: rest[0]!, ekYuzde: rest[1]!, kdv: rest[2]! };
  };
  const live = parsed();
  const t = typeof live === "string" ? tarife : live;
  const sorted = [...d.kademeler].map((k, i) => ({ ...k, i })).sort((a, b) => (parse(a.ust) ?? 0) - (parse(b.ust) ?? 0));
  const dirty = JSON.stringify(d) !== JSON.stringify(tariffDraft(tarife));

  function save() {
    if (typeof live === "string") return setMsg({ ok: false, text: live });
    start(async () => {
      const r = await kargoTarifeKaydet(live);
      setMsg(r.ok ? { ok: true, text: "Kaydedildi. Ürünler ve teklif ekranı yeni tarifeyle hesaplar." } : { ok: false, text: r.hata });
      if (r.ok) router.refresh();
    });
  }
  const setK = (i: number, patch: Partial<{ ust: string; ucret: string }>) => setD({ ...d, kademeler: d.kademeler.map((k, j) => (j === i ? { ...k, ...patch } : k)) });

  return (
    <div className="mx-auto max-w-[1000px]">
      <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Sevkiyat</h1>
      <p className="mt-1 text-sm text-muted-foreground">Kargo tarifesi ve koli hesabı · ürün kartları, modüler gazebo parçaları ve teklif özeti bu tarifeyle hesaplar</p>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="p-4 md:p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Truck className="size-4" /> Yurtiçi Kargo · anlaşmalı tarife
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Mesafeden bağımsız, koli başına, KDV hariç. Koli desisi (en × boy × yükseklik / 3000) ile kilosunun büyüğü en yakın tam sayıya yuvarlanıp kademeden okunur.
          </p>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-semibold">Desi</th>
                <th className="w-28 pb-2 text-right font-semibold">Üst desi</th>
                <th className="w-32 pb-2 text-right font-semibold">Ücret (₺)</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((k, n) => {
                const prev = n ? (parse(sorted[n - 1].ust) ?? 0) + 1 : 0;
                const ust = parse(k.ust);
                return (
                  <tr key={k.i}>
                    <td className="py-1.5 pr-2 font-medium tabular">{ust === null || Number.isNaN(ust) ? "—" : prev >= ust ? `${ust}` : `${prev} – ${ust}`}</td>
                    <td className="py-1.5 pl-2">
                      <input value={k.ust} onChange={(e) => setK(k.i, { ust: e.target.value })} inputMode="numeric" className={input} aria-label="Üst desi" />
                    </td>
                    <td className="py-1.5 pl-2">
                      <input value={k.ucret} onChange={(e) => setK(k.i, { ucret: e.target.value })} inputMode="decimal" className={input} aria-label="Ücret" />
                    </td>
                    <td className="py-1.5 pl-1 text-right">
                      <button type="button" onClick={() => setD({ ...d, kademeler: d.kademeler.filter((_, j) => j !== k.i) })} className="text-muted-foreground hover:text-danger" aria-label="Kademeyi sil">
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Button size="sm" variant="ghost" className="mt-1" onClick={() => setD({ ...d, kademeler: [...d.kademeler, { ust: "", ucret: "" }] })}>
            <Plus /> Kademe ekle
          </Button>
          <div className="mt-3 grid grid-cols-3 gap-3 border-t border-border pt-3">
            {(
              [
                ["ustuDesi", "Son kademe üstü, desi başı ₺"],
                ["ekYuzde", "Faturadaki ek oran %"],
                ["kdv", "KDV %"],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="block">
                <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">{l}</span>
                <input value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} inputMode="decimal" className={input} />
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Ek oran: Yurtiçi faturalarında her gönderiye tablo fiyatının üstüne %2,35 geliyor (Haziran–Kasım 2026 gönderilerinin hepsinde aynı). Kesin değer için Yurtiçi’ye danışılabilir.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            {msg ? <p className={cn("text-sm font-medium", msg.ok ? "text-success" : "text-danger")}>{msg.text}</p> : <span />}
            <div className="flex gap-2">
              <Button variant="ghost" disabled={pending} onClick={() => (setD(tariffDraft(YURTICI_DEFAULT)), setMsg(null))} title="Yurtiçi anlaşma tablosundaki değerler">
                <RotateCcw /> Anlaşma tablosu
              </Button>
              <Button disabled={pending || !dirty} onClick={save}>
                <Save /> {pending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4 md:p-5">
            <h2 className="text-[15px] font-semibold">Koli hesabı</h2>
            <p className="mt-1 text-xs text-muted-foreground">Ölçüleri yazın; desi ve Yurtiçi ücreti (yukarıdaki tarifeyle) çıkar.</p>
            <div className="mt-3">
              <PackageFields value={calc} onChange={setCalc} tarife={t} />
            </div>
          </Card>
          <Card className="p-4 text-xs text-muted-foreground md:p-5">
            <p className="text-[13px] font-semibold text-foreground">Koli ölçüleri nerede girilir</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>Satış ürünleri: Ürünler › ürün kartı › Paket</li>
              <li>Teklif ürünleri: Teklif ürünleri › ürünü düzenle › Koli</li>
              <li>Modüler gazebo: Teklif ürünleri › Modüler gazebo fiyatları › Koli ölçüleri (iskelet, tavan, duvar, zemin)</li>
            </ul>
            <p className="mt-2">Teklif özetinde tahmini Yurtiçi kargo görünür; tek tuşla “Nakliye bedeli” kalemi olarak eklenir.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
