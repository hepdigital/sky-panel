"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Trash2, Upload } from "lucide-react";
import { galeriAyarKaydet } from "@/app/panel/galeri/actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";

/** Galeri ayarları (yönetici): filigran görseli, saydamlık, boyut ve müşteriye gönderilen linkin başı */
export function GallerySettingsForm({ settings, preview }: { settings: { opaklik: number; boyut: number; siteUrl: string; filigran: boolean }; preview: string | null }) {
  const router = useRouter();
  const [v, setV] = useState(settings);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const save = (filigranKaldir = false) =>
    start(async () => {
      const r = await galeriAyarKaydet({ opaklik: v.opaklik, boyut: v.boyut, siteUrl: v.siteUrl, filigranKaldir });
      setMsg(r.ok ? { t: "Kaydedildi. Sitedeki fotoğraflar yeni ayarla üretilir.", ok: true } : { t: r.hata, ok: false });
      router.refresh();
    });

  const upload = (f: File) =>
    start(async () => {
      const fd = new FormData();
      fd.set("dosya", f);
      const r = (await (await fetch("/api/galeri/filigran", { method: "POST", body: fd })).json()) as { ok: boolean; hata?: string };
      setMsg(r.ok ? { t: "Filigran yüklendi.", ok: true } : { t: r.hata ?? "Yüklenemedi.", ok: false });
      router.refresh();
    });

  const range = "w-full accent-primary";
  return (
    <div className="mx-auto max-w-[760px] space-y-5">
      <div className="pt-1">
        <Link href="/panel/galeri" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-3.5" /> Galeri
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-[28px]">Galeri ayarları</h1>
        <p className="mt-1 text-sm text-muted-foreground">Filigran sitedeki tüm galeri fotoğraflarının ortasına basılır; orijinaller değişmez.</p>
      </div>

      {msg && <p className={msg.ok ? "rounded-xl bg-success-soft px-4 py-2.5 text-sm font-medium text-success" : "rounded-xl bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger"}>{msg.t}</p>}

      <Card>
        <CardHeader title="Filigran" description="Saydam arka planlı PNG logo önerilir (ör. beyaz SKY logosu)." />
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={pending}>
              <Upload /> {settings.filigran ? "Filigranı değiştir" : "Filigran yükle"}
            </Button>
            {settings.filigran && (
              <Button size="sm" variant="ghost" className="text-danger" disabled={pending} onClick={() => confirm("Filigran kaldırılsın mı? Fotoğraflar filigransız gösterilir.") && save(true)}>
                <Trash2 /> Kaldır
              </Button>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/webp,image/jpeg" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </div>
          <label className="block">
            <span className="mb-1 flex justify-between text-sm font-medium">Görünürlük <span className="text-muted-foreground">%{v.opaklik}</span></span>
            <input type="range" min={5} max={100} value={v.opaklik} onChange={(e) => setV({ ...v, opaklik: Number(e.target.value) })} className={range} />
          </label>
          <label className="block">
            <span className="mb-1 flex justify-between text-sm font-medium">Boyut (fotoğraf eninin) <span className="text-muted-foreground">%{v.boyut}</span></span>
            <input type="range" min={10} max={90} value={v.boyut} onChange={(e) => setV({ ...v, boyut: Number(e.target.value) })} className={range} />
          </label>
          {preview ? (
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Kaydedilmiş ayarla örnek (değişiklikler kaydedince görünür):</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Filigran önizleme" className="max-h-[420px] w-full rounded-xl bg-muted object-contain" />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Önizleme için galeriye en az bir fotoğraf yükleyin.</p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Galeri adresi" description="Müşteriye gönderilen linkler bununla başlar." />
        <div className="p-5">
          <input
            className="h-11 w-full rounded-xl border border-input bg-card px-3 text-[15px] outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            value={v.siteUrl}
            onChange={(e) => setV({ ...v, siteUrl: e.target.value })}
            inputMode="url"
          />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save()} disabled={pending}>Kaydet</Button>
      </div>
    </div>
  );
}
