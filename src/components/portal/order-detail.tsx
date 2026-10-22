"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Landmark,
  MapPin,
  MessageSquareText,
  Phone,
  RotateCcw,
  Undo2,
  ZoomIn,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  addresses,
  currentCustomer,
  customerPricing,
  paymentStatusMeta,
  productionStatusMeta,
  type Order,
  type ProductionStatus,
} from "@/lib/mock";
import { cartTotals, unitPrice } from "@/lib/pricing";
import { getProduct } from "@/lib/products";
import { cn, formatDate, formatTRY } from "@/lib/utils";
import { useCart } from "./cart-context";
import { OrderTracker } from "./order-tracker";

type Decision = null | "approved" | "revision";

const proofs = [
  { v: 1, date: "14 Eki 15:40", status: "Revizyon istendi", note: "Logo biraz küçük kalmış, telefon numarası eklensin." },
  { v: 2, date: "15 Eki 09:05", status: "Güncel", note: "Logonuz alınlıkta büyütüldü, duvarlara iletişim bilgileri eklendi." },
];

export function OrderDetail({ order }: { order: Order }) {
  const cart = useCart();
  const router = useRouter();
  const [decision, setDecision] = useState<Decision>(null);

  const status: ProductionStatus =
    decision === "approved" ? "production" : decision === "revision" ? "design" : order.production;
  const pay = paymentStatusMeta[order.payment];
  const prod = productionStatusMeta[status];
  const lines = order.lines.map((l) => ({ product: getProduct(l.productId)!, qty: l.qty }));
  const totals = cartTotals(lines, customerPricing);
  const address = addresses[0];
  const needsDesign = lines.some((l) => l.product.requiresDesign);

  return (
    <div className="mx-auto max-w-[1200px]">
      {/* Başlık */}
      <Link href="/portal/siparisler" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Siparişler
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">{order.id}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDate(order.date, { day: "numeric", month: "long", year: "numeric" })} · {order.itemCount} adet ·{" "}
            {formatTRY(order.total)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone={pay.tone}>Ödeme: {pay.label}</Badge>
            <Badge tone={prod.tone}>Üretim: {prod.label}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              order.lines.forEach((l) => cart.add(l.productId, l.qty));
              router.push("/portal/siparis-ver");
            }}
          >
            <RotateCcw /> Tekrar sipariş ver
          </Button>
          <Button variant="outline" size="icon" aria-label="Proforma indir">
            <Download />
          </Button>
        </div>
      </div>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {/* Tasarım onayı */}
          {needsDesign && (order.production === "design_review" || decision) && (
            <DesignApproval decision={decision} onDecision={setDecision} image={lines[0].product.image} />
          )}

          {/* Ürünler */}
          <Card>
            <CardHeader title="Ürünler" description="Fiyatlar sipariş anındaki değerlerle kaydedilmiştir" />
            <ul className="mt-4 divide-y divide-border border-t border-border">
              {lines.map(({ product, qty }) => {
                const p = unitPrice(product, customerPricing);
                return (
                  <li key={product.id} className="flex gap-3 px-5 py-4 md:gap-4">
                    <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-border md:size-16">
                      <Image src={product.image} alt="" fill sizes="64px" className="object-contain p-1" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold">{product.name}</p>
                      <p className="tabular mt-0.5 text-xs text-muted-foreground">
                        {qty} adet × <span className="line-through">{formatTRY(p.list)}</span>{" "}
                        <span className="font-semibold text-success">%{p.discountRate}</span> = {formatTRY(p.net)}
                      </p>
                    </div>
                    <p className="tabular shrink-0 text-sm font-bold">{formatTRY(p.net * qty)}</p>
                  </li>
                );
              })}
            </ul>
            <dl className="space-y-1.5 border-t border-border px-5 py-4 text-sm">
              <Sum label="Liste toplamı" value={formatTRY(totals.list)} muted />
              <Sum label={`İskonto (${currentCustomer.discountGroup})`} value={`−${formatTRY(totals.discount)}`} className="text-success" />
              <Sum label="Ara toplam" value={formatTRY(totals.subtotal)} />
              <Sum label="KDV (%20)" value={formatTRY(totals.vat)} muted />
              <Sum label="Genel toplam" value={formatTRY(totals.total)} className="pt-1.5 text-base font-bold" />
            </dl>
          </Card>
        </div>

        {/* Sağ sütun */}
        <div className="space-y-5 lg:sticky lg:top-[92px]">
          <Card>
            <CardHeader title="Sipariş süreci" description="Her adımda sorumlu kişi ve tarih" />
            <div className="p-5">
              <OrderTracker current={status} logs={timeline(order, decision)} />
            </div>
          </Card>

          <Card className="divide-y divide-border">
            <InfoRow icon={MapPin} title="Teslimat · Adresime">
              {address.label} — {address.line}, {address.city}
            </InfoRow>
            <InfoRow icon={Landmark} title={`Ödeme · ${pay.label}`}>
              Vade: {formatDate("2026-11-13", { day: "numeric", month: "long" })} · Fatura sevkiyatta kesilecek
            </InfoRow>
            <InfoRow icon={FileText} title="Belgeler">
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                <a href="#" className="font-semibold text-primary hover:underline">Proforma.pdf</a>
                {needsDesign && <a href="#" className="font-semibold text-primary hover:underline">Tasarım_v2.pdf</a>}
              </span>
            </InfoRow>
            <InfoRow icon={Phone} title={`Satış temsilciniz · ${currentCustomer.salesRep.name}`}>
              <a href={`tel:${currentCustomer.salesRep.phone.replace(/\s/g, "")}`} className="font-semibold text-primary hover:underline">
                {currentCustomer.salesRep.phone}
              </a>
            </InfoRow>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DesignApproval({
  decision,
  onDecision,
  image,
}: {
  decision: Decision;
  onDecision: (d: Decision) => void;
  image: string;
}) {
  const [version, setVersion] = useState(2);
  const [checked, setChecked] = useState(false);
  const [revising, setRevising] = useState(false);
  const [note, setNote] = useState("");
  const proof = proofs.find((p) => p.v === version)!;

  if (decision) {
    const approved = decision === "approved";
    return (
      <Card className={cn("flex items-start gap-4 p-5", approved ? "border-success/30" : "border-primary/30")}>
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full",
            approved ? "bg-success-soft text-success" : "bg-info-soft text-info",
          )}
        >
          {approved ? <CheckCircle2 className="size-5" /> : <MessageSquareText className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{approved ? "Tasarımı onayladınız" : "Revizyon talebiniz iletildi"}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {approved
              ? "Siparişiniz baskı ve üretim aşamasına alındı."
              : "Tasarım ekibi yeni versiyonu hazırladığında bildirim alacaksınız."}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onDecision(null)}>
          <Undo2 /> Geri al
        </Button>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-warning/40">
      <div className="flex items-center justify-between gap-3 bg-warning-soft px-5 py-3">
        <p className="text-sm font-semibold text-warning">Tasarımınız onayınızı bekliyor</p>
        <span className="text-xs font-medium text-warning">Son gün 17 Eki</span>
      </div>

      <div className="grid gap-5 p-5 md:grid-cols-[1.1fr_1fr]">
        {/* Önizleme */}
        <div>
          <div className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-white ring-1 ring-border">
            <div aria-hidden className="absolute inset-0 [background-image:linear-gradient(45deg,#f1f4f9_25%,transparent_25%,transparent_75%,#f1f4f9_75%),linear-gradient(45deg,#f1f4f9_25%,transparent_25%,transparent_75%,#f1f4f9_75%)] [background-size:16px_16px] [background-position:0_0,8px_8px]" />
            <Image src={image} alt="Tasarım önizleme" fill sizes="(min-width: 768px) 400px, 90vw" className="object-contain p-4" />
            <span className="absolute top-3 left-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white">
              Versiyon {version}
            </span>
            <button
              type="button"
              className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-brand-900 shadow ring-1 ring-black/5"
            >
              <ZoomIn className="size-3.5" /> Büyüt
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            {proofs.map((p) => (
              <button
                key={p.v}
                type="button"
                onClick={() => setVersion(p.v)}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-2 text-left transition-colors",
                  version === p.v ? "border-primary bg-primary-soft/60" : "border-border hover:bg-muted/50",
                )}
              >
                <span className="block text-xs font-semibold">v{p.v} · {p.status}</span>
                <span className="block text-[11px] text-muted-foreground">{p.date}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Karar */}
        <div className="flex flex-col">
          <div className="flex gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary-soft-foreground">
              BA
            </span>
            <div className="min-w-0 rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
              <p className="text-xs font-semibold">Burak A. · Tasarım ekibi</p>
              <p className="mt-1 text-sm">{proof.note}</p>
            </div>
          </div>

          {revising ? (
            <div className="mt-5 flex flex-1 flex-col">
              <label className="text-sm font-medium" htmlFor="rev">
                Neyin değişmesini istiyorsunuz?
              </label>
              <textarea
                id="rev"
                autoFocus
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Örn. Logonun rengi lacivert olsun, web adresi eklensin."
                className="mt-1.5 w-full flex-1 resize-none rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
              <div className="mt-3 flex gap-2">
                <Button variant="outline" onClick={() => setRevising(false)} className="flex-1">
                  Vazgeç
                </Button>
                <Button onClick={() => onDecision("revision")} disabled={!note.trim()} className="flex-1">
                  Talebi gönder
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-auto pt-5">
              <label className="flex cursor-pointer gap-3 rounded-xl border border-border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                />
                <span className="text-muted-foreground">
                  Yazım, renk ve iletişim bilgilerini kontrol ettim. Onay sonrası baskıya geçileceğini biliyorum.
                </span>
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setRevising(true)}>
                  Revizyon iste
                </Button>
                <Button onClick={() => onDecision("approved")} disabled={!checked || version !== 2}>
                  <CheckCircle2 /> Onayla
                </Button>
              </div>
              {version !== 2 && (
                <p className="mt-2 text-center text-[11px] text-muted-foreground">Yalnızca güncel versiyon onaylanabilir.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function timeline(order: Order, decision: Decision) {
  const d = (offset: number, time: string) => {
    const date = new Date(order.date);
    date.setDate(date.getDate() + offset);
    return `${formatDate(date.toISOString(), { day: "numeric", month: "short" })} ${time}`;
  };
  return {
    awaiting_approval: { date: d(0, "10:12"), by: currentCustomer.salesRep.name },
    design: decision === "revision"
      ? { date: "Şimdi", by: "Tasarım · Burak A.", note: "Revizyon talebiniz üzerinde çalışılıyor." }
      : { date: d(0, "15:40"), by: "Tasarım · Burak A." },
    design_review: {
      date: d(1, "09:05"),
      by: decision === "approved" ? "Onaylayan: siz" : undefined,
      note: "Tasarım dosyanız hazır. Onaylamanız veya revizyon istemeniz bekleniyor.",
    },
    production: decision === "approved"
      ? { date: "Şimdi", by: "Üretim · Baskı hattı", note: "Tahmini tamamlanma 21 Eki." }
      : { date: d(2, "08:30"), by: "Üretim · Baskı hattı" },
    ready: { date: d(4, "16:00"), by: "Depo" },
    shipped: { date: d(5, "11:20"), by: "Aras Kargo · 7281 9930 12" },
    delivered: { date: d(7, "14:05"), by: "Teslim alan: M. Yılmaz" },
  };
}

function InfoRow({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{title}</p>
        <div className="mt-0.5 text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

function Sum({ label, value, muted, className }: { label: string; value: string; muted?: boolean; className?: string }) {
  return (
    <div className={cn("flex justify-between gap-3", muted && "text-muted-foreground", className)}>
      <dt>{label}</dt>
      <dd className="tabular font-medium">{value}</dd>
    </div>
  );
}

export function OrderDetailFallback() {
  return (
    <div className="mx-auto max-w-lg pt-16 text-center">
      <h1 className="text-xl font-bold">Sipariş bulunamadı</h1>
      <Link href="/portal/siparisler" className={cn(buttonVariants({ variant: "outline" }), "mt-4")}>
        Siparişlere dön
      </Link>
    </div>
  );
}
