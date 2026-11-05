import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { LogOut } from "lucide-react";
import { cikisYap } from "@/app/giris/actions";
import { PasswordForm } from "@/components/admin/password-form";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { appMetadata } from "@/lib/app-meta";
import { requireMe } from "@/server/auth";

export const metadata: Metadata = { title: "Yeni şifre", ...appMetadata };

/** Geçici şifreyle (yeni hesap ya da yöneticinin sıfırlaması) girildi: panele geçmeden kendi şifresini belirler */
async function SetPassword() {
  await connection();
  const me = await requireMe();
  if (!me.sifreDegismeli) redirect("/panel");
  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight">Yeni şifrenizi belirleyin</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Merhaba {me.adSoyad}, geçici şifreyle giriş yaptınız. Devam etmek için yalnızca sizin bileceğiniz bir şifre belirleyin.
      </p>
      <div className="mt-8">
        <PasswordForm kullaniciAdi={me.kullaniciAdi} ilk />
      </div>
      <form action={cikisYap} className="mt-6 text-center">
        <button type="submit" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <LogOut className="size-3.5" /> Çıkış yap
        </button>
      </form>
    </>
  );
}

export default function SetPasswordPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex items-center justify-between p-5 md:p-8">
        <Logo className="h-7" />
        <ThemeToggle />
      </div>
      <main className="flex flex-1 items-start justify-center px-5 pt-6 pb-10 sm:items-center sm:pt-0">
        <div className="w-full max-w-[400px]">
          <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" />}>
            <SetPassword />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
