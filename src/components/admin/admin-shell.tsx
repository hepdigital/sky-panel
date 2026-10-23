"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckSquare, ChevronDown, FilePlus2, FileText, LayoutDashboard, ListPlus, LogOut, Menu, Plus, UserPlus } from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { roles } from "@/lib/admin-mock";
import { cn } from "@/lib/utils";
import { navFor, type AdminNavItem } from "./nav";
import { cikisYap } from "@/app/giris/actions";
import { RoleProvider, useRole, type PanelUser } from "./role-context";

/** Kendi sabit aksiyon çubuğu olan ekranlar. */
const focusRoutes = ["/panel/teklifler/yeni"];

function isActive(pathname: string, href: string) {
  return href === "/panel" ? pathname === href : pathname.startsWith(href);
}

/** "Yeni" menüsü: satış ekranları yalnızca yönetici ve satışçıya */
const createActions = [
  { href: "/panel/teklifler/yeni", label: "Yeni teklif", hint: "Gazebo kur, ürün ekle, PDF ve link gönder", icon: FilePlus2, seller: true },
  { href: "/panel/musteriler?yeni=1", label: "Yeni müşteri", hint: "Firma ve iletişim bilgileri", icon: UserPlus, seller: true },
  { href: "/panel/gorevler?yeni=1", label: "Yeni görev", hint: "Bir kişiye görev ata, takip et", icon: ListPlus, seller: false },
];

