import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { OrderProfit } from "@/server/marketplaces/finance";

const tl = (n: number) => `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;

/** Pazaryeri siparişinin kârlılığı: ekstredeki satış, komisyon, kargo ve hizmet bedeli; ödeme ve KDV hariç kâr */
export function MarketplaceProfitCard({ p, site }: { p: OrderProfit; site: string }) {
  return (
    <Card className="mt-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Kârlılık</h2>
        <span className="text-[11px] text-muted-foreground">
          {p.tahmini ? `${site} hakedişi henüz oluşmadı; tahmini tutarlar öğrenilen oranlarla` : `${site} cari hesabından`}
        </span>
      </div>
      <div className="mt-3 space-y-1.5 text-sm">
        {p.satirlar.map((l, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">
              {l.ad}
              {(l.not || l.tahmini) && <span className="ml-1 text-[11px]">· {[l.not, l.tahmini && !p.tahmini ? "tahmini" : null].filter(Boolean).join(", ")}</span>}
            </span>
            <span className={cn("font-semibold whitespace-nowrap tabular-nums", l.tutar < 0 && "text-muted-foreground")}>{l.tutar < 0 ? `− ${tl(-l.tutar)}` : tl(l.tutar)}</span>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-1.5">
          <span className="font-semibold">{site} ödemesi</span>
          <span className="font-semibold tabular-nums">{tl(p.hakedis)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground">
            Maliyet <span className="text-[11px]">· KDV hariç{p.maliyetEksik ? ", bazı kalemlerin maliyeti girilmemiş" : ""}</span>
          </span>
          <span className="font-semibold tabular-nums">{p.maliyet === null ? "—" : `− ${tl(p.maliyet)}`}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-1.5">
          <span className="font-semibold">
            Kâr <span className="text-[11px] font-normal text-muted-foreground">· KDV hariç</span>
          </span>
          <span className={cn("text-base font-bold tabular-nums", p.kar === null ? "" : p.kar < 0 ? "text-danger" : "text-success")}>{p.kar === null ? "Maliyet girilince hesaplanır" : tl(p.kar)}</span>
        </div>
      </div>
    </Card>
  );
}
