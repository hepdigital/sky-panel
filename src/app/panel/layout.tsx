import { Suspense } from "react";
import type { Metadata } from "next";
import { after } from "next/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { appMetadata } from "@/lib/app-meta";
import { canSell, requireMe } from "@/server/auth";
import { newRequestCount } from "@/server/site-requests";
import { newWaRequestCount } from "@/server/whatsapp/requests";
import { openTaskCount, runTaskSchedule } from "@/server/tasks";
import { waEnabled } from "@/server/whatsapp/config";
import { unreadChatCount } from "@/server/whatsapp/store";

export const metadata: Metadata = { title: { default: "SKY Panel", template: "%s · SKY Panel" }, ...appMetadata };

/** Panel yalnızca giriş yapmış personele açıktır; rol ve görünürlük oturumdaki kullanıcıdan gelir */
async function Guard({ children }: { children: React.ReactNode }) {
  const me = await requireMe();
  // Tekrarlayan görevler ve son gün hatırlatmaları: zamanlayıcı yoksa da panel açıldıkça yürür (5 dakikada bir)
  after(() => runTaskSchedule().catch((e) => console.error("runTaskSchedule", e)));
  return (
    <AdminShell
      me={{
        id: me.id, adSoyad: me.adSoyad, kullaniciAdi: me.kullaniciAdi, rol: me.rol, openTasks: await openTaskCount(me), newRequests: canSell(me) ? (await newRequestCount(me)) + (await newWaRequestCount()) : 0,
        whatsapp: canSell(me) && waEnabled() ? await unreadChatCount() : null,
      }}
    >
      {children}
    </AdminShell>
  );
}

export default function PanelLayout({ children }: LayoutProps<"/panel">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <Guard>{children}</Guard>
    </Suspense>
  );
}
