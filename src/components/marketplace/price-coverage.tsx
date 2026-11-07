"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ExternalLink, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { KapsamDurum, KapsamSatir } from "@/server/marketplaces/panel-prices";
import { cn, formatTRY } from "@/lib/utils";

const DURUM: Record<KapsamDurum, { ad: string; tone: "danger" | "warning" | "success" }> = {
  yok: { ad: "Panelde fiyatı yok", tone: "danger" },
  farkli: { ad: "Fiyat farklı", tone: "warning" },
  esit: { ad: "Tutuyor", tone: "success" },
};
const TL = (n: number | null) => (n === null ? "—" : formatTRY(n, { whole: true }));

/**
 * Sitedeki yayındaki ürünlerin panel fiyatı: WhatsApp asistanı fiyatı panelden söyler; panelde karşılığı olmayan üründe
 * geçici olarak site fiyatını söyler ve teklif oluşturmaz. Eksikler "Ürünler > Siteden ekle" ile tamamlanır.
 */
export function PriceCoverage({ raporlar }: { raporlar: { id: number; ad: string; satirlar: KapsamSatir[] | null }[] }) {
  const [siteId, setSiteId] = useState(raporlar[0]?.id ?? 0);
  const [filtre, setFiltre] = useState<KapsamDurum | "hepsi">("yok");
  const [q, setQ] = useState("");
  const r = raporlar.find((x) => x.id === siteId);
  const satirlar = r?.satirlar ?? [];
  const say = (d: KapsamDurum) => satirlar.filter((s) => s.durum === d).length;
  const ara = q.trim().toLocaleLowerCase("tr");
  const liste = satirlar.filter((s) => (filtre === "hepsi" || s.durum === filtre) && (!ara || s.ad.toLocaleLowerCase("tr").includes(ara)));

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <div className="pt-1">
        <Link href="/panel/satis-urunleri" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-3.5" /> Ürünler
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-[28px]">Fiyat kapsamı</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Sitede satıştaki her ürünün panelde fiyatı var mı ve sitedekiyle aynı mı. Asistan fiyatı panelden söyler; panelde fiyatı olmayan üründe şimdilik sitedeki fiyatı söyler ama
          teklif oluşturmaz. Eksikleri <b>Ürünler › Siteden ekle</b> ile, farkları ürün kartından ya da sitede fiyatı eşitleyerek giderin.
        </p>
      </div>

      {raporlar.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {raporlar.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setSiteId(x.id)}
              className={cn("h-8 rounded-full border px-3 text-xs font-semibold", x.id === siteId ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}
            >
              {x.ad}
            </button>
          ))}
        </div>
      )}

      {!r ? (
        <p className="rounded-xl bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">Bağlı WooCommerce sitesi yok.</p>
      ) : r.satirlar === null ? (
        <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">Site şu an okunamadı; biraz sonra sayfayı yenileyin.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(["yok", "farkli", "esit", "hepsi"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setFiltre(d)}
                className={cn(
                  "h-9 rounded-full border px-3.5 text-xs font-semibold",
                  filtre === d ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {d === "hepsi" ? `Hepsi · ${satirlar.length}` : `${DURUM[d].ad} · ${say(d)}`}
              </button>
            ))}
            <label className="relative w-full sm:ml-auto sm:w-64">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ürün ara"
                className="h-9 w-full rounded-full border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>

          <Card className="overflow-hidden">
            {liste.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Bu filtrede ürün yok.</p>
            ) : (
              <ul className="divide-y divide-border">
                {liste.map((s) => (
                  <li key={s.id} className="flex gap-3 px-4 py-3">
                    <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {s.gorsel && <img src={s.gorsel} alt="" className="size-full object-contain" loading="lazy" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <a href={s.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold leading-tight hover:underline">
                        {s.ad} <ExternalLink className="size-3 text-muted-foreground" />
                      </a>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <Badge tone={DURUM[s.durum].tone}>{DURUM[s.durum].ad}</Badge>
                        <span>
                          Site <b className="tabular text-foreground">{TL(s.site)}</b>
                        </span>
                        <span>
                          Panel <b className="tabular text-foreground">{TL(s.panel)}</b>
                        </span>
                      </div>
                      {s.farklar.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
                          {s.farklar.map((f, i) => (
                            <li key={i}>
                              {f.kart}: site <b className="tabular">{TL(f.site)}</b> · panel <b className="tabular">{TL(f.panel)}</b>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
