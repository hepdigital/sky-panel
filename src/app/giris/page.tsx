import type { Metadata } from "next";
import { FileText, ListChecks, PackageCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Giriş" };

const highlights = [
  { icon: FileText, title: "Teklif", text: "Gazeboyu 3D kurun, ürün ekleyin; PDF ve müşteri linki tek tıkla." },
  { icon: PackageCheck, title: "Sipariş takibi", text: "Onaylanan teklif siparişe döner; üretimden teslimata izleyin." },
  { icon: ListChecks, title: "Görevler", text: "Ekibe görev atayın, durumunu ve yorumlarını takip edin." },
];

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh">
      {/* ── Marka paneli (masaüstü) ── */}
      <aside className="relative hidden w-[46%] max-w-[640px] overflow-hidden bg-sidebar p-10 text-white lg:flex lg:flex-col xl:p-14">
        <div aria-hidden className="pointer-events-none absolute -top-40 -left-32 size-[520px] rounded-full bg-brand-600/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-40 -bottom-40 size-[460px] rounded-full bg-brand-400/20 blur-3xl" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
        />

        <div className="relative">
          <Logo variant="white" className="h-8" />
        </div>

        <div className="relative mt-auto">
          <p className="text-xs font-semibold tracking-[0.2em] text-brand-300 uppercase">Personel Paneli</p>
          <h1 className="mt-4 text-4xl leading-[1.15] font-bold tracking-tight xl:text-[44px]">
            Tekliften teslimata,
            <br />
            tüm işleriniz tek panelde.
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/65">
            Satış ekibinin teklifleri, müşterileri, siparişleri ve görevleri tek yerde.
          </p>

          <ul className="mt-10 space-y-4">
            {highlights.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/[0.08] ring-1 ring-white/10">
                  <Icon className="size-5 text-brand-200" />
                </span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-white/60">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-12 text-xs text-white/40">© 2026 Sky Görsel Çözümler</p>
      </aside>

      {/* ── Form ── */}
      <main className="relative flex flex-1 flex-col">
        <div className="flex items-center justify-between p-5 md:p-8">
          <span className="lg:hidden">
            <Logo className="h-7" />
          </span>
          <ThemeToggle className="ml-auto" />
        </div>

        <div className="flex flex-1 items-start justify-center px-5 pt-6 pb-10 sm:items-center sm:pt-0">
          <div className="w-full max-w-[400px]">
            <h2 className="text-[28px] font-bold tracking-tight">Hoş geldiniz</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">Devam etmek için hesabınıza giriş yapın.</p>
            <div className="mt-8">
              <LoginForm />
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
