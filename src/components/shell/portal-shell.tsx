"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Phone, Plus, Search } from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationCenter } from "@/components/notification-center";
import { portalNotifications } from "@/lib/notifications";
import { buttonVariants } from "@/components/ui/button";
import { currentCustomer } from "@/lib/mock";
import { cn } from "@/lib/utils";
import { CartProvider, useCart } from "@/components/portal/cart-context";
import { portalNav, portalTabs, type NavItem } from "./nav";

/** Kendi sabit aksiyon çubuğu olan ekranlar — mobilde alt menü gizlenir. */
const focusRoutes = ["/portal/siparis-ver", "/portal/cari/borc-ode", "/portal/cari/bakiye-yukle"];

function isActive(pathname: string, href: string) {
  return href === "/portal" ? pathname === href : pathname.startsWith(href);
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <ShellLayout>{children}</ShellLayout>
    </CartProvider>
  );
}

function ShellLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh">
      {/* ── Masaüstü / tablet yan menü ── */}
      <aside className="sticky top-0 hidden h-dvh shrink-0 p-3 md:block">
        <div className="flex h-full w-[72px] flex-col rounded-2xl bg-sidebar p-3 lg:w-60">
          <Link href="/portal" className="flex h-12 items-center justify-center px-1 lg:justify-start lg:px-3">
            <LogoMark className="h-8 lg:hidden" />
            <Logo variant="white" className="hidden h-6 lg:block" />
          </Link>

          <nav className="mt-6 flex flex-1 flex-col gap-1">
            {portalNav.map((item) => (
              <SidebarLink key={item.href} item={item} active={isActive(pathname, item.href)} />
            ))}
          </nav>

          {/* Satış temsilcisi kartı */}
          <div className="mt-4 hidden rounded-xl bg-white/[0.06] p-4 lg:block">
            <p className="text-[11px] font-medium text-sidebar-foreground">Satış temsilciniz</p>
            <p className="mt-1 text-sm font-semibold text-white">{currentCustomer.salesRep.name}</p>
            <a
              href={`tel:${currentCustomer.salesRep.phone.replace(/\s/g, "")}`}
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-brand-900 transition-colors hover:bg-brand-50"
            >
              <Phone className="size-3.5" /> Ara
            </a>
          </div>

          <Link
            href="/giris"
            className="mt-2 flex h-11 items-center justify-center gap-3 rounded-xl px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-hover hover:text-white lg:justify-start"
            title="Çıkış yap"
          >
            <LogOut className="size-[18px]" />
            <span className="hidden lg:inline">Çıkış yap</span>
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 px-4 pt-2 pb-28 md:px-6 md:pb-10 lg:px-8">{children}</main>
      </div>

      {!focusRoutes.includes(pathname) && <MobileTabBar pathname={pathname} />}
    </div>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={item.label}
      className={cn(
        "group relative flex h-11 items-center justify-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors lg:justify-start",
        active
          ? "bg-sidebar-active text-sidebar-active-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-hover hover:text-white",
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      <span className="hidden lg:inline">{item.label}</span>
      {item.badge && (
        <span
          className={cn(
            "absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full text-[10px] font-bold lg:static lg:ml-auto lg:size-5",
            active ? "bg-brand-700 text-white dark:bg-brand-950" : "bg-brand-400 text-white",
          )}
        >
          {item.badge}
        </span>
      )}
    </Link>
  );
}

function CartCount({ className }: { className?: string }) {
  const { count } = useCart();
  if (!count) return null;
  return (
    <span
      className={cn(
        "grid min-w-5 place-items-center rounded-full bg-brand-400 px-1 text-[10px] leading-5 font-bold text-white",
        className,
      )}
    >
      {count}
    </span>
  );
}

function Topbar() {
  return (
    <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 md:h-[76px] md:px-6 lg:px-8">
        {/* Mobil: logo + firma */}
        <Link href="/portal" className="flex min-w-0 items-center gap-2.5 md:hidden">
          <LogoMark className="h-8" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">{currentCustomer.firmName}</p>
            <p className="text-[11px] text-muted-foreground">Cari {currentCustomer.cariCode}</p>
          </div>
        </Link>

        {/* Masaüstü: arama */}
        <label className="hidden h-11 max-w-md flex-1 items-center gap-2.5 rounded-full border border-border bg-card px-4 text-sm text-muted-foreground shadow-card focus-within:ring-2 focus-within:ring-ring md:flex">
          <Search className="size-4 shrink-0" />
          <input
            placeholder="Ürün, sipariş veya fatura ara…"
            className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden whitespace-nowrap rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold lg:block">Ctrl K</kbd>
        </label>

        <div className="ml-auto flex items-center gap-1 md:gap-2">
          <Link href="/portal/siparis-ver" className={cn(buttonVariants({ size: "md" }), "hidden md:inline-flex")}>
            <Plus /> Sipariş Ver
            <CartCount className="-mr-1 bg-white text-brand-900 dark:bg-brand-950 dark:text-white" />
          </Link>
          <ThemeToggle />
          <NotificationCenter items={portalNotifications} settingsHref="/portal/ayarlar" />
          <button
            type="button"
            className="flex items-center gap-2.5 rounded-full p-1 transition-colors hover:bg-muted md:border md:border-border md:bg-card md:pr-3 md:shadow-card"
          >
            <span className="grid size-8 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary-soft-foreground">
              {currentCustomer.initials}
            </span>
            <span className="hidden text-left leading-tight lg:block">
              <span className="block text-sm font-semibold">{currentCustomer.contactName}</span>
              <span className="block max-w-40 truncate text-[11px] text-muted-foreground">{currentCustomer.firmName}</span>
            </span>
            <ChevronDown className="hidden size-4 text-muted-foreground md:block" />
          </button>
        </div>
      </div>
    </header>
  );
}

function MobileTabBar({ pathname }: { pathname: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-safe backdrop-blur-md md:hidden">
      <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
        {portalTabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(pathname, tab.href);
          if (tab.primary) {
            return (
              <Link key={tab.href} href={tab.href} className="flex flex-col items-center gap-1" aria-label={tab.label}>
                <span className="relative -mt-7 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-pop ring-4 ring-background">
                  <Icon className="size-6" />
                  <CartCount className="absolute -top-1 -right-1 ring-2 ring-background" />
                </span>
                <span className="text-[10px] font-semibold text-foreground">{tab.label}</span>
              </Link>
            );
          }
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-1 py-1 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", active && "bg-primary-soft")}>
                <Icon className="size-5" />
              </span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
