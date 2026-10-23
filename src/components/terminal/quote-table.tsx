"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, FilePlus2, Search, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate, formatTRY } from "@/lib/utils";
import { ChannelSheet, type Channel } from "./channel-sheet";
import { ASAMA, type Asama } from "./quote-flow";

export type QuoteRow = {
  id: number;
  no: string;
  olusturma: string;
  musteri: string | null;
  kullanici: string | null;
  fiyatTipi: "perakende" | "toptan";
  kalemSayisi: number;
  asama: Asama;
  ilkGorulme: string | null;
  kanal: string | null;
  haric: number;
  dahil: number;
};

/** Kayıtlı teklifler: arama (no, müşteri, hazırlayan) */
export function QuoteTable({ rows, q, channels }: { rows: QuoteRow[]; q: string; channels: Channel[] | null }) {
  const router = useRouter();
  const [chOpen, setChOpen] = useState(false);
  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Teklifler</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} teklif{q ? " bulundu" : ""} · kaydedilen her teklifin PDF&apos;i aynen yeniden indirilebilir
          </p>
        </div>
        <div className="flex gap-2">
          {channels && (
            <button type="button" onClick={() => setChOpen(true)} title="Kanallar (müşterinin geldiği yer)" aria-label="Kanallar" className={buttonVariants({ variant: "outline", size: "icon" })}>
              <Settings2 />
            </button>
          )}
          <Link href="/panel/teklifler/yeni" className={buttonVariants()}>
            <FilePlus2 /> Yeni teklif
          </Link>
        </div>
      </div>
      {channels && <ChannelSheet open={chOpen} onClose={() => setChOpen(false)} channels={channels} />}

      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          const v = new FormData(e.currentTarget).get("q")?.toString().trim() ?? "";
          router.push(v ? `/panel/teklifler?q=${encodeURIComponent(v)}` : "/panel/teklifler");
        }}
      >
        <label className="flex h-11 max-w-md items-center gap-2.5 rounded-xl border border-input bg-card px-4 text-sm focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
          <Search className="size-4 text-muted-foreground" />
          <input name="q" defaultValue={q} placeholder="Teklif no, müşteri ya da hazırlayan" className="w-full bg-transparent outline-none placeholder:text-muted-foreground" />
        </label>
      </form>

      <Card className="mt-4 overflow-hidden">
        {!rows.length ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">Henüz teklif yok.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/panel/teklifler/${t.id}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-4 hover:bg-muted/40 md:grid-cols-[1.6fr_1.2fr_1fr_0.9fr] md:gap-4 md:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{t.musteri || "Müşterisiz teklif"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.no} · {t.kalemSayisi} kalem
                    </p>
                  </div>
                  <div className="text-right md:order-last">
                    <p className="tabular text-sm font-bold">{formatTRY(t.dahil, { whole: true })}</p>
                    <p className="tabular text-[11px] text-muted-foreground">KDV hariç {formatTRY(t.haric, { whole: true })}</p>
                  </div>
                  <div className="col-span-2 flex flex-wrap items-center gap-1.5 md:col-span-1">
                    <Badge tone={ASAMA[t.asama].tone}>{ASAMA[t.asama].label}</Badge>
                    {t.ilkGorulme && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success" title="Müşteri linki açtı">
                        <Eye className="size-3" /> Görüldü
                      </span>
                    )}
                    {t.fiyatTipi === "toptan" && <Badge tone="warning">Toptan</Badge>}
                  </div>
                  <p className="col-span-2 text-xs text-muted-foreground md:col-span-1">
                    {t.kanal && <span className="font-semibold text-foreground/80">{t.kanal} · </span>}
                    {t.kullanici ?? "—"} · {formatDate(t.olusturma, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
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
