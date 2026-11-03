"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, MessageCircle, X } from "lucide-react";
import { waOrnekGuncelle } from "@/app/panel/whatsapp/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";

type Row = {
  id: number; sohbetId: number | null; urunKodu: string | null; musteriMesaji: string; dogruCevap: string; durum: "oneri" | "onayli" | "reddedildi";
  fiyat: boolean; aktif: boolean; tarih: string; onaylayan: string | null;
};

const areaCls = "w-full rounded-xl border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";

/** Ekibin cevaplarından çıkarılan öneriler: yönetici düzenleyip onaylar; yalnız onaylı ve aktif olanlar asistanın sistem istemine girer */
export function ExampleList({ rows, kartlar }: { rows: Row[]; kartlar: { kod: string; ad: string }[] }) {
  const oneriler = rows.filter((r) => r.durum === "oneri");
  const onayli = rows.filter((r) => r.durum === "onayli");
  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="pt-1">
        <Link href="/panel/whatsapp/asistan" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Asistan ayarları
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-[28px]">Öğrenilen cevaplar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Asistanın devrettiği sohbet kapatılınca ya da asistana bırakılınca, müşterinin sorusu ve ekibin cevabından öneri çıkarılır. Onayladıklarınız benzer sorularda
          asistana örnek olur. Fiyat ya da indirim içerenler işaretlidir: kişiye özel fiyat genel kurala dönüşmesin.
        </p>
      </div>
      <h2 className="mt-6 text-sm font-bold">Onay bekleyen öneriler ({oneriler.length})</h2>
      <div className="mt-2 space-y-3">
        {oneriler.map((r) => (
          <ExampleCard key={r.id} r={r} kartlar={kartlar} />
        ))}
        {!oneriler.length && <Card className="p-8 text-center text-sm text-muted-foreground">Bekleyen öneri yok.</Card>}
      </div>
      <h2 className="mt-8 text-sm font-bold">Onaylananlar ({onayli.length})</h2>
      <div className="mt-2 space-y-3">
        {onayli.map((r) => (
          <ExampleCard key={r.id} r={r} kartlar={kartlar} />
        ))}
        {!onayli.length && <Card className="p-8 text-center text-sm text-muted-foreground">Henüz onaylanan örnek yok.</Card>}
      </div>
    </div>
  );
}

function ExampleCard({ r, kartlar }: { r: Row; kartlar: { kod: string; ad: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [soru, setSoru] = useState(r.musteriMesaji);
  const [cevap, setCevap] = useState(r.dogruCevap);
  const [urun, setUrun] = useState(r.urunKodu ?? "");
  const [err, setErr] = useState<string | null>(null);
  const save = (v: Parameters<typeof waOrnekGuncelle>[1]) =>
    start(async () => {
      setErr(null);
      const res = await waOrnekGuncelle(r.id, { musteriMesaji: soru, dogruCevap: cevap, urunKodu: urun || null, ...v });
      if (!res.ok) return setErr(res.hata);
      router.refresh();
    });
  return (
    <Card className={cn("space-y-3 p-4", r.fiyat && r.durum === "oneri" && "ring-2 ring-warning/50")}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {r.durum === "onayli" ? <Badge tone={r.aktif ? "success" : "neutral"}>{r.aktif ? "Asistan kullanıyor" : "Pasif"}</Badge> : <Badge tone="warning">Öneri</Badge>}
        {r.fiyat && (
          <span className="inline-flex items-center gap-1 font-semibold text-warning">
            <AlertTriangle className="size-3.5" /> Fiyat / indirim içeriyor
          </span>
        )}
        <span className="text-muted-foreground">{formatDate(r.tarih, { day: "numeric", month: "short", year: "numeric" })}</span>
        {r.onaylayan && <span className="text-muted-foreground">· {r.onaylayan}</span>}
        {r.sohbetId && (
          <Link href={`/panel/whatsapp?s=${r.sohbetId}`} className="ml-auto inline-flex items-center gap-1 font-semibold text-primary hover:underline">
            <MessageCircle className="size-3.5" /> Sohbet
          </Link>
        )}
      </div>
      <label className="block">
        <span className="text-xs font-semibold text-muted-foreground">Müşteri sorusu</span>
        <textarea rows={2} value={soru} onChange={(e) => setSoru(e.target.value)} className={cn(areaCls, "mt-1")} />
      </label>
      <label className="block">
        <span className="text-xs font-semibold text-muted-foreground">Doğru cevap</span>
        <textarea rows={3} value={cevap} onChange={(e) => setCevap(e.target.value)} className={cn(areaCls, "mt-1")} />
      </label>
      <label className="flex items-center gap-2 text-xs">
        Ürün
        <select value={urun} onChange={(e) => setUrun(e.target.value)} className="h-8 rounded-lg border border-input bg-card px-2">
          <option value="">Genel</option>
          {kartlar.map((k) => (
            <option key={k.kod} value={k.kod}>
              {k.ad}
            </option>
          ))}
        </select>
      </label>
      {err && <p className="text-xs text-danger">{err}</p>}
      <div className="flex flex-wrap gap-2">
        {r.durum === "oneri" ? (
          <>
            <Button size="sm" disabled={pending} onClick={() => save({ durum: "onayli" })}>
              <Check /> Onayla
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => save({ durum: "reddedildi" })}>
              <X /> Reddet
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => save({})}>
              Kaydet
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => save({ aktif: !r.aktif })}>
              {r.aktif ? "Pasifleştir" : "Yeniden kullan"}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
