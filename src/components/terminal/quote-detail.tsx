"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, FileDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PdfData } from "@/lib/terminal/calc";
import { downloadPdf } from "@/lib/terminal/pdf";
import { formatDate } from "@/lib/utils";
import { QuoteFlow, type QuoteFlowInfo } from "./quote-flow";
import { QuoteItems } from "./quote-items";
import { OPEN_KEY } from "./terminal";

type Quote = {
  id: number;
  no: string;
  olusturma: string;
  kullanici: string | null;
  fiyatTipi: "perakende" | "toptan";
  musteriId: number | null;
  veri: PdfData;
  durum: unknown;
};

/** Teklif ayrıntısı: kalemler, toplamlar; PDF kayıttaki veriden aynen üretilir, "Terminalde aç" sepeti bu teklifle doldurur */
export function QuoteDetail({ quote, flow }: { quote: Quote; flow: QuoteFlowInfo }) {
  const router = useRouter();
  const v = quote.veri;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function openInTerminal() {
    if (!confirm("Terminaldeki mevcut sepet bu teklifle değiştirilecek. Devam edilsin mi?")) return;
    try {
      const [telefon = "", eposta = ""] = (v.iletisim || "").split(" · ");
      const customer = v.musteri ? { id: quote.musteriId, firma: v.musteri, yetkili: v.yetkili, telefon, eposta } : null;
      localStorage.setItem(OPEN_KEY, JSON.stringify({ q: quote.durum, customer }));
    } catch {}
    router.push("/panel/teklifler/yeni");
  }

  async function pdf() {
    setBusy(true);
    setErr(null);
    await downloadPdf(v).catch((e) => setErr(`PDF oluşturulamadı: ${e instanceof Error ? e.message : e}`));
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-[1100px]">
      <Link href="/panel/teklifler" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Teklifler
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">{quote.no}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDate(quote.olusturma, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {v.hazirlayan || quote.kullanici || "—"}
          </p>
        </div>
        <div className="flex gap-2">
          {!!quote.durum && (
            <Button variant="outline" title="Sepeti bu teklifle doldurur (güncel fiyatlarla); değiştirip yeni teklif olarak kaydedebilirsiniz" onClick={openInTerminal}>
              <Copy /> Terminalde aç
            </Button>
          )}
          <Button disabled={busy} onClick={pdf}>
            <FileDown /> {busy ? "Hazırlanıyor…" : "PDF indir"}
          </Button>
        </div>
      </div>
      {err && <p className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{err}</p>}

      <QuoteFlow id={quote.id} no={quote.no} veri={v} flow={flow} satisci={v.hazirlayan || quote.kullanici || ""} />

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">Müşteri</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Firma</dt>
            <dd>{v.musteri || "—"}</dd>
            <dt className="text-muted-foreground">Yetkili</dt>
            <dd>{v.yetkili || "—"}</dd>
            <dt className="text-muted-foreground">İletişim</dt>
            <dd>{v.iletisim || "—"}</dd>
          </dl>
        </Card>
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">Teklif</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Fiyat listesi</dt>
            <dd>
              <Badge tone={quote.fiyatTipi === "toptan" ? "warning" : "info"}>{quote.fiyatTipi === "toptan" ? "Toptan" : "Perakende"}</Badge>
            </dd>
            <dt className="text-muted-foreground">Geçerlilik</dt>
            <dd>{v.gecerlilik || "—"}</dd>
            <dt className="text-muted-foreground">Satır tutarları</dt>
            <dd>{v.vatOn ? "KDV dahil" : "KDV hariç"}</dd>
          </dl>
        </Card>
      </div>

      <div className="mt-4">
        <QuoteItems v={v} />
      </div>

      {v.notlar.length > 0 && (
        <Card className="mt-4 p-5">
          <h2 className="text-[15px] font-semibold">Notlar</h2>
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
