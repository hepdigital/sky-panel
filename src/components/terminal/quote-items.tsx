import Image from "next/image";
import { ReceiptText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { imgSrc, type PdfData } from "@/lib/terminal/calc";
import { formatTRY } from "@/lib/utils";

/** Kalem görseli: 3D görüntüsü (data:), yüklenen dosya ya da terminal görsel anahtarı */
const src = (key: string | null | undefined) => (key ? imgSrc(key) : null);

/**
 * Teklifin kalemleri PDF'teki gibi: ürün görseli, tam açıklama, gazebonun bileşenleri (iskelet, tavan, duvarlar) görselleri
 * ve fiyatlarıyla, 3D görünümleri büyük; altta toplamlar. Teklif, sipariş ve müşterinin teklif sayfası bunu kullanır.
 */
export function QuoteItems({ v, compact }: { v: PdfData; compact?: boolean }) {
  const pad = compact ? "px-4" : "px-5";
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-border">
        {v.kalemler.map((k, i) => {
          const img = src(k.img);
          const parts = "parcalar" in k ? k.parcalar : [];
          const views = "gorseller" in k ? k.gorseller : [];
          return (
            <li key={i} className={`${pad} py-4`}>
              <div className="flex gap-3.5">
                <span className="relative grid size-[72px] shrink-0 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-border">
                  {img ? (
                    <Image src={img} alt="" fill sizes="72px" className="object-contain p-1" unoptimized={!img.startsWith("/terminal/")} />
                  ) : (
                    // Ek kalem (nakliye, montaj…): görseli yok
                    <ReceiptText className="size-7 text-muted-foreground" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug">{k.ad}</p>
                  <p className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{k.alt}</p>
                </div>
                <div className="shrink-0 text-right text-sm">
                  <p className="tabular font-bold">{formatTRY(k.tutar, { whole: true })}</p>
                  <p className="tabular text-[11px] text-muted-foreground">
                    {k.adet} × {formatTRY(k.birim, { whole: true })}
                  </p>
                  {k.isk && <p className="text-[11px] font-semibold text-success">{k.isk}</p>}
                </div>
              </div>

              {parts.length > 0 && (
                <div className="mt-3 rounded-xl bg-muted/50 p-2 sm:ml-[86px]">
                  <p className="px-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bileşenler · 1 adet için</p>
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {parts.map((p, j) => {
                      const pi = src(p.img);
                      return (
                        <li key={j} className="flex items-center gap-2.5 rounded-lg bg-card px-2 py-1.5">
                          <span className="relative size-9 shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-border">
                            {pi && <Image src={pi} alt="" fill sizes="36px" className="object-contain" unoptimized={!pi.startsWith("/terminal/")} />}
                          </span>
                          <span className="min-w-0 flex-1 text-xs leading-tight">{p.ad}</span>
                          <span className="tabular shrink-0 text-xs font-semibold">{p.fiyat === null ? <span className="text-warning">fiyat alınız</span> : formatTRY(p.fiyat, { whole: true })}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {views.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:ml-[86px]">
                  {views.map((g, j) => (
                    <span key={j} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-[#f4f4f4] ring-1 ring-border">
                      <Image src={g} alt={`${k.ad} görünüm ${j + 1}`} fill sizes="420px" className="object-cover" unoptimized />
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <dl className={`space-y-1.5 border-t border-border ${pad} py-4 text-sm`}>
        {v.satirIsk !== 0 && (
          <>
            <div className="flex justify-between text-muted-foreground">
              <dt>Liste toplamı (KDV hariç)</dt>
              <dd className="tabular">{formatTRY(v.araListe, { whole: true })}</dd>
            </div>
            <div className={v.satirIsk > 0 ? "flex justify-between text-success" : "flex justify-between"}>
              <dt>{v.satirIsk > 0 ? "Satır iskontoları" : "Satır ilaveleri"}</dt>
              <dd className="tabular">
                {v.satirIsk > 0 ? "−" : "+"}
                {formatTRY(Math.abs(v.satirIsk), { whole: true })}
              </dd>
            </div>
          </>
        )}
        {v.genelIsk !== 0 && (
          <div className="flex justify-between text-success">
            <dt>Genel iskonto {v.genelIskEtiket}</dt>
            <dd className="tabular">−{formatTRY(v.genelIsk, { whole: true })}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt>Ara toplam (KDV hariç)</dt>
          <dd className="tabular font-medium">{formatTRY(v.araToplam, { whole: true })}</dd>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <dt>KDV (%20)</dt>
          <dd className="tabular">{formatTRY(v.kdv, { whole: true })}</dd>
        </div>
        <div className="flex items-end justify-between border-t border-border pt-3">
          <dt className="font-semibold">Genel toplam</dt>
          <dd className="tabular text-2xl font-bold tracking-tight">{formatTRY(v.genelToplam, { whole: true })}</dd>
        </div>
      </dl>
      {v.uyarilar.length > 0 && (
        <ul className={`space-y-1 border-t border-border bg-warning-soft/50 ${pad} py-3 text-xs font-medium text-warning`}>
          {v.uyarilar.map((u, i) => (
            <li key={i}>{u}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
