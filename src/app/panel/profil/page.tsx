import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { PasswordForm } from "@/components/admin/password-form";
import { Card, CardHeader } from "@/components/ui/card";
import { requireMe } from "@/server/auth";

export const metadata: Metadata = { title: "Profilim" };

const ROL_AD = { yonetici: "Yönetici", satis: "Satışçı", personel: "Personel" } as const;

async function Profile() {
  await connection();
  const me = await requireMe();
  const rows = [
    ["Ad soyad", me.adSoyad],
    ["Kullanıcı adı", me.kullaniciAdi],
    ["Rol", ROL_AD[me.rol]],
    ["E-posta", me.eposta ?? "—"],
    ["Telefon", me.telefon ?? "—"],
  ];
  return (
    <div className="mx-auto max-w-[760px] space-y-5">
      <div className="pt-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Profilim</h1>
        <p className="mt-1 text-sm text-muted-foreground">Hesap bilgileriniz ve şifreniz. Bilgilerinizin değişmesi için yöneticinize başvurun.</p>
      </div>

      <Card>
        <CardHeader title="Hesap" />
        <dl className="grid gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="mt-0.5 font-medium break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <CardHeader title="Şifre değiştir" description="Şifre değişince diğer cihazlardaki oturumlarınız kapanır; bu cihazda açık kalırsınız." />
        <div className="max-w-md p-5">
          <PasswordForm kullaniciAdi={me.kullaniciAdi} />
        </div>
      </Card>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[760px] animate-pulse rounded-2xl bg-muted" />}>
      <Profile />
    </Suspense>
  );
}
