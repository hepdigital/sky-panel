"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

// Panelin uygulama olarak yüklenmesi ve bildirim aboneliği (tarayıcı tarafı). Sunucu: /api/bildirim/abonelik

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/* Android/Chrome yükleme önerisini sayfa açılır açılmaz verir: React yüklenmeden kaçmasın diye modül düzeyinde yakalanır */
let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}
const subscribeDeferred = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export type Platform = { ios: boolean; android: boolean; mobile: boolean; standalone: boolean; push: boolean };

function detect(): Platform {
  const ua = navigator.userAgent;
  // iPadOS kendini Mac olarak tanıtır: dokunmatik Mac yok
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const push = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return { ios, android, mobile: ios || android, standalone, push };
}

function keyBytes(base64: string) {
  const b = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => !!a && a.byteLength === b.byteLength && new Uint8Array(a).every((x, i) => x === b[i]);

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

/** Aboneliği (yoksa açar) sunucuya yazar; anahtar değiştiyse eski abonelik yenilenir */
async function syncSubscription(create: boolean) {
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const r = (await fetch("/api/bildirim/abonelik", { cache: "no-store" }).then((x) => x.json())) as { anahtar?: string };
  if (!r.anahtar) return null;
  const key = keyBytes(r.anahtar);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub && create) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  if (!sub) return null;
  await fetch("/api/bildirim/abonelik", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ abonelik: sub.toJSON() }) });
  return sub;
}

export type PushState = "yukleniyor" | "desteklenmiyor" | "kapali" | "acik" | "engellendi";

/**
 * Bu cihazın durumu: platform, yükleme önerisi, bildirim izni ve aboneliği.
 * İzin verilmişse açılışta abonelik sunucuya yeniden yazılır (çıkış/giriş sonrası ve hesap değişince cihaz doğru kişiye bağlanır).
 */
export function useApp() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [state, setState] = useState<PushState>("yukleniyor");
  const [busy, setBusy] = useState(false);
  const prompt = useSyncExternalStore(subscribeDeferred, () => deferred, () => null);

  useEffect(() => {
    const p = detect();
    let alive = true;
    // Platform bilgisi yalnızca tarayıcıda okunabilir: sunucu çıktısıyla uyuşmazlık olmasın diye ilk çizimden sonra
    queueMicrotask(() => alive && setPlatform(p));
    if (!p.push) {
      queueMicrotask(() => alive && setState("desteklenmiyor"));
      return () => {
        alive = false;
      };
    }
    (async () => {
      if (Notification.permission === "denied") return setState("engellendi");
      if (Notification.permission !== "granted") {
        await registration().catch(() => {});
        return setState("kapali");
      }
      const sub = await syncSubscription(true).catch(() => null);
      if (alive) setState(sub ? "acik" : "kapali");
    })();
    return () => {
      alive = false;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm === "denied") return setState("engellendi");
      if (perm !== "granted") return;
      setState((await syncSubscription(true)) ? "acik" : "kapali");
    } catch (e) {
      console.error("bildirim açılamadı", e);
      alert("Bildirimler açılamadı. Sayfayı yenileyip tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/bildirim/abonelik", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("kapali");
    } finally {
      setBusy(false);
    }
  }, []);

  /** Android/masaüstü: tarayıcının yükleme penceresi; iOS'ta yok (Paylaş → Ana Ekrana Ekle) */
  const install = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    emit();
    return outcome === "accepted";
  }, []);

  return { platform, state, busy, canInstall: !!prompt, enable, disable, install };
}
