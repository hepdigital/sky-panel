import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { NotificationSettings } from "@/components/app/notification-settings";
import { requireMe } from "@/server/auth";
import { getPrefs, listDevices, typesFor } from "@/server/push";

export const metadata: Metadata = { title: "Bildirimler" };

async function Settings() {
  await connection();
  const me = await requireMe();
  const [prefs, devices] = await Promise.all([getPrefs(me), listDevices(me)]);
  return (
    <NotificationSettings
      types={typesFor(me).map((t) => ({ tur: t.tur, ad: t.ad, aciklama: t.aciklama, acik: prefs[t.tur] }))}
      devices={devices.map((d) => ({ id: d.id, cihaz: d.cihaz ?? "Cihaz", olusturma: d.olusturma.toISOString(), sonGonderim: d.sonGonderim?.toISOString() ?? null }))}
    />
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[760px] animate-pulse rounded-2xl bg-muted" />}>
      <Settings />
    </Suspense>
  );
}
