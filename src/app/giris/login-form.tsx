"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Building2, Eye, EyeOff, Lock, Mail, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { girisYap } from "./actions";

type Mode = "bayi" | "personel";

/** Personel girişi gerçek hesaplarla; bayi/müşteri portalı henüz açılmadı (sekme bilgi notu gösterir) */
export function LoginForm() {
  const [mode, setMode] = useState<Mode>("personel");
  const [showPassword, setShowPassword] = useState(false);
  const [state, action, pending] = useActionState(girisYap, undefined);

  return (
    <form action={action} className="space-y-5">
      {/* Giriş türü */}
      <div className="grid grid-cols-2 rounded-full bg-muted p-1" role="tablist">
        {(
          [
            { key: "bayi", label: "Bayi / Müşteri", icon: Building2 },
            { key: "personel", label: "Personel", icon: UserRound },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={cn(
              "flex h-10 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-all",
              mode === key ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {mode === "bayi" ? (
        <p className="rounded-xl bg-info-soft px-4 py-3 text-sm font-medium text-info">
          Bayi ve müşteri portalı yakında açılacak. Teklifleriniz size WhatsApp ya da e-posta ile link olarak iletilir.
        </p>
      ) : (
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
      )}
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
