"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, Check, Download, Settings, Share, Smartphone, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
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
          <p className="text-sm font-semibold">{showInstall ? "SKY Panel uygulamasını yükleyin" : "Bildirimleri açın"}</p>
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

const CARD_KEY = "sky-uygulama-panel-gizle";
const CARD_DAYS = 30;

/**
 * Dashboard kartı: 1) uygulamayı yükle, 2) bildirimleri aç. İkisi de tamamlanınca görünmez.
 * Bilgisayarda yükleme yalnızca tarayıcı öneriyorsa adım olarak çıkar.
 */
export function AppSetupCard() {
  const { platform, state, busy, canInstall, enable, install } = useApp();
  const [hidden, setHidden] = useState(true);
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        setHidden(Number(localStorage.getItem(CARD_KEY) ?? 0) > Date.now());
      } catch {
        setHidden(false);
      }
    });
  }, []);

  if (!platform || hidden || state === "yukleniyor") return null;
  const installStep = platform.standalone || platform.mobile || canInstall;
  const installed = platform.standalone;
  const pushDone = state === "acik";
  // Bilgisayarda bildirim desteklenmiyorsa yapılacak bir şey yok
  const pushPossible = state !== "desteklenmiyor" || (platform.ios && !installed);
  if ((!installStep || installed) && (pushDone || !pushPossible)) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(CARD_KEY, String(Date.now() + CARD_DAYS * 86_400_000));
    } catch {}
    setHidden(true);
  };

  const pushText =
    state === "acik"
      ? "Bu cihaza bildirim geliyor."
      : state === "engellendi"
        ? "Bildirim izni engellenmiş: tarayıcının site ayarlarından bu siteye izin verin."
        : state === "desteklenmiyor"
          ? "Önce uygulamayı yükleyin, ana ekrandaki simgeden açıp buradan bildirimleri açın."
          : "Yeni sipariş, ödeme, talep, WhatsApp mesajı ve görevler anında gelsin.";

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div data-panel="admin" className="flex items-start gap-3 bg-sidebar p-4 text-white md:items-center md:p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10">
            <Smartphone className="size-[22px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold md:text-lg">SKY Panel’i telefonunuza kurun</h2>
            <p className="text-sm text-white/75">Mağazaya gerek yok: panel uygulama olarak ana ekrana eklenir, işler bildirim olarak gelir.</p>
          </div>
          <button type="button" onClick={dismiss} className="grid size-8 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10" aria-label="Kapat">
            <X className="size-4" />
          </button>
        </div>
        <ol className="divide-y divide-border">
          {installStep && (
            <Step n={1} done={installed} title={installed ? "Uygulama yüklü" : "Uygulamayı yükleyin"} text={installed ? "Panel bu cihazda uygulama olarak açık." : platform.ios ? "Safari’de Paylaş → Ana Ekrana Ekle." : "Tek dokunuşla ana ekrana eklenir."}>
              {!installed && (
                <Button size="sm" onClick={() => (canInstall ? install() : setGuide(true))}>
                  {canInstall ? "Yükle" : "Nasıl?"}
                </Button>
              )}
            </Step>
          )}
          <Step n={installStep ? 2 : 1} done={pushDone} title={pushDone ? "Bildirimler açık" : "Bildirimleri açın"} text={pushText}>
            {state === "kapali" && (
              <Button size="sm" onClick={enable} disabled={busy}>
                Aç
              </Button>
            )}
            {(state === "engellendi" || pushDone) && (
              <Link href="/panel/bildirimler" className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-primary hover:bg-muted">
                <Settings className="size-3.5" /> Ayarlar
              </Link>
            )}
          </Step>
        </ol>
      </section>
      <Sheet open={guide} onClose={() => setGuide(false)} title="Uygulamayı yükleyin">
        <InstallSteps ios={platform.ios} />
      </Sheet>
    </>
  );
}

function Step({ n, done, title, text, children }: { n: number; done: boolean; title: string; text: string; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 md:px-5">
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold", done ? "bg-success text-white" : "bg-muted")}>{done ? <Check className="size-4" /> : n}</span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-semibold", done && "text-muted-foreground")}>{title}</p>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
      {children}
    </li>
  );
}

/** Mağazasız yükleme adımları: iPhone'da Paylaş → Ana Ekrana Ekle; Android'de tarayıcı menüsü */
export function InstallSteps({ ios }: { ios: boolean }) {
  const steps = ios
    ? [
        { icon: Share, text: "Safari'de alttaki Paylaş düğmesine dokunun (Chrome'da adres çubuğunun sağında)." },
        { icon: SquarePlus, text: "Listeyi kaydırıp “Ana Ekrana Ekle”yi seçin, sağ üstte “Ekle”ye dokunun." },
        { icon: BellRing, text: "Ana ekrandaki SKY Panel simgesinden açın ve “Bildirimleri aç”a dokunun." },
      ]
    : [
        { icon: Download, text: "Tarayıcı menüsünü (⋮) açın." },
        { icon: SquarePlus, text: "“Uygulamayı yükle” ya da “Ana ekrana ekle”yi seçin." },
        { icon: BellRing, text: "Ana ekrandaki SKY Panel simgesinden açın ve “Bildirimleri aç”a dokunun." },
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
