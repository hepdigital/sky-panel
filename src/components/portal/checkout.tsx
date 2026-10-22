"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  Factory,
  Info,
  Landmark,
  Lock,
  Palette,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QtyStepper } from "@/components/ui/qty-stepper";
import { account, addresses, currentCustomer, customerPricing, factoryPickup } from "@/lib/mock";
import { unitPrice } from "@/lib/pricing";
import { cn, formatTRY } from "@/lib/utils";
import { CardFields, PayLabel, SecureNote } from "./card-form";
import { useCart } from "./cart-context";

type Delivery = "own" | "customer" | "pickup";
type Payment = "account" | "card";

const deliveryOptions: { key: Delivery; label: string; hint: string; icon: LucideIcon }[] = [
  { key: "own", label: "Adresime", hint: "Ofis veya depo", icon: Building2 },
  { key: "customer", label: "Müşterime", hint: "Doğrudan gönderim", icon: Truck },
  { key: "pickup", label: "Fabrikadan al", hint: "Ücretsiz", icon: Factory },
];

export function Checkout() {
  const cart = useCart();
  const [delivery, setDelivery] = useState<Delivery>("own");
  const [addressId, setAddressId] = useState("adr-1");
  const [payment, setPayment] = useState<Payment>("account");
  const [usePrepaid, setUsePrepaid] = useState(true);
  const [cardOpen, setCardOpen] = useState(false);
  const [submitted, setSubmitted] = useState<null | { id: string; approval: boolean; payment: Payment; designCount: number }>(null);

  const { totals, lines } = cart;
  const prepaidUsed = usePrepaid ? Math.min(account.prepaid, totals.total) : 0;
  const payable = Math.max(totals.total - prepaidUsed, 0);
  const available = account.creditLimit - account.creditUsed;
  const limitExceeded = payment === "account" && payable > available;
  const designCount = lines.filter((l) => l.product.requiresDesign).length;
  const visibleAddresses = addresses.filter((a) => a.type === delivery);

  function selectDelivery(d: Delivery) {
    setDelivery(d);
    const first = addresses.find((a) => a.type === d);
    if (first) setAddressId(first.id);
  }

  function placeOrder() {
    if (payment === "card" && payable > 0) {
      setCardOpen(true);
      return;
    }
    finish();
  }

  function finish() {
    setCardOpen(false);
    setSubmitted({ id: "SP-2026-0982", approval: limitExceeded, payment, designCount });
    cart.clear();
    window.scrollTo({ top: 0 });
  }

  if (!cart.ready) return <div className="mx-auto mt-6 h-96 max-w-[1200px] animate-pulse rounded-2xl bg-muted" />;
  if (submitted) return <OrderPlaced {...submitted} />;
  if (!lines.length) return <EmptyCart onReorder={() => ["18914", "15758", "15888"].forEach((id, i) => cart.add(id, [2, 10, 4][i]))} />;

  return (
    <div className="mx-auto max-w-[1200px] pb-24 lg:pb-0">
      <div className="pt-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Siparişi tamamla</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fiyatlar {currentCustomer.discountGroup} (%{currentCustomer.discountRate}) iskontonuzla hesaplanmıştır.
        </p>
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {/* 1 — Ürünler */}
          <Section step={1} title="Ürünler" meta={`${cart.count} adet · ${lines.length} kalem`}>
            <ul className="divide-y divide-border">
              {lines.map(({ product, qty }) => {
                const p = unitPrice(product, customerPricing);
                return (
                  <li key={product.id} className="flex gap-3 py-4 first:pt-0 last:pb-0 md:gap-4">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-border md:size-20">
                      <Image src={product.image} alt="" fill sizes="80px" className="object-contain p-1.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-semibold">{product.name}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            {product.sku}
                            {product.requiresDesign && (
                              <span className="inline-flex items-center gap-1 text-primary">
                                <Palette className="size-3" /> Tasarım onayı
                              </span>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => cart.setQty(product.id, 0)}
                          className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="Kaldır"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-end justify-between gap-3">
                        <QtyStepper value={qty} onChange={(n) => cart.setQty(product.id, n)} size="sm" className="w-28" />
                        <div className="text-right leading-tight">
                          <p className="tabular text-[11px] text-muted-foreground">
                            <span className="line-through">{formatTRY(p.list)}</span>{" "}
                            <span className="font-semibold text-success">%{p.discountRate}</span> · {formatTRY(p.net)} / adet
                          </p>
                          <p className="tabular text-[15px] font-bold">{formatTRY(p.net * qty)}</p>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Link href="/portal/urunler" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
              <Plus className="size-4" /> Ürün ekle
            </Link>
          </Section>

          {/* 2 — Teslimat */}
          <Section step={2} title="Teslimat">
            <div className="grid grid-cols-3 gap-2">
              {deliveryOptions.map((o) => (
                <OptionTile
                  key={o.key}
                  active={delivery === o.key}
                  onClick={() => selectDelivery(o.key)}
                  icon={o.icon}
                  label={o.label}
                  hint={o.hint}
                />
              ))}
            </div>

            <div className="mt-4 space-y-2">
              {delivery === "pickup" ? (
                <div className="flex gap-3 rounded-xl bg-muted/70 p-4 text-sm">
                  <Factory className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="font-semibold">{factoryPickup.line}</p>
                    <p className="text-muted-foreground">{factoryPickup.city} · Hazır olduğunda SMS ile bilgilendirilirsiniz.</p>
                  </div>
                </div>
              ) : (
                <>
                  {visibleAddresses.map((a) => (
                    <label
                      key={a.id}
                      className={cn(
                        "flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors",
                        addressId === a.id ? "border-primary bg-primary-soft/50" : "border-border hover:bg-muted/50",
                      )}
                    >
                      <input
                        type="radio"
                        name="address"
                        checked={addressId === a.id}
                        onChange={() => setAddressId(a.id)}
                        className="mt-1 size-4 accent-[var(--primary)]"
                      />
                      <span className="min-w-0 text-sm">
                        <span className="block font-semibold">{a.label}</span>
                        <span className="block text-muted-foreground">
                          {a.line}, {a.city}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {a.contact} · {a.phone}
                        </span>
                      </span>
                    </label>
                  ))}
                  <Link
                    href="/portal/adresler"
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border p-3 text-sm font-semibold text-primary hover:bg-muted/50"
                  >
                    <Plus className="size-4" /> {delivery === "customer" ? "Müşteri adresi ekle" : "Yeni adres ekle"}
                  </Link>
                  {delivery === "customer" && (
                    <p className="flex gap-2 text-xs text-muted-foreground">
                      <Info className="mt-0.5 size-3.5 shrink-0" />
                      Paket üzerinde fiyat bilgisi yer almaz, gönderici olarak firmanızın adı yazılır.
                    </p>
                  )}
                </>
              )}
            </div>
          </Section>

          {/* 3 — Ödeme */}
          <Section step={3} title="Ödeme">
            <div className="space-y-2">
              <PaymentOption
                active={payment === "account"}
                onClick={() => setPayment("account")}
                icon={Landmark}
                title="Cari hesaba işle (vadeli)"
                text={`Kullanılabilir limit ${formatTRY(available)}`}
              />
              <PaymentOption
                active={payment === "card"}
                onClick={() => setPayment("card")}
                icon={CreditCard}
                title="Kredi kartı ile öde"
                text="3D Secure · Tek çekim veya taksit"
              />
            </div>

            <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl bg-success-soft/70 p-4">
              <Wallet className="size-5 shrink-0 text-success" />
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-semibold">Ön ödeme bakiyemi kullan</span>
                <span className="block text-xs text-muted-foreground">Mevcut bakiye {formatTRY(account.prepaid)}</span>
              </span>
              <Switch checked={usePrepaid} onChange={setUsePrepaid} />
            </label>
          </Section>

          {/* 4 — Not */}
          <Section step={4} title="Sipariş bilgisi" meta="İsteğe bağlı">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium">Referans / PO numaranız</span>
                <input
                  placeholder="Örn. MK-2026-114"
                  className="h-11 w-full rounded-xl border border-input bg-card px-4 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
              </label>
              <label className="block text-sm md:row-span-2">
                <span className="mb-1.5 block font-medium">Not</span>
                <textarea
                  rows={4}
                  placeholder="Üretim veya teslimatla ilgili notunuz"
                  className="w-full resize-none rounded-xl border border-input bg-card px-4 py-3 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
              </label>
            </div>
          </Section>
        </div>

        {/* Özet */}
        <aside className="space-y-4 lg:sticky lg:top-[92px]">
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">Sipariş özeti</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <SumRow label="Liste toplamı" value={formatTRY(totals.list)} muted />
              <SumRow label={`İskonto (${currentCustomer.discountGroup})`} value={`−${formatTRY(totals.discount)}`} tone="success" />
              <SumRow label="Ara toplam" value={formatTRY(totals.subtotal)} />
              <SumRow label="KDV (%20)" value={formatTRY(totals.vat)} muted />
              <SumRow label="Kargo" value={delivery === "pickup" ? "Ücretsiz" : "Alıcı ödemeli"} muted />
              {prepaidUsed > 0 && <SumRow label="Ön ödeme bakiyesi" value={`−${formatTRY(prepaidUsed)}`} tone="success" />}
            </dl>
            <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
              <span className="text-sm font-semibold">{payment === "card" ? "Karttan çekilecek" : "Cariye işlenecek"}</span>
              <span className="tabular text-2xl font-bold tracking-tight">{formatTRY(payable)}</span>
            </div>

            <div className="mt-5 hidden lg:block">
              <SubmitButton payment={payment} approval={limitExceeded} payable={payable} onClick={placeOrder} />
            </div>
            <p className="mt-3 hidden items-center justify-center gap-1.5 text-[11px] text-muted-foreground lg:flex">
              <ShieldCheck className="size-3.5" /> Fiyatlar sunucu tarafından doğrulanır
            </p>
          </Card>

          {/* Kontroller */}
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">Sipariş kontrolleri</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {payment === "account" &&
                (limitExceeded ? (
                  <Check_ tone="warning" title="Kredi limiti aşılıyor">
                    Sipariş, satış temsilcinizin onayına gönderilecek.
                  </Check_>
                ) : (
                  <Check_ tone="success" title="Kredi limiti yeterli">
                    Sipariş sonrası kalan limit {formatTRY(available - payable)}
                  </Check_>
                ))}
              {payment === "card" && (
                <Check_ tone="success" title="Kartla ödeme">
                  Ödeme onaylandığında sipariş üretime alınır.
                </Check_>
              )}
              {account.overdue > 0 && (
                <Check_ tone="warning" title={`Vadesi geçmiş borç: ${formatTRY(account.overdue)}`}>
                  <Link href="/portal/cari/borc-ode" className="font-semibold text-primary hover:underline">
                    Şimdi öde
                  </Link>{" "}
                  · Siparişinizi engellemez.
                </Check_>
              )}
              {designCount > 0 && (
                <Check_ tone="info" title={`${designCount} üründe tasarım onayı`}>
                  Baskı dosyası hazırlanıp onayınıza sunulacak.
                </Check_>
              )}
            </ul>
          </Card>
        </aside>
      </div>

      {/* Mobil sabit aksiyon çubuğu */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-[1200px] items-center gap-3">
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-[11px] text-muted-foreground">{payment === "card" ? "Karttan çekilecek" : "Cariye işlenecek"}</p>
            <p className="tabular text-lg font-bold">{formatTRY(payable)}</p>
          </div>
          <SubmitButton payment={payment} approval={limitExceeded} payable={payable} onClick={placeOrder} compact />
        </div>
      </div>

      {cardOpen && <CardSheet amount={payable} onClose={() => setCardOpen(false)} onPaid={finish} />}
    </div>
  );
}

/* ───────────────────────── Parçalar ───────────────────────── */

function Section({ step, title, meta, children }: { step: number; title: string; meta?: string; children: React.ReactNode }) {
  return (
    <Card className="p-4 md:p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{step}</span>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {meta && <span className="ml-auto text-xs text-muted-foreground">{meta}</span>}
      </div>
      {children}
    </Card>
  );
}

function OptionTile({
  active,
  onClick,
  icon: Icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors md:flex-row md:items-center md:p-4",
        active ? "border-primary bg-primary-soft/60" : "border-border hover:bg-muted/50",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg",
          active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      </span>
      {active && <Check className="absolute top-2.5 right-2.5 size-4 text-primary" strokeWidth={3} />}
    </button>
  );
}

function PaymentOption({
  active,
  onClick,
  icon: Icon,
  title,
  text,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors",
        active ? "border-primary bg-primary-soft/60" : "border-border hover:bg-muted/50",
      )}
    >
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full border-2",
          active ? "border-primary bg-primary" : "border-input",
        )}
      >
        {active && <span className="size-2 rounded-full bg-primary-foreground" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{text}</span>
      </span>
      <Icon className="size-5 shrink-0 text-muted-foreground" />
    </button>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <span className="relative inline-flex shrink-0">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="h-6 w-11 rounded-full bg-input transition-colors peer-checked:bg-success peer-focus-visible:ring-2 peer-focus-visible:ring-ring" />
      <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
    </span>
  );
}

function SumRow({ label, value, muted, tone }: { label: string; value: string; muted?: boolean; tone?: "success" }) {
  return (
    <div className={cn("flex justify-between gap-3", muted && "text-muted-foreground", tone === "success" && "text-success")}>
      <dt>{label}</dt>
      <dd className="tabular font-medium">{value}</dd>
    </div>
  );
}

function Check_({ tone, title, children }: { tone: "success" | "warning" | "info"; title: string; children: React.ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? AlertTriangle : Palette;
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg",
          tone === "success" && "bg-success-soft text-success",
          tone === "warning" && "bg-warning-soft text-warning",
          tone === "info" && "bg-info-soft text-info",
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}

function SubmitButton({
  payment,
  approval,
  payable,
  onClick,
  compact,
}: {
  payment: Payment;
  approval: boolean;
  payable: number;
  onClick: () => void;
  compact?: boolean;
}) {
  const label =
    payment === "card" && payable > 0 ? "Kartla öde" : approval ? "Onaya gönder" : "Siparişi onayla";
  return (
    <Button size="lg" onClick={onClick} className={cn(compact ? "px-5" : "w-full")}>
      {payment === "card" && payable > 0 ? <Lock /> : null}
      {label}
      {!compact && <ArrowRight />}
    </Button>
  );
}

/** Ödeme kuruluşunun 3D Secure ekranını temsil eder. Kart bilgisi sistemimizde saklanmaz. */
function CardSheet({ amount, onClose, onPaid }: { amount: number; onClose: () => void; onPaid: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl bg-card p-5 pb-safe shadow-pop md:rounded-3xl md:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border md:hidden" />
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">Kartla ödeme</h3>
            <p className="text-xs text-muted-foreground">Güvenli ödeme sayfası · 3D Secure</p>
          </div>
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-muted" aria-label="Kapat">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-5">
          <CardFields amount={amount} />
        </div>
        <Button size="lg" className="mt-5 w-full" onClick={onPaid}>
          <PayLabel amount={amount} />
        </Button>
        <SecureNote className="mt-3" />
      </div>
    </div>
  );
}

function EmptyCart({ onReorder }: { onReorder: () => void }) {
  return (
    <div className="mx-auto max-w-lg pt-10 text-center md:pt-16">
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-primary-soft text-primary">
        <ShoppingBag className="size-7" />
      </span>
      <h1 className="mt-5 text-2xl font-bold tracking-tight">Sepetiniz boş</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ürünler sayfasından seçim yapabilir veya önceki siparişinizi tek dokunuşla tekrarlayabilirsiniz.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        <Link href="/portal/urunler" className={buttonVariants({ size: "lg" })}>
          Ürünlere göz at <ArrowRight />
        </Link>
        <Button variant="outline" size="lg" onClick={onReorder}>
          <RotateCcw /> Son siparişi tekrarla
        </Button>
      </div>
    </div>
  );
}

function OrderPlaced({
  id,
  approval,
  payment,
  designCount,
}: {
  id: string;
  approval: boolean;
  payment: Payment;
  designCount: number;
}) {
  const steps = [
    approval
      ? { title: "Satış temsilcisi onayı", text: "Limit aşımı nedeniyle siparişiniz onaya gönderildi." }
      : { title: "Sipariş onaylandı", text: payment === "card" ? "Ödemeniz alındı." : "Tutar cari hesabınıza işlendi." },
    designCount
      ? { title: "Tasarım hazırlanacak", text: "Baskı dosyası hazırlanıp onayınıza sunulacak." }
      : { title: "Üretime alınacak", text: "Siparişiniz üretim planına eklendi." },
    { title: "Sevkiyat", text: "Hazır olduğunda SMS ve e-posta ile bilgilendirileceksiniz." },
  ];
  return (
    <div className="mx-auto max-w-lg pt-6 md:pt-12">
      <Card className="p-6 text-center md:p-8">
        <span className={cn("mx-auto grid size-16 place-items-center rounded-full", approval ? "bg-warning-soft text-warning" : "bg-success-soft text-success")}>
          {approval ? <AlertTriangle className="size-7" /> : <CheckCircle2 className="size-8" />}
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">{approval ? "Siparişiniz onaya gönderildi" : "Siparişiniz alındı"}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Sipariş numaranız <span className="font-semibold text-foreground">{id}</span>
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Badge tone={payment === "card" ? "success" : "info"}>{payment === "card" ? "Ödendi" : "Cariye işlendi"}</Badge>
          <Badge tone="neutral">{approval ? "Onay bekliyor" : "Hazırlanıyor"}</Badge>
        </div>

        <ol className="mt-6 space-y-4 text-left">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                  i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-7 flex flex-col gap-2 sm:flex-row">
          <Link href="/portal/siparisler/SP-2026-0981" className={cn(buttonVariants({ size: "lg" }), "sm:flex-1")}>
            Siparişi görüntüle
          </Link>
          <Link href="/portal" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "sm:flex-1")}>
            Ana sayfa
          </Link>
        </div>
      </Card>
    </div>
  );
}
