import {
  FileText,
  Home,
  LayoutGrid,
  MapPin,
  Package,
  Plus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
};

/** Müşteri (bayi) portalı menüsü */
export const portalNav: NavItem[] = [
  { href: "/portal", label: "Ana Sayfa", icon: Home },
  { href: "/portal/urunler", label: "Ürünler", icon: LayoutGrid },
  { href: "/portal/siparisler", label: "Siparişler", icon: Package },
  { href: "/portal/teklifler", label: "Teklifler", icon: FileText, badge: "1" },
  { href: "/portal/cari", label: "Cari Hesap", icon: Wallet },
  { href: "/portal/adresler", label: "Adresler", icon: MapPin },
  { href: "/portal/kullanicilar", label: "Kullanıcılar", icon: Users },
];

/** Mobil alt sekme çubuğu — ortadaki öğe vurgulu "Sipariş Ver" butonudur. */
export const portalTabs: (NavItem & { primary?: boolean })[] = [
  { href: "/portal", label: "Ana Sayfa", icon: Home },
  { href: "/portal/urunler", label: "Ürünler", icon: LayoutGrid },
  { href: "/portal/siparis-ver", label: "Sipariş Ver", icon: Plus, primary: true },
  { href: "/portal/siparisler", label: "Siparişler", icon: Package },
  { href: "/portal/cari", label: "Cari", icon: Wallet },
];
