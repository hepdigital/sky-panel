import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

const screens = [
  { href: "/giris", title: "Giriş ekranı", text: "Bayi ve personel girişi", ready: true },
  { href: "/portal", title: "Müşteri ana sayfası", text: "Bakiye, limit, siparişler, vadeler", ready: true },
  { href: "/portal/urunler", title: "Ürünler", text: "Katalog, iskontolu fiyat, sepet", ready: true },
  { href: "/portal/siparis-ver", title: "Sipariş tamamlama", text: "Teslimat, ödeme, limit kontrolü", ready: true },
  { href: "/portal/siparisler", title: "Siparişler", text: "Liste ve durum filtreleri", ready: true },
  { href: "/portal/siparisler/SP-2026-0981", title: "Sipariş detayı", text: "Tasarım onayı ve süreç takibi", ready: true },
  { href: "/portal/cari", title: "Cari hesap", text: "Hareketler, açık faturalar, ödemeler", ready: true },
  { href: "/portal/cari/borc-ode", title: "Borç öde", text: "Vade / fatura seçerek kartla ödeme", ready: true },
  { href: "/portal/cari/bakiye-yukle", title: "Bakiye yükle", text: "Ön ödeme, borçtan ayrı", ready: true },
  { href: "/portal/cari/odeme-linki", title: "Ödeme linki", text: "Bayinin müşterisine link gönderme", ready: true },
  { href: "/odeme/demo", title: "Müşteri ödeme sayfası", text: "Linki açan son müşterinin ekranı", ready: true },
  { href: "/istasyon", title: "İstasyon ekranları", text: "Tasarım, baskı, üretim, sevkiyat · menüsüz tablet ekranı", ready: true },
  { href: "/panel", title: "Yönetim paneli · Dashboard", text: "Rol bazlı: yönetici, satış, tasarım, üretim, depo, finans", ready: true },
];

export default function PrototypeIndex() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 py-10">
      <div className="flex items-center justify-between">
        <Logo />
        <ThemeToggle />
      </div>
      <h1 className="mt-12 text-3xl font-bold tracking-tight">Sky B2B · Arayüz prototipi</h1>
      <p className="mt-2 text-muted-foreground">Tasarım dilini oturtmak için hazırlanan ekranlar.</p>
      <ul className="mt-8 space-y-3">
        {screens.map((s) => (
          <li key={s.title}>
            {s.ready ? (
              <Link
                href={s.href}
                className="group flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-card transition-colors hover:border-primary/40"
              >
                <span>
                  <span className="block font-semibold">{s.title}</span>
                  <span className="block text-sm text-muted-foreground">{s.text}</span>
                </span>
                <ArrowRight className="size-5 text-primary transition-transform group-hover:translate-x-1" />
              </Link>
            ) : (
              <div className="flex items-center justify-between rounded-2xl border border-dashed border-border p-5 text-muted-foreground">
                <span>
                  <span className="block font-semibold">{s.title}</span>
                  <span className="block text-sm">{s.text}</span>
                </span>
                <span className="text-xs font-semibold">Sırada</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
