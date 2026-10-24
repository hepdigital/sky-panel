"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, FileDown, MessageSquareText, Phone } from "lucide-react";
import { teklifYanit } from "@/app/t/[token]/actions";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PdfData } from "@/lib/terminal/calc";
import { downloadPdf } from "@/lib/terminal/pdf";
import { formatDate } from "@/lib/utils";
import { QuoteItems } from "./quote-items";

type Q = {
  no: string;
  veri: PdfData;
  asama: "taslak" | "gonderildi" | "onaylandi" | "reddedildi" | "siparis";
  gecerlilik: string | null;
  sureDoldu: boolean;
  yanitTarihi: string | null;
  yanitAd: string | null;
  yanitNot: string | null;
  satisci: { adSoyad: string; telefon: string | null; eposta: string | null } | null;
};

const input = "w-full rounded-xl border border-input bg-card px-4 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";

/** Sayfanın ana rengi teklifi veren markanın rengi olur (düğmeler, odak halkası); eski tekliflerde panelin rengi */
const brandStyle = (renk?: string) =>
  renk && /^#[0-9a-f]{6}$/i.test(renk)
    ? ({ "--primary": renk, "--primary-hover": `color-mix(in srgb, ${renk} 85%, black)`, "--ring": renk } as React.CSSProperties)
    : undefined;

