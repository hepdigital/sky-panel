"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellOff, BellRing, Download, Laptop, Smartphone, Trash2 } from "lucide-react";
import { cihazKaldir, denemeGonder, tercihKaydet } from "@/app/panel/bildirimler/actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { InstallSteps } from "./app-banner";
import { useApp } from "./use-app";

type TypeRow = { tur: string; ad: string; aciklama: string; acik: boolean };
type Device = { id: number; cihaz: string; olusturma: string; sonGonderim: string | null };

const date = (iso: string) => new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Bildirimler ve uygulama: bu cihazda aç/kapat, deneme, tür tercihleri, bildirim açık cihazlar */
export function NotificationSettings({ types, devices }: { types: TypeRow[]; devices: Device[] }) {
  const router = useRouter();
  const { platform, state, busy, canInstall, enable, disable, install } = useApp();
  const [prefs, setPrefs] = useState(() => Object.fromEntries(types.map((t) => [t.tur, t.acik])));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (tur: string, acik: boolean) => {
    setPrefs((p) => ({ ...p, [tur]: acik }));
    start(async () => {
      const r = await tercihKaydet(tur, acik);
      if (!r.ok) setPrefs((p) => ({ ...p, [tur]: !acik }));
    });
  };

  const test = () =>
    start(async () => {
      const r = await denemeGonder();
      setMsg(r.sayi ? `Deneme bildirimi ${r.sayi} cihaza gönderildi.` : "Bildirim açık cihaz yok. Önce bu cihazda bildirimleri açın.");
      router.refresh();
    });

  const on = async () => {
    await enable();
    router.refresh();
  };
  const off = async () => {
    await disable();
    router.refresh();
  };

  const needsInstall = !!platform && !platform.standalone && (platform.ios || (platform.mobile && state !== "acik"));

  return (
    <div className="mx-auto max-w-[760px] space-y-5">
      <div className="pt-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Bildirimler</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paneli telefonunuza uygulama olarak yükleyin (mağazaya gerek yok); siparişler, talepler ve WhatsApp mesajları bildirim olarak gelsin.
        </p>
      </div>

      <Card>
        <CardHeader title="Bu cihaz" description={platform ? statusText(state, platform.ios && !platform.standalone) : "Kontrol ediliyor…"} />
        <div className="space-y-4 p-5">
          {needsInstall && (
            <div className="rounded-xl border border-border p-4">
              <p className="mb-3 text-sm font-semibold">Önce uygulamayı yükleyin</p>
              {canInstall ? (
                <Button onClick={install}>
                  <Download /> Uygulamayı yükle
                </Button>
              ) : (
                <InstallSteps ios={platform!.ios} />
              )}
            </div>
          )}
          {platform && !platform.mobile && canInstall && !platform.standalone && (
            <Button variant="outline" onClick={install}>
              <Download /> Bilgisayara uygulama olarak yükle
            </Button>
          )}
          <div className="flex flex-wrap gap-2">
            {state === "acik" ? (
              <Button variant="outline" onClick={off} disabled={busy}>
                <BellOff /> Bu cihazda kapat
              </Button>
            ) : (
              <Button onClick={on} disabled={busy || state === "desteklenmiyor" || state === "engellendi" || state === "yukleniyor"}>
                <BellRing /> Bildirimleri aç
              </Button>
            )}
            <Button variant="outline" onClick={test} disabled={pending || !devices.length}>
              Deneme bildirimi gönder
            </Button>
          </div>
          {state === "engellendi" && (
            <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
              Bildirim izni bu cihazda engellenmiş. Tarayıcının site ayarlarından (adres çubuğundaki kilit simgesi) ya da telefonun Ayarlar &gt; Bildirimler bölümünden izin verin.
            </p>
          )}
          {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Hangi bildirimler gelsin?" description="Seçimleriniz tüm cihazlarınızda geçerlidir." />
        <div className="divide-y divide-border px-5 pb-2">
          {types.map((t) => (
            <label key={t.tur} className="flex cursor-pointer items-center justify-between gap-4 py-3.5">
              <span>
                <span className="block text-sm font-semibold">{t.ad}</span>
                <span className="block text-xs text-muted-foreground">{t.aciklama}</span>
              </span>
              <Switch checked={!!prefs[t.tur]} onChange={(v) => toggle(t.tur, v)} />
            </label>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Bildirim açık cihazlarınız" description="Çıkış yapılan cihaza bildirim gitmez." />
        <div className="p-5 pt-3">
          {devices.length ? (
            <ul className="divide-y divide-border">
              {devices.map((d) => {
                const Icon = /iPhone|iPad|Android/.test(d.cihaz) ? Smartphone : Laptop;
                return (
                  <li key={d.id} className="flex items-center gap-3 py-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted">
                      <Icon className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{d.cihaz}</span>
                      <span className="block text-xs text-muted-foreground">
                        Eklendi {date(d.olusturma)}
                        {d.sonGonderim && ` · son bildirim ${date(d.sonGonderim)}`}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => start(async () => void (await cihazKaldir(d.id)))}
                      className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-danger"
                      aria-label="Cihazı kaldır"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Henüz bildirim açılmış cihaz yok.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function statusText(state: string, iosBrowser: boolean) {
  if (iosBrowser) return "iPhone'da bildirimler için uygulamayı ana ekrana ekleyip oradan açın.";
  switch (state) {
    case "acik":
      return "Bildirimler açık.";
    case "engellendi":
      return "Bildirim izni engellenmiş.";
    case "desteklenmiyor":
      return "Bu tarayıcı bildirimleri desteklemiyor.";
    case "yukleniyor":
      return "Kontrol ediliyor…";
    default:
      return "Bildirimler kapalı.";
  }
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <span className="relative inline-flex shrink-0">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="h-6 w-11 rounded-full bg-input transition-colors peer-checked:bg-success peer-focus-visible:ring-2 peer-focus-visible:ring-ring" />
      <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
    </span>
  );
}
