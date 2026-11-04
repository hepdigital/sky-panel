"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, Download, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useApp } from "./use-app";

const HIDE_KEY = "sky-uygulama-gizle";
const HIDE_DAYS = 7;

function hiddenUntil() {
  try {
    return Number(localStorage.getItem(HIDE_KEY) ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Panelin üstünde: uygulama yüklü değilse "Uygulamayı yükle", yüklüyse ve bildirim izni sorulmamışsa "Bildirimleri aç".
 * Kapatılırsa bir hafta görünmez (ayar ekranından her zaman yapılabilir).
 */
export function AppBanner() {
  const { platform, state, busy, canInstall, enable, install } = useApp();
  const [hidden, setHidden] = useState(true);
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setHidden(hiddenUntil() > Date.now()));
  }, []);

  if (!platform || hidden) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_DAYS * 86_400_000));
    } catch {}
    setHidden(true);
  };

  // Yüklü değil: telefonda her zaman, bilgisayarda tarayıcı yüklemeyi öneriyorsa
  const showInstall = !platform.standalone && (platform.mobile || canInstall);
  const showPush = !showInstall && state === "kapali";
  if (!showInstall && !showPush) return null;

  return (
    <>
      <div className="mx-auto mb-4 flex max-w-[1100px] items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-card md:p-4">
        <span data-panel="admin" className="grid size-10 shrink-0 place-items-center rounded-xl bg-sidebar text-white">
          {showInstall ? <Download className="size-5" /> : <BellRing className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{showInstall ? "Sky Yönetim uygulamasını yükleyin" : "Bildirimleri açın"}</p>
          <p className="text-xs text-muted-foreground">
            {showInstall
              ? "Ana ekranda simgesiyle açılır; yeni sipariş, talep ve WhatsApp mesajları bildirim olarak gelir."
              : "Yeni sipariş, talep ve WhatsApp mesajları bu cihaza anında gelsin."}
          </p>
        </div>
        {showInstall ? (
          <Button size="sm" onClick={() => (canInstall ? install() : setGuide(true))}>
            {canInstall ? "Yükle" : "Nasıl?"}
          </Button>
        ) : (
          <Button size="sm" onClick={enable} disabled={busy}>
            Aç
          </Button>
        )}
        <button type="button" onClick={dismiss} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Kapat">
          <X className="size-4" />
        </button>
      </div>
      <Sheet open={guide} onClose={() => setGuide(false)} title="Uygulamayı yükleyin">
        <InstallSteps ios={platform.ios} />
        <Link href="/panel/bildirimler" onClick={() => setGuide(false)} className="mt-4 block text-center text-xs font-medium text-primary">
          Bildirim ayarları
        </Link>
      </Sheet>
    </>
  );
}

/** Mağazasız yükleme adımları: iPhone'da Paylaş → Ana Ekrana Ekle; Android'de tarayıcı menüsü */
export function InstallSteps({ ios }: { ios: boolean }) {
  const steps = ios
    ? [
        { icon: Share, text: "Safari'de alttaki Paylaş düğmesine dokunun (Chrome'da adres çubuğunun sağında)." },
        { icon: SquarePlus, text: "Listeyi kaydırıp “Ana Ekrana Ekle”yi seçin, sağ üstte “Ekle”ye dokunun." },
        { icon: BellRing, text: "Ana ekrandaki Sky Yönetim simgesinden açın ve “Bildirimleri aç”a dokunun." },
      ]
    : [
        { icon: Download, text: "Tarayıcı menüsünü (⋮) açın." },
        { icon: SquarePlus, text: "“Uygulamayı yükle” ya da “Ana ekrana ekle”yi seçin." },
        { icon: BellRing, text: "Ana ekrandaki Sky Yönetim simgesinden açın ve “Bildirimleri aç”a dokunun." },
      ];
  return (
    <div>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted">
              <s.icon className="size-[18px]" />
            </span>
            <span className="pt-1.5 text-sm">
              <b className="mr-1">{i + 1}.</b>
              {s.text}
            </span>
          </li>
        ))}
      </ol>
      {ios && <p className="mt-4 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">iPhone’da bildirimler yalnızca ana ekrana eklenen uygulamada çalışır (iOS 16.4 ve üstü).</p>}
    </div>
  );
}
