"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { girisYap } from "./actions";

/** Personel girişi (bayi/müşteri portalı açılınca buraya ikinci giriş türü eklenecek) */
export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [state, action, pending] = useActionState(girisYap, undefined);

  return (
    <form action={action} className="space-y-5">
        <>
          <Field label="Kullanıcı adı ya da e-posta" icon={Mail}>
            <input
              name="kullanici"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              required
              placeholder="ad.soyad"
              className="h-full w-full bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </Field>

          <Field
            label="Şifre"
            icon={Lock}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            }
          >
            <input
              name="sifre"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="h-full w-full bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </Field>

          {state?.hata && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{state.hata}</p>}

          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Giriş yapılıyor…" : "Giriş yap"} <ArrowRight />
          </Button>
          <p className="text-center text-xs text-muted-foreground">Şifrenizi unuttuysanız yöneticinize başvurun.</p>
        </>
    </form>
  );
}

function Field({
  label,
  icon: Icon,
  trailing,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <span className="flex h-12 items-center gap-3 rounded-xl border border-input bg-card px-4 text-[15px] transition-shadow focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
        <Icon className="size-[18px] shrink-0 text-muted-foreground" />
        {children}
        {trailing}
      </span>
    </label>
  );
}