/** Müşterinin teklif görünümü: inceleme, PDF, kabul ya da revizyon isteği */
export function CustomerQuote({ token, q }: { token: string; q: Q }) {
  const router = useRouter();
  const v = q.veri;
  const [mode, setMode] = useState<"kabul" | "revizyon" | null>(null);
  const [ad, setAd] = useState(v.yetkili || "");
  const [not, setNot] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [pdfBusy, setPdfBusy] = useState(false);
  const accepted = q.asama === "onaylandi" || q.asama === "siparis";
  const canRespond = !accepted && !q.sureDoldu && q.asama !== "reddedildi";

  const submit = () =>
    start(async () => {
      setErr(null);
      if (mode === "kabul" && !ad.trim()) return setErr("Lütfen adınızı yazın.");
      if (mode === "revizyon" && !not.trim()) return setErr("Lütfen ne değişmesini istediğinizi yazın.");
      const r = await teklifYanit(token, mode === "kabul", ad, not);
      if (!r.ok) return setErr(r.hata);
      setMode(null);
      router.refresh();
    });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-10" style={brandStyle(v.firma?.renk)}>
      <header className="flex items-center justify-between gap-3">
        {/* Teklifi veren markanın logosu (eski tekliflerde SKY) */}
        {v.firma?.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.firma.logo} alt={v.firma.ad} className="h-8 w-auto max-w-[200px] object-contain" />
        ) : (
          <Logo className="h-8" />
        )}
        <span className="text-right text-xs text-muted-foreground">
          Fiyat teklifi
          <span className="block text-sm font-bold text-foreground">{q.no}</span>
        </span>
      </header>

      {/* Durum */}
      {accepted ? (
        <p className="mt-5 flex items-start gap-2 rounded-2xl bg-success-soft px-4 py-3 text-sm font-medium text-success">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          Teklifi onayladınız{q.yanitAd ? ` (${q.yanitAd})` : ""}{q.yanitTarihi ? ` · ${formatDate(q.yanitTarihi, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}` : ""}. Teşekkür ederiz, satış temsilciniz sizinle iletişime geçecek.
        </p>
      ) : q.sureDoldu ? (
        <p className="mt-5 flex items-start gap-2 rounded-2xl bg-warning-soft px-4 py-3 text-sm font-medium text-warning">
          <Clock className="mt-0.5 size-4 shrink-0" /> Bu teklifin geçerlilik süresi dolmuştur. Güncel fiyat için satış temsilcinizle görüşün.
        </p>
      ) : q.yanitNot ? (
        <p className="mt-5 flex items-start gap-2 rounded-2xl bg-info-soft px-4 py-3 text-sm font-medium text-info">
          <MessageSquareText className="mt-0.5 size-4 shrink-0" /> Revizyon isteğiniz iletildi; satış temsilciniz güncel teklifi gönderecek.
        </p>
      ) : null}

      <Card className="mt-5 p-5">
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Sayın</p>
            <p className="text-base font-bold">{v.musteri || "—"}</p>
            {v.yetkili && <p className="text-muted-foreground">{v.yetkili}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-xs text-muted-foreground">Tarih · Geçerlilik</p>
            <p className="font-semibold">
              {v.tarih}
              {q.gecerlilik ? ` · ${formatDate(q.gecerlilik, { day: "numeric", month: "long", year: "numeric" })}'e kadar` : ""}
            </p>
            <p className="text-xs text-muted-foreground">{v.modeAd} fiyat listesi · satır tutarları {v.vatOn ? "KDV dahil" : "KDV hariç"}</p>
          </div>
        </div>
      </Card>

      {/* Kalemler */}
      <div className="mt-4">
        <QuoteItems v={v} compact />
      </div>

      {v.notlar.length > 0 && (
        <Card className="mt-4 p-5">
          <h2 className="text-sm font-semibold">Notlar</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {v.notlar.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* İşlemler */}
      <div className="mt-5 flex flex-wrap gap-2">
        {canRespond && (
          <>
            <Button size="lg" onClick={() => setMode("kabul")}>
              <CheckCircle2 /> Teklifi kabul et
            </Button>
            <Button size="lg" variant="outline" onClick={() => setMode("revizyon")}>
              <MessageSquareText /> Revizyon iste
            </Button>
          </>
        )}
        <Button
          size="lg"
          variant="outline"
          disabled={pdfBusy}
          onClick={async () => {
            setPdfBusy(true);
            await downloadPdf(v).catch(() => setErr("PDF oluşturulamadı, tekrar deneyin."));
            setPdfBusy(false);
          }}
        >
          <FileDown /> {pdfBusy ? "Hazırlanıyor…" : "PDF indir"}
        </Button>
      </div>

      {mode && (
        <Card className="mt-4 space-y-3 p-5">
          <h2 className="text-[15px] font-semibold">{mode === "kabul" ? "Teklifi kabul ediyorum" : "Revizyon isteği"}</h2>
          <label className="block text-sm">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Adınız soyadınız</span>
            <input value={ad} onChange={(e) => setAd(e.target.value)} className={`${input} h-11`} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{mode === "kabul" ? "Notunuz (isteğe bağlı)" : "Ne değişsin? (ölçü, adet, renk, fiyat…)"}</span>
            <textarea rows={3} value={not} onChange={(e) => setNot(e.target.value)} className={`${input} resize-none py-3`} />
          </label>
          {err && <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{err}</p>}
          <div className="flex gap-2">
            <Button disabled={pending} onClick={submit}>
              {pending ? "Gönderiliyor…" : mode === "kabul" ? "Onayla" : "Gönder"}
            </Button>
            <Button variant="ghost" onClick={() => setMode(null)}>
              Vazgeç
            </Button>
          </div>
        </Card>
      )}
      {err && !mode && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{err}</p>}

      {q.satisci && (
        <Card className="mt-5 flex flex-wrap items-center justify-between gap-3 p-5 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Satış temsilciniz</p>
            <p className="font-semibold">{q.satisci.adSoyad}</p>
            {q.satisci.eposta && <p className="text-muted-foreground">{q.satisci.eposta}</p>}
          </div>
          {q.satisci.telefon && (
            <a href={`tel:${q.satisci.telefon.replace(/[^\d+]/g, "")}`} className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 font-semibold">
              <Phone className="size-4" /> {q.satisci.telefon}
            </a>
          )}
        </Card>
      )}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        {v.firma?.unvan || v.firma?.ad || "SKY Görsel Çözümler"} · Bu sayfa yalnızca size gönderilen teklif içindir.
      </p>
    </div>
  );
}
