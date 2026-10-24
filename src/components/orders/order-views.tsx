"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CircleCheckBig, Globe, ListPlus, RefreshCw, ClipboardList, Factory, FileDown, PackageCheck, Search, Truck, XCircle, type LucideIcon } from "lucide-react";
import { siparisDurumu, siteleriEsitle } from "@/app/panel/siparisler/actions";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BrandFilter, BrandTag, type BrandOption } from "@/components/brand/brand-filter";
import { QuoteItems } from "@/components/terminal/quote-items";
import type { PdfData } from "@/lib/terminal/calc";
import { downloadPdf } from "@/lib/terminal/pdf";
import { cn, formatDate, formatTRY } from "@/lib/utils";

export type OrderStatus = "alindi" | "uretimde" | "hazir" | "kargoda" | "teslim" | "iptal";
export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: BadgeTone; icon: LucideIcon; hint: string }> = {
  alindi: { label: "Alındı", tone: "info", icon: ClipboardList, hint: "Sipariş oluşturuldu" },
  uretimde: { label: "Üretimde", tone: "warning", icon: Factory, hint: "Baskı / dikim / montaj" },
  hazir: { label: "Hazır", tone: "success", icon: PackageCheck, hint: "Paketlendi, sevke hazır" },
  kargoda: { label: "Kargoda / Sevkiyatta", tone: "info", icon: Truck, hint: "Kargoya verildi ya da yolda" },
  teslim: { label: "Teslim edildi", tone: "neutral", icon: CircleCheckBig, hint: "Müşteriye ulaştı" },
  iptal: { label: "İptal", tone: "danger", icon: XCircle, hint: "Sipariş iptal edildi" },
};
const FLOW: OrderStatus[] = ["alindi", "uretimde", "hazir", "kargoda", "teslim"];

/** Durum rozeti: ikon + ad */
export function OrderBadge({ durum }: { durum: OrderStatus }) {
  const st = ORDER_STATUS[durum];
  const Icon = st.icon;
  return (
    <Badge tone={st.tone} dot={false}>
      <Icon className="size-3" /> {st.label}
    </Badge>
  );
}

export type OrderRow = {
  id: number;
  no: string;
  olusturma: string;
  musteri: string | null;
  durum: OrderStatus;
  dahil: number;
  satisci: string | null;
  teklifNo: string | null;
  marka: string | null;
  markaRenk: string | null;
  kaynak: "teklif" | "site";
  site: string | null;
  disDurumAd: string | null;
  odemeYontemi: string | null;
  odemeDurumu: string | null;
};

type SiteStatus = { id: number; ad: string; sonBasari: string | null; sonHata: string | null };

