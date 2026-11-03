import { ExternalLink, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export type OrderShipment = {
  id: number;
  tarih: string;
  koli: number;
  desi: number;
  toplam: number;
  durum: string | null;
  teslim: boolean;
  red: boolean;
  takipUrl: string | null;
  eslesme: string | null;
};

const tl = (n: number) => `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;

/** Siparişe bağlanan Yurtiçi gönderileri (Sevkiyat eşitlemesinden); ücret yalnızca yöneticiye */
export function OrderShipmentsCard({ list, fiyat }: { list: OrderShipment[]; fiyat: boolean }) {
  if (!list.length) return null;
  const toplam = list.reduce((a, s) => a + s.toplam, 0);
  return (
    <Card className="mt-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold">
          <Truck className="size-4" /> Yurtiçi Kargo
        </h2>
        {fiyat && (
          <span className="text-sm">
            Kargo gideri <b className="tabular">{tl(toplam)}</b> <span className="text-[11px] text-muted-foreground">KDV dahil</span>
          </span>
        )}
      </div>
      <ul className="mt-2 divide-y divide-border text-sm">
        {list.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground tabular">{formatDate(s.tarih, { day: "numeric", month: "short", year: "numeric" })}</span>
              <span>
                {s.koli} koli · {s.desi.toLocaleString("tr-TR")} desi
              </span>
              <Badge tone={s.red ? "danger" : s.teslim ? "success" : "info"}>{s.red ? "İade / red" : (s.durum ?? "—")}</Badge>
              {s.takipUrl && (
                <a href={s.takipUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary hover:underline">
                  Takip <ExternalLink className="size-3" />
                </a>
              )}
            </span>
            {fiyat && <span className="font-semibold tabular">{tl(s.toplam)}</span>}
          </li>
        ))}
      </ul>
      {list.some((s) => s.eslesme === "oto") && (
        <p className="mt-1 text-[11px] text-muted-foreground">Alıcı adı ve tarihle eşleştirildi; yanlışsa Sevkiyat ekranından kaldırılabilir.</p>
      )}
    </Card>
  );
}
