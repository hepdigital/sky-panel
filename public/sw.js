/* Sky Yönetim uygulaması: yalnızca bildirimler. Sayfalar önbelleğe alınmaz (panel her zaman canlı veriyle açılır). */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** Sunucudan gelen bildirim: { title, body, url, tag } */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Sky Yönetim";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/app/icon-192.png",
      badge: "/app/badge-96.png",
      tag: data.tag || undefined,
      renotify: !!data.tag,
      timestamp: Date.now(),
      data: { url: data.url || "/panel" },
    }),
  );
});

/** Bildirime dokununca: açık panel penceresi varsa o adrese gider, yoksa yeni pencere açılır */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/panel", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const win = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (win) {
        await win.focus();
        if ("navigate" in win) return win.navigate(url).catch(() => self.clients.openWindow(url));
        return;
      }
      return self.clients.openWindow(url);
    })(),
  );
});

/** Tarayıcı aboneliği yenilediğinde (anahtar değişimi vb.) yenisi sunucuya kaydedilir */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const sub = event.newSubscription || (await self.registration.pushManager.subscribe(event.oldSubscription.options));
      await fetch("/api/bildirim/abonelik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ abonelik: sub.toJSON(), eski: event.oldSubscription ? event.oldSubscription.endpoint : null }),
      });
    })(),
  );
});