export function AdminShell({ me, children }: { me: PanelUser; children: React.ReactNode }) {
  return (
    <RoleProvider me={me}>
      <Layout>{children}</Layout>
    </RoleProvider>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role, me } = useRole();
  const seller = role === "admin" || role === "sales";
  const actions = createActions.filter((a) => seller || !a.seller);
  const groups = navFor(role, me.openTasks);
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div data-panel="admin" className="flex min-h-dvh">
      {/* ── Yan menü ── */}
      <aside className="sticky top-0 hidden h-dvh shrink-0 p-3 md:block">
        <div className="flex h-full w-[72px] flex-col rounded-2xl bg-sidebar p-3 lg:w-60">
          <Link href="/panel" className="flex h-12 shrink-0 items-center justify-center gap-2 px-1 lg:justify-start lg:px-3">
            <LogoMark className="h-8 lg:hidden" />
            <Logo variant="white" className="hidden h-6 lg:block" />
          </Link>
          <PanelBadge className="mx-auto mt-1 lg:mx-3" />

          <nav className="mt-4 flex-1 space-y-4 overflow-y-auto no-scrollbar">
            {groups.map((g) => (
              <div key={g.label}>
                <p className="mb-1 hidden px-3 text-[10px] font-semibold tracking-[0.12em] text-sidebar-foreground/60 uppercase lg:block">
                  {g.label}
                </p>
                <div className="space-y-1">
                  {g.items.map((item) => (
                    <SidebarLink key={item.href} item={item} active={isActive(pathname, item.href)} />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <form action={cikisYap} className="mt-2 shrink-0">
            <button
              type="submit"
              className="flex h-11 w-full items-center justify-center gap-3 rounded-xl px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-hover hover:text-white lg:justify-start"
              title="Çıkış yap"
            >
              <LogOut className="size-[18px]" />
              <span className="hidden lg:inline">Çıkış yap</span>
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onCreate={() => setCreateOpen(true)} />
        <main className="flex-1 px-4 pt-2 pb-28 md:px-6 md:pb-10 lg:px-8">{children}</main>
      </div>

      {/* ── Mobil alt menü (form ekranlarında gizlenir) ── */}
      <nav hidden={focusRoutes.includes(pathname)} className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-safe backdrop-blur-md md:hidden">
        <div className={cn("mx-auto grid h-16 max-w-md items-center px-2", seller ? "grid-cols-5" : "grid-cols-4")}>
          <Tab href="/panel" label="Dashboard" icon={LayoutDashboard} active={pathname === "/panel"} />
          {seller && <Tab href="/panel/teklifler" label="Teklifler" icon={FileText} active={isActive(pathname, "/panel/teklifler")} />}
          <button type="button" onClick={() => setCreateOpen(true)} className="flex flex-col items-center gap-1" aria-label="Yeni">
            <span className="-mt-7 grid size-14 place-items-center rounded-full bg-sidebar text-white shadow-pop ring-4 ring-background">
              <Plus className="size-6" />
            </span>
            <span className="text-[10px] font-semibold">Yeni</span>
          </button>
          <Tab href="/panel/gorevler" label="Görevler" icon={CheckSquare} active={isActive(pathname, "/panel/gorevler")} badge={me.openTasks} />
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex flex-col items-center gap-1 py-1 text-[10px] font-medium text-muted-foreground"
          >
            <span className="grid h-7 w-12 place-items-center rounded-full">
              <Menu className="size-5" />
            </span>
            Menü
          </button>
        </div>
      </nav>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Menü">
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{g.label}</p>
              <div className="grid grid-cols-2 gap-2">
                {g.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl border p-3 text-sm font-semibold",
                        active ? "border-transparent bg-sidebar text-white" : "border-border",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          <form action={cikisYap} className="border-t border-border pt-2">
            <button type="submit" className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-muted/60">
              <LogOut className="size-4" /> Çıkış yap
            </button>
          </form>
        </div>
      </Sheet>

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="Yeni oluştur">
        <div className="space-y-2">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.href}
                href={a.href}
                onClick={() => setCreateOpen(false)}
                className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-muted/60"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                  <Icon className="size-[18px]" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{a.label}</span>
                  <span className="block text-xs text-muted-foreground">{a.hint}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </Sheet>
    </div>
  );
}

export function PanelBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full bg-white/[0.08] px-2 py-1 text-[10px] font-semibold tracking-wide text-white uppercase ring-1 ring-white/10",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-panel-badge" />
      <span className="hidden lg:inline">Yönetim</span>
    </span>
  );
}

function SidebarLink({ item, active }: { item: AdminNavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={item.label}
      className={cn(
        "relative flex h-10 items-center justify-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors lg:justify-start",
        active ? "bg-sidebar-active text-sidebar-active-foreground" : "text-sidebar-foreground hover:bg-sidebar-hover hover:text-white",
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      <span className="hidden truncate lg:inline">{item.label}</span>
      {item.badge && (
        <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-danger text-[10px] font-bold text-white lg:static lg:ml-auto lg:size-5">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

function Tab({ href, label, icon: Icon, active, badge }: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; active: boolean; badge?: number }) {
  return (
    <Link href={href} className={cn("flex flex-col items-center gap-1 py-1 text-[10px] font-medium", active ? "text-foreground" : "text-muted-foreground")}>
      <span className={cn("relative grid h-7 w-12 place-items-center rounded-full transition-colors", active && "bg-muted")}>
        <Icon className="size-5" />
        {!!badge && <span className="absolute -top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">{badge}</span>}
      </span>
      {label}
    </Link>
  );
}

function Topbar({ onCreate }: { onCreate?: () => void }) {
  const { role } = useRole();
  return (
    <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 md:h-[76px] md:px-6 lg:px-8">
        <Link href="/panel" className="flex items-center gap-2.5 md:hidden">
          <span data-panel="admin" className="grid size-9 place-items-center rounded-xl bg-sidebar">
            <LogoMark className="h-6" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-bold">Sky Yönetim</span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-panel-badge" /> {roles.find((r) => r.key === role)!.label}
            </span>
          </span>
        </Link>


        <div className="ml-auto flex items-center gap-1 md:gap-2">
          {onCreate && (
            <button type="button" onClick={onCreate} className={cn(buttonVariants(), "hidden md:inline-flex")}>
              <Plus /> Yeni
            </button>
          )}
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

function UserMenu() {
  const { user } = useRole();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-full p-1 transition-colors hover:bg-muted md:border md:border-border md:bg-card md:pr-3 md:shadow-card"
      >
        <span data-panel="admin" className="grid size-8 place-items-center rounded-full bg-sidebar text-xs font-bold text-white">
          {user.initials}
        </span>
        <span className="hidden text-left leading-tight lg:block">
          <span className="block text-sm font-semibold">{user.user}</span>
          <span className="block text-[11px] text-muted-foreground">{user.label}</span>
        </span>
        <ChevronDown className="hidden size-4 text-muted-foreground md:block" />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-2 w-72 rounded-2xl border border-border bg-card p-3 shadow-pop">
          <p className="px-1 text-sm font-semibold">{user.user}</p>
          <p className="px-1 text-xs text-muted-foreground">{user.label}</p>
          <form action={cikisYap} className="mt-3 border-t border-border pt-2">
            <button type="submit" className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-muted/60">
              <LogOut className="size-4" /> Çıkış yap
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
