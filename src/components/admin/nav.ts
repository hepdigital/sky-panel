import {
  BarChart3,
  CheckSquare,
  ClipboardCheck,
  Factory,
  FileText,
  History,
  LayoutDashboard,
  MonitorSmartphone,
  Package,
  Palette,
  ShieldCheck,
  Tags,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/admin-mock";

export type AdminNavItem = { href: string; label: string; icon: LucideIcon; roles: Role[] | "all"; badge?: string };
export type AdminNavGroup = { label: string; items: AdminNavItem[] };

/** Rol bazlı menü — kullanıcı yalnızca yetkili olduğu ekranları görür. */
export const adminNav: AdminNavGroup[] = [
  {
    label: "Genel",
    items: [
      { href: "/panel", label: "Dashboard", icon: LayoutDashboard, roles: "all" },
      { href: "/panel/gorevler", label: "Görevler", icon: CheckSquare, roles: "all" },
    ],
  },
  {
    label: "Satış",
    items: [
      { href: "/panel/musteriler", label: "Müşteriler", icon: Users, roles: ["admin", "sales", "finance"] },
      { href: "/panel/teklifler", label: "Teklifler", icon: FileText, roles: ["admin", "sales"] },
      { href: "/panel/siparisler", label: "Siparişler", icon: Package, roles: ["admin", "sales"] },
      { href: "/panel/urunler", label: "Ürünler", icon: Tags, roles: ["admin", "sales"] },
    ],
  },
  {
    label: "Operasyon",
    items: [
      { href: "/panel/tasarim", label: "Tasarım", icon: Palette, roles: ["admin", "design", "sales"] },
      { href: "/panel/uretim", label: "Üretim", icon: Factory, roles: ["admin", "production", "design", "warehouse"] },
      { href: "/panel/sevkiyat", label: "Sevkiyat", icon: Truck, roles: ["admin", "warehouse"] },
      { href: "/istasyon", label: "İstasyon ekranları", icon: MonitorSmartphone, roles: ["admin", "design", "production", "warehouse"] },
    ],
  },
  {
    label: "Finans",
    items: [
      { href: "/panel/onaylar", label: "Onaylar", icon: ClipboardCheck, roles: ["admin", "finance"], badge: "2" },
      { href: "/panel/tahsilatlar", label: "Tahsilatlar", icon: Wallet, roles: ["admin", "finance"] },
      { href: "/panel/raporlar", label: "Raporlar", icon: BarChart3, roles: ["admin", "finance"] },
    ],
  },
  {
    label: "Ayarlar",
    items: [
      { href: "/panel/kullanicilar", label: "Kullanıcı & roller", icon: ShieldCheck, roles: ["admin"] },
      { href: "/panel/kayitlar", label: "İşlem kayıtları", icon: History, roles: ["admin"] },
    ],
  },
];

/** 1. aşamada açık ekranlar: teklif, sipariş, cari, ürün ve kullanıcı yönetimi (diğerleri sonraki aşamalarda açılacak) */
const PHASE1 = new Set(["/panel", "/panel/gorevler", "/panel/musteriler", "/panel/teklifler", "/panel/siparisler", "/panel/urunler", "/panel/kullanicilar"]);

/** openTasks: Görevler'in yanında bana atanan açık görev sayısı */
export function navFor(role: Role, openTasks = 0) {
  return adminNav
    .map((g) => ({
      ...g,
      items: g.items
        .filter((i) => PHASE1.has(i.href) && (i.roles === "all" || i.roles.includes(role)))
        .map((i) => (i.href === "/panel/gorevler" && openTasks ? { ...i, badge: String(openTasks) } : i)),
    }))
    .filter((g) => g.items.length);
}
