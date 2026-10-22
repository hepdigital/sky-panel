// Örnek bildirimler. Gerçek sistemde sunucudan gelir; aynı bildirim e-posta / SMS / WhatsApp
// kanallarına da kullanıcının tercihine göre gönderilir.

import type { Role } from "./admin-mock";

export type NotifKind = "design" | "payment" | "payment_failed" | "quote" | "order" | "shipping" | "approval" | "late" | "system";

export type Notif = {
  id: string;
  kind: NotifKind;
  title: string;
  body: string;
  time: string;
  group: "Bugün" | "Dün" | "Daha önce";
  unread?: boolean;
  href?: string;
  actions?: { label: string; href?: string; primary?: boolean }[];
  roles?: Role[];
};

export const portalNotifications: Notif[] = [
  {
    id: "p1",
    kind: "design",
    title: "Tasarımınız onayınızı bekliyor",
    body: "SP-2026-0981 · Versiyon 2 hazır. Onay sonrası üretime alınacak.",
    time: "09:05",
    group: "Bugün",
    unread: true,
    href: "/portal/siparisler/SP-2026-0981",
    actions: [{ label: "Tasarımı incele", href: "/portal/siparisler/SP-2026-0981", primary: true }],
  },
  {
    id: "p2",
    kind: "quote",
    title: "Yeni teklifiniz var",
    body: "Fuar standı paketi · 4 kalem · ₺64.500. Son gün 21 Ekim.",
    time: "08:40",
    group: "Bugün",
    unread: true,
    href: "/portal/teklifler/TK-2026-0312",
    actions: [{ label: "Teklifi gör", href: "/portal/teklifler/TK-2026-0312" }],
  },
  {
    id: "p3",
    kind: "payment_failed",
    title: "Vadesi geçmiş faturanız var",
    body: "FT-2026-1180 · ₺12.400 · 8 gün gecikti.",
    time: "08:00",
    group: "Bugün",
    unread: true,
    href: "/portal/cari",
    actions: [{ label: "Şimdi öde", href: "/portal/cari/borc-ode?faturalar=FT-2026-1180", primary: true }],
  },
  {
    id: "p4",
    kind: "shipping",
    title: "Siparişiniz kargoya verildi",
    body: "SP-2026-0921 · Aras Kargo · Takip no 7281 9930 12",
    time: "16:20",
    group: "Dün",
    href: "/portal/siparisler/SP-2026-0921",
  },
  {
    id: "p5",
    kind: "order",
    title: "Siparişiniz üretime alındı",
    body: "SP-2026-0954 · Tahmini sevk 18 Ekim.",
    time: "11:15",
    group: "Dün",
    href: "/portal/siparisler/SP-2026-0954",
  },
  {
    id: "p6",
    kind: "payment",
    title: "Ödemeniz cari hesabınıza işlendi",
    body: "TH-2026-0398 · ₺26.000 · Kredi kartı",
    time: "3 Eki",
    group: "Daha önce",
    href: "/portal/cari",
  },
  {
    id: "p7",
    kind: "system",
    title: "İskonto oranınız güncellendi",
    body: "Bayi B grubu iskontonuz %20 olarak tanımlandı.",
    time: "1 Eki",
    group: "Daha önce",
  },
];

export const adminNotifications: Notif[] = [
  {
    id: "a1",
    kind: "approval",
    title: "Limit aşımı onay bekliyor",
    body: "Marmara Fuarcılık · SP-2026-0990 · ₺58.920 · limit %7 aşılıyor",
    time: "10:42",
    group: "Bugün",
    unread: true,
    href: "/panel/onaylar",
    actions: [
      { label: "İncele", href: "/panel/onaylar" },
      { label: "Onayla", primary: true },
    ],
    roles: ["admin", "finance"],
  },
  {
    id: "a2",
    kind: "design",
    title: "Müşteri revizyon istedi",
    body: "Akdeniz Reklam · SP-2026-0981 · “Logo alınlıkta daha büyük olsun.”",
    time: "10:10",
    group: "Bugün",
    unread: true,
    href: "/panel/tasarim",
    actions: [{ label: "Tasarıma git", href: "/panel/tasarim", primary: true }],
    roles: ["admin", "design", "sales"],
  },
  {
    id: "a3",
    kind: "order",
    title: "Portaldan yeni sipariş",
    body: "Başkent Organizasyon · SP-2026-0983 · ₺17.424 · ödendi",
    time: "09:30",
    group: "Bugün",
    unread: true,
    href: "/panel/uretim",
    roles: ["admin", "sales", "design", "production"],
  },
  {
    id: "a4",
    kind: "late",
    title: "Üretimde gecikme",
    body: "SP-2026-0962 · Ege Promosyon · sevk tarihi 15 Ekim geçti",
    time: "08:00",
    group: "Bugün",
    unread: true,
    href: "/panel/uretim",
    actions: [{ label: "Panoyu aç", href: "/panel/uretim" }],
    roles: ["admin", "production", "sales"],
  },
  {
    id: "a5",
    kind: "shipping",
    title: "Kargo teslimi bugün 16:00",
    body: "5 paket sevke hazır · Aras Kargo",
    time: "07:45",
    group: "Bugün",
    unread: true,
    href: "/panel/sevkiyat",
    roles: ["admin", "warehouse"],
  },
  {
    id: "a5b",
    kind: "late",
    title: "Sevk bekleyen sipariş gecikti",
    body: "SP-2026-0941 · Karadeniz Matbaa · kısmi ödeme nedeniyle finans onayı bekleniyor",
    time: "07:30",
    group: "Bugün",
    unread: true,
    href: "/panel/sevkiyat",
    roles: ["warehouse"],
  },
  {
    id: "a5c",
    kind: "shipping",
    title: "Fabrikadan teslim alınacak",
    body: "Başkent Organizasyon · SP-2026-0948 · bugün 14:00 randevulu",
    time: "16:45",
    group: "Dün",
    href: "/panel/sevkiyat",
    roles: ["warehouse"],
  },
  {
    id: "a6",
    kind: "payment_failed",
    title: "Başarısız ödeme denemesi",
    body: "Akdeniz Reklam · ₺26.000 · banka reddetti, cariye işlenmedi",
    time: "17:05",
    group: "Dün",
    href: "/panel/tahsilatlar",
    roles: ["admin", "finance"],
  },
  {
    id: "a7",
    kind: "quote",
    title: "Teklif kabul edildi",
    body: "Ege Promosyon · TK-2026-0299 → SP-2026-0985 siparişine dönüştü",
    time: "15:30",
    group: "Dün",
    href: "/panel/teklifler",
    roles: ["admin", "sales"],
  },
  {
    id: "a8",
    kind: "payment",
    title: "Ödeme alındı",
    body: "Akdeniz Reklam · ₺26.000 · kredi kartı · cariye işlendi",
    time: "14:10",
    group: "Dün",
    href: "/panel/tahsilatlar",
    roles: ["admin", "finance", "sales"],
  },
  {
    id: "a9",
    kind: "system",
    title: "İskonto oranı değiştirildi",
    body: "Kadir Can · Bayi B %18 → %20 · tüm Bayi B müşterilerine uygulandı",
    time: "13 Eki",
    group: "Daha önce",
    href: "/panel/kayitlar",
    roles: ["admin", "sales", "finance"],
  },
];