export function OrderTable({
  rows,
  q,
  brands,
  activeBrand,
  kaynak,
  sites,
  showSiteFilter,
}: {
  rows: OrderRow[];
  q: string;
  brands: BrandOption[];
  activeBrand: string | null;
  kaynak: "teklif" | "site" | null;
  sites: SiteStatus[];
  showSiteFilter: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [syncing, startSync] = useTransition();
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const kaynakHref = (k: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (k) p.set("kaynak", k);
    else p.delete("kaynak");
    return p.size ? `${pathname}?${p}` : pathname;
  };
  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="pt-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Siparişler</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {rows.length} sipariş{q ? " bulundu" : ""} · onaylanan teklifler ve sitelerden gelen siparişler
        </p>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
      <form
        className="min-w-0 max-w-md flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          const v = new FormData(e.currentTarget).get("q")?.toString().trim() ?? "";
          const p = new URLSearchParams();
          if (v) p.set("q", v);
          if (activeBrand) p.set("marka", activeBrand);
          router.push(p.size ? `/panel/siparisler?${p}` : "/panel/siparisler");
        }}
      >
        <label className="flex h-11 items-center gap-2.5 rounded-xl border border-input bg-card px-4 text-sm focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
          <Search className="size-4 text-muted-foreground" />
          <input name="q" defaultValue={q} placeholder="Sipariş no ya da müşteri" className="w-full bg-transparent outline-none placeholder:text-muted-foreground" />
        </label>
      </form>
        <BrandFilter brands={brands} active={activeBrand} />
        {showSiteFilter && (
          <div className="inline-flex rounded-full bg-muted p-1">
            {(
              [
                [null, "Tümü"],
                ["teklif", "Tekliften"],
                ["site", "Siteden"],
              ] as const
            ).map(([k, l]) => (
              <Link key={l} href={kaynakHref(k)} className={cn("flex h-9 items-center rounded-full px-3.5 text-sm font-semibold", kaynak === k ? "bg-card shadow-card" : "text-muted-foreground")}>
                {l}
              </Link>
            ))}
          </div>
        )}
      </div>
      {sites.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {sites.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5" title={s.sonHata ?? undefined}>
              <span className={cn("size-2 rounded-full", s.sonHata ? "bg-danger" : s.sonBasari ? "bg-success" : "bg-border")} />
              {s.ad}: {s.sonHata ? "bağlantı hatası" : s.sonBasari ? `eşitlendi ${formatDate(s.sonBasari, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}` : "henüz eşitlenmedi"}
            </span>
          ))}
          <button
            type="button"
            disabled={syncing}
            onClick={() =>
              startSync(async () => {
                const r = await siteleriEsitle();
                setSyncMsg(r.ok ? `${r.adet ?? 0} sipariş güncellendi${r.hatalar?.length ? ` · ${r.hatalar.join(" · ")}` : ""}` : r.hata);
                router.refresh();
              })
            }
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} /> {syncing ? "Eşitleniyor…" : "Şimdi eşitle"}
          </button>
          {syncMsg && <span>{syncMsg}</span>}
        </div>
      )}
      <Card className="mt-4 overflow-hidden">
        {!rows.length ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">Henüz sipariş yok.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((o) => (
              <li key={o.id}>
                <Link href={`/panel/siparisler/${o.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-4 hover:bg-muted/40 md:grid-cols-[1.6fr_1fr_1fr_0.9fr] md:gap-4 md:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{o.musteri || "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {o.no}
                      {o.teklifNo ? ` · teklif ${o.teklifNo}` : ""}
                      {o.kaynak === "site" && o.site ? ` · ${o.site}` : ""}
                    </p>
                  </div>
                  <p className="tabular text-right text-sm font-bold md:order-last">{formatTRY(o.dahil, { whole: true })}</p>
                  <div className="col-span-2 flex flex-wrap items-center gap-1.5 md:col-span-1">
                    {o.kaynak === "site" ? (
                      <Badge tone={ORDER_STATUS[o.durum].tone} dot={false}>
                        <Globe className="size-3" /> {o.disDurumAd ?? ORDER_STATUS[o.durum].label}
                      </Badge>
                    ) : (
                      <OrderBadge durum={o.durum} />
                    )}
                    {o.kaynak === "site" && o.odemeYontemi && (
                      <span className={cn("text-[11px] font-semibold", o.odemeDurumu === "odendi" ? "text-success" : "text-warning")}>
                        {o.odemeYontemi} · {o.odemeDurumu === "odendi" ? "ödendi" : "ödeme bekleniyor"}
                      </span>
                    )}
                  </div>
                  <p className="col-span-2 text-xs text-muted-foreground md:col-span-1">
                    {brands.length > 1 && <BrandTag ad={o.marka} renk={o.markaRenk} className="mr-1.5" />}
                    {o.kaynak === "site" ? "Site siparişi" : (o.satisci ?? "—")} · {formatDate(o.olusturma, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

type Order = {
  id: number;
  no: string;
  olusturma: string;
  durum: OrderStatus;
  notlar: string | null;
  satisci: string | null;
  teklifId: number | null;
  teklifNo: string | null;
  musteriId: number | null;
  veri: PdfData;
  marka: string | null;
};

export function OrderDetail({ order }: { order: Order }) {
  const router = useRouter();
  const v = order.veri;
  const [pending, start] = useTransition();
  const [notlar, setNotlar] = useState(order.notlar ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const set = (durum: OrderStatus, note?: string) =>
    start(async () => {
      const r = await siparisDurumu(order.id, durum, note);
      setMsg(r.ok ? "Kaydedildi." : r.hata);
      router.refresh();
    });
  const step = FLOW.indexOf(order.durum);

  return (
    <div className="mx-auto max-w-[1100px]">
      <Link href="/panel/siparisler" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Siparişler
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">{order.no}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDate(order.olusturma, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {order.satisci ?? "—"}
            {order.marka && <span className="font-semibold text-foreground/80"> · {order.marka}</span>}
            {order.teklifId && (
              <>
                {" · "}
                <Link href={`/panel/teklifler/${order.teklifId}`} className="font-semibold text-primary hover:underline">
                  teklif {order.teklifNo}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/panel/gorevler?yeni=1&siparis=${order.id}`} className={buttonVariants({ variant: "outline" })} title="Bu siparişle ilgili birine görev ata (üretim, sevkiyat…)">
            <ListPlus /> Görev
          </Link>
          <Button variant="outline" onClick={() => downloadPdf(v)}>
            <FileDown /> Teklif PDF
          </Button>
        </div>
      </div>

      {/* Durum */}
      <Card className="mt-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold">Durum</h2>
          <OrderBadge durum={order.durum} />
        </div>
        <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {FLOW.map((s, i) => {
            const st = ORDER_STATUS[s];
            const Icon = st.icon;
            const done = i <= step;
            const current = i === step;
            return (
              <li key={s} className={i === FLOW.length - 1 ? "col-span-2 sm:col-span-1" : undefined}>
                <button
                  type="button"
                  disabled={pending || order.durum === "iptal"}
                  onClick={() => set(s)}
                  title={st.hint}
                  className={cn(
                    "flex h-full w-full flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-colors disabled:opacity-60",
                    current ? "border-primary bg-primary text-primary-foreground" : done ? "border-primary/30 bg-primary-soft text-primary" : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
                  )}
                >
                  <Icon className="size-5" />
                  <span className="text-xs font-semibold leading-tight">{st.label}</span>
                  <span className={cn("text-[10px] leading-tight", current ? "text-primary-foreground/80" : "text-muted-foreground")}>{st.hint}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Sipariş notu</span>
            <textarea
              rows={2}
              value={notlar}
              onChange={(e) => setNotlar(e.target.value)}
              placeholder="Teslim tarihi, adres, üretim notu…"
              className="w-full resize-none rounded-xl border border-input bg-card px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => set(order.durum, notlar)}>
            Notu kaydet
          </Button>
          {order.durum !== "iptal" ? (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => confirm("Sipariş iptal edilsin mi?") && set("iptal")}>
              İptal et
            </Button>
          ) : (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("alindi")}>
              İptali geri al
            </Button>
          )}
        </div>
        {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}
      </Card>

      {/* Müşteri ve kalemler */}
      <Card className="mt-4 px-5 py-4">
        <p className="text-xs text-muted-foreground">Müşteri</p>
        <p className="font-semibold">
          {order.musteriId ? (
            <Link href={`/panel/musteriler/${order.musteriId}`} className="hover:underline">
              {v.musteri || "—"}
            </Link>
          ) : (
            v.musteri || "—"
          )}
        </p>
        <p className="text-xs text-muted-foreground">{[v.yetkili, v.iletisim].filter(Boolean).join(" · ")}</p>
      </Card>
      <div className="mt-4">
        <QuoteItems v={v} />
      </div>
      {v.notlar.length > 0 && (
        <Card className="mt-4 p-5">
          <h2 className="text-[15px] font-semibold">Teklif notları</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {v.notlar.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
