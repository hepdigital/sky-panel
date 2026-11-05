"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { storeCredential } from "@/app/giris/login-form";
import { sifreDegistir, type PasswordState } from "@/app/panel/profil/actions";
import { Button } from "@/components/ui/button";

/**
 * Şifre değiştirme formu. ilk: geçici şifreyle girildi (mevcut şifre sorulmaz, başarıda panele geçer); değilse profilde
 * mevcut şifreyle değiştirilir. Başarıda tarayıcıya yeni şifreyi kaydetmesi önerilir.
 */
export function PasswordForm({ kullaniciAdi, ilk = false }: { kullaniciAdi: string; ilk?: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [show, setShow] = useState(false);
  const [state, action, pending] = useActionState(async (prev: PasswordState, form: FormData) => {
    const r = await sifreDegistir(prev, form);
    if (r?.ok) {
      await storeCredential(kullaniciAdi, String(form.get("yeni") ?? ""));
      if (ilk) router.replace("/panel");
      else formRef.current?.reset();
    }
    return r;
  }, undefined);

  const type = show ? "text" : "password";
  return (
    <form ref={formRef} action={action} className="space-y-4">
      {/* Şifre yöneticileri hangi hesabın şifresinin değiştiğini buradan anlar */}
      <input type="text" name="kullanici" autoComplete="username" value={kullaniciAdi} readOnly hidden />
      {!ilk && <Field label="Mevcut şifre" name="mevcut" type={type} autoComplete="current-password" />}
      <Field label="Yeni şifre" name="yeni" type={type} autoComplete="new-password" hint="En az 8 karakter; en az bir harf ve bir rakam." />
      <Field label="Yeni şifre (tekrar)" name="tekrar" type={type} autoComplete="new-password" />
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="size-4 accent-primary" />
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />} Şifreleri göster
      </label>

      {state?.hata && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{state.hata}</p>}
      {state?.ok && !ilk && (
        <p className="rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success">Şifreniz değişti. Diğer cihazlardaki oturumlarınız kapatıldı.</p>
      )}

      <Button type="submit" size={ilk ? "lg" : "md"} className={ilk ? "w-full" : undefined} disabled={pending || (ilk && !!state?.ok)}>
        {pending || (ilk && state?.ok) ? "Kaydediliyor…" : ilk ? "Şifremi belirle ve devam et" : "Şifreyi değiştir"}
      </Button>
    </form>
  );
}

function Field({ label, hint, ...input }: { label: string; hint?: string; name: string; type: string; autoComplete: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input
        {...input}
        required
        maxLength={128}
        className="h-11 w-full rounded-xl border border-input bg-card px-4 text-[15px] outline-none transition-shadow focus:border-primary focus:ring-4 focus:ring-primary/15"
      />
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
