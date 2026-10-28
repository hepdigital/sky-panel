"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, MapPin, MessageCircle, Phone, RefreshCw } from "lucide-react";
import { talepGuncelle, talepleriYenile } from "@/app/panel/talepler/actions";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";

export type RequestRow = {
  id: number;
  tur: string;
  turAd: string;
  ad: string;
  firma: string | null;
  eposta: string;
  telefon: string;
  il: string | null;
  mesaj: string;
  tarih: string;
  durum: string;
  not: string | null;
  site: string;
  marka: string | null;
  markaRenk: string | null;
  ilgilenen: string | null;
};

const DURUMLAR: { key: string; label: string; tone: BadgeTone }[] = [
  { key: "yeni", label: "Yeni", tone: "danger" },
  { key: "arandi", label: "Arandı", tone: "info" },
  { key: "teklif", label: "Teklif verildi", tone: "warning" },
  { key: "kazanildi", label: "Satışa döndü", tone: "success" },
  { key: "kaybedildi", label: "Olumsuz", tone: "neutral" },
];
const durumOf = (key: string) => DURUMLAR.find((d) => d.key === key) ?? DURUMLAR[0];
const TUR_TONE: Record<string, BadgeTone> = { toptan: "warning", bayilik: "info", iletisim: "neutral" };

/** 05xx… / +90… → WhatsApp numarası (90…) */
const waNumber = (tel: string) => {
  const d = tel.replace(/\D/g, "");
  return d.startsWith("90") ? d : d.startsWith("0") ? `9${d}` : `90${d}`;
};

/** Site talepleri: toptan alım, bayilik ve iletişim formları; satış ekibi durum ve notla takip eder */
export function RequestBoard({ rows, tumu }: { rows: RequestRow[]; tumu: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tur, setTur] = useState<string>("");
  const turler = [...new Map(rows.map((r) => [r.tur, r.turAd])).entries()];
  const list = tur ? rows.filter((r) => r.tur === tur) : rows;

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Talepler</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sitelerdeki formlardan gelenler (toptan alım, bayilik, iletişim). Arayın, durumunu ve notunu işleyin.</p>
        </div>
        <Button variant="outline" disabled={pending} onClick={() => start(async () => (await talepleriYenile(), router.refresh()))}>
          <RefreshCw className={cn(pending && "animate-spin")} /> Yenile
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link href="/panel/talepler" className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", !tumu ? "bg-foreground text-background" : "bg-muted")}>
          Açık talepler
        </Link>
        <Link href="/panel/talepler?tumu=1" className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", tumu ? "bg-foreground text-background" : "bg-muted")}>
          Tümü
        </Link>
        {turler.length > 1 && (
          <>
            <span className="mx-1 h-5 w-px bg-border" />
            <button type="button" onClick={() => setTur("")} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", !tur ? "bg-primary text-primary-foreground" : "bg-muted")}>
              Hepsi
            </button>
            {turler.map(([k, ad]) => (
              <button key={k} type="button" onClick={() => setTur(k)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", tur === k ? "bg-primary text-primary-foreground" : "bg-muted")}>
                {ad}
              </button>
            ))}
          </>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {list.map((r) => (
          <RequestCard key={r.id} r={r} />
        ))}
        {!list.length && <Card className="p-10 text-center text-sm text-muted-foreground">{tumu ? "Henüz talep yok." : "Açık talep yok."}</Card>}
      </div>
    </div>
  );
}

function RequestCard({ r }: { r: RequestRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [not, setNot] = useState(r.not ?? "");
  const [hata, setHata] = useState<string | null>(null);
  const durum = durumOf(r.durum);

  const save = (change: { durum?: string; not?: string }) =>
    start(async () => {
      const res = await talepGuncelle(r.id, change);
      setHata(res.ok ? null : res.hata);
      if (res.ok) router.refresh();
    });

  return (
    <Card className={cn("p-5", r.durum === "yeni" && "ring-2 ring-danger/30")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <Badge tone={TUR_TONE[r.tur] ?? "neutral"}>{r.turAd}</Badge>
            <Badge tone={durum.tone}>{durum.label}</Badge>
            {r.marka && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: r.markaRenk ?? "#888" }} /> {r.site}
              </span>
            )}
          </p>
          <p className="mt-2 text-[17px] font-semibold">
            {r.firma || r.ad}
            {r.firma && <span className="ml-2 text-sm font-normal text-muted-foreground">{r.ad}</span>}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a href={`tel:${r.telefon.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
              <Phone className="size-3.5" /> {r.telefon}
            </a>
            <a href={`https://wa.me/${waNumber(r.telefon)}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-success hover:underline">
              <MessageCircle className="size-3.5" /> WhatsApp
            </a>
            <a href={`mailto:${r.eposta}`} className="inline-flex items-center gap-1 text-muted-foreground hover:underline">
              <Mail className="size-3.5" /> {r.eposta}
            </a>
            {r.il && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <MapPin className="size-3.5" /> {r.il}
              </span>
            )}
          </p>
        </div>
        <p className="text-right text-xs text-muted-foreground">
          {formatDate(r.tarih, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          {r.ilgilenen && <span className="block">İlgilenen: {r.ilgilenen}</span>}
        </p>
      </div>

      {r.mesaj && <p className="mt-3 rounded-xl bg-muted/60 p-3 text-sm whitespace-pre-line">{r.mesaj}</p>}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {DURUMLAR.map((d) => (
          <button
            key={d.key}
            type="button"
            disabled={pending || d.key === r.durum}
            onClick={() => save({ durum: d.key })}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-default",
              d.key === r.durum ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-muted",
            )}
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <textarea
          value={not}
          onChange={(e) => setNot(e.target.value)}
          rows={1}
          placeholder="Not (ör. arandı, fiyat gönderildi, 2 hafta sonra tekrar aranacak)"
          className="min-h-10 flex-1 rounded-xl border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        />
        <Button variant="soft" disabled={pending || not === (r.not ?? "")} onClick={() => save({ not })}>
          Kaydet
        </Button>
      </div>
      {hata && <p className="mt-2 text-xs font-semibold text-danger">{hata}</p>}
    </Card>
  );
}
