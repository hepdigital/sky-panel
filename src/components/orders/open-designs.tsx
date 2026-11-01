"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Phone, ShoppingCart } from "lucide-react";
import { talepGuncelle } from "@/app/panel/talepler/actions";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { BrandTag } from "@/components/brand/brand-filter";
import { cn, formatDate } from "@/lib/utils";

/** Konfigüratörde ödemeye geçerken telefon bırakıp siparişi tamamlanmamış tasarım (site_talepleri, tür "konfigurator") */
export type OpenDesign = {
  id: number;
  telefon: string;
  ad: string;
  mesaj: string;
  durum: string;
  not: string | null;
  tarih: string;
  marka: string | null;
  markaRenk: string | null;
};

const DURUMLAR: { key: string; label: string; tone: BadgeTone }[] = [
  { key: "yeni", label: "Aranmadı", tone: "danger" },
  { key: "arandi", label: "Arandı", tone: "info" },
  { key: "teklif", label: "Teklif verildi", tone: "warning" },
  { key: "kazanildi", label: "Satışa döndü", tone: "success" },
  { key: "kaybedildi", label: "Olumsuz", tone: "neutral" },
];

/** Talep metninden: ilk satır (ölçü, adet), toplam, görsel ve ayrıntı satırları */
function parse(mesaj: string) {
  const lines = mesaj.split("\n");
  const gorsel = mesaj.match(/^Görsel: (https?:\/\/\S+\.webp)$/m)?.[1] ?? null;
  const toplam = mesaj.match(/^Toplam \(KDV dahil\): (.+)$/m)?.[1] ?? null;
  const detay = lines.slice(1).filter((l) => l.trim() && !/^(Görsel|Toplam \(KDV dahil\)):/.test(l));
  return { baslik: lines[0] ?? "", toplam, gorsel, detay };
}

export function OpenDesigns({ rows, showBrand }: { rows: OpenDesign[]; showBrand: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Card className="mt-4 overflow-hidden border-warning/40">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-warning/10 px-4 py-3 md:px-5">
        <ShoppingCart className="size-4 text-warning" />
        <p className="text-sm font-bold">Ödemesi tamamlanmamış tasarımlar ({rows.length})</p>
        <p className="text-xs text-muted-foreground">Konfigüratörde ödemeye geçerken telefon bırakan, siparişi gelmemiş müşteriler · aranınca durumunu işaretleyin</p>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <Row key={r.id} r={r} showBrand={showBrand} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
        ))}
      </ul>
    </Card>
  );
}

function Row({ r, showBrand, open, onToggle }: { r: OpenDesign; showBrand: boolean; open: boolean; onToggle: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const m = parse(r.mesaj);
  const durum = DURUMLAR.find((d) => d.key === r.durum) ?? DURUMLAR[0];
  const set = (key: string) =>
    start(async () => {
      setErr(null);
      const x = await talepGuncelle(r.id, { durum: key });
      if (!x.ok) setErr(x.hata);
      router.refresh();
    });
  return (
    <li className="px-4 py-3 md:px-5">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        {m.gorsel ? (
          // eslint-disable-next-line @next/next/no-img-element -- panelin kendi dosyası, boyutu sabit
          <img src={m.gorsel} alt="" className="h-12 w-16 rounded-md bg-white object-contain ring-1 ring-border" />
        ) : (
          <span className="h-12 w-16 rounded-md bg-muted" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{m.baslik}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <a href={`tel:${r.telefon.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
              <Phone className="size-3" /> {r.telefon}
            </a>
            {r.ad !== "Konfigüratör ziyaretçisi" && <span>{r.ad}</span>}
            {showBrand && <BrandTag ad={r.marka} renk={r.markaRenk} />}
            <span>{formatDate(r.tarih, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          </p>
        </div>
        <div className="text-right">
          {m.toplam && <p className="tabular text-sm font-bold">{m.toplam}</p>}
          <Badge tone={durum.tone}>{durum.label}</Badge>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {DURUMLAR.filter((d) => d.key !== "yeni" && d.key !== r.durum).map((d) => (
          <button
            key={d.key}
            type="button"
            disabled={pending}
            onClick={() => set(d.key)}
            className="h-7 rounded-full border border-border px-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
          >
            {d.label}
          </button>
        ))}
        <button type="button" onClick={onToggle} className="inline-flex h-7 items-center gap-1 px-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
          Tasarım <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </button>
        <Link href="/panel/talepler" className="text-xs font-semibold text-primary hover:underline">
          Not ekle
        </Link>
        {err && <span className="text-xs text-danger">{err}</span>}
      </div>
      {r.not && <p className="mt-1.5 text-xs text-muted-foreground">Not: {r.not}</p>}
      {open && (
        <div className="mt-2 flex flex-col gap-3 rounded-xl bg-muted/60 p-3 sm:flex-row">
          {m.gorsel && (
            <a href={m.gorsel} target="_blank" rel="noopener" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- panelin kendi dosyası */}
              <img src={m.gorsel} alt="Tasarım" className="h-36 w-48 rounded-lg bg-white object-contain ring-1 ring-border" />
            </a>
          )}
          <p className="text-sm whitespace-pre-line">{m.detay.join("\n")}</p>
        </div>
      )}
    </li>
  );
}
