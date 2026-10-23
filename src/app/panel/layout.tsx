import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireMe } from "@/server/auth";
import { openTaskCount } from "@/server/tasks";

export const metadata: Metadata = { title: { default: "Yönetim", template: "%s · Sky Yönetim" } };

/** Panel yalnızca giriş yapmış personele açıktır; rol ve görünürlük oturumdaki kullanıcıdan gelir */
async function Guard({ children }: { children: React.ReactNode }) {
  const me = await requireMe();
  return (
    <AdminShell me={{ id: me.id, adSoyad: me.adSoyad, kullaniciAdi: me.kullaniciAdi, rol: me.rol, openTasks: await openTaskCount(me) }}>{children}</AdminShell>
  );
}

export default function PanelLayout({ children }: LayoutProps<"/panel">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <Guard>{children}</Guard>
    </Suspense>
  );
}
