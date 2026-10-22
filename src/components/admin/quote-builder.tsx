"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  Factory,
  Info,
  Mail,
  MessageCircle,
  MonitorSmartphone,
  Plus,
  Search,
  Send,
  Sparkles,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QtyStepper } from "@/components/ui/qty-stepper";
import { adminCustomers, extraDiscountLimit, getCustomerDetail, groupRate, type AdminCustomer } from "@/lib/admin-mock";
import { VAT_RATE } from "@/lib/pricing";
import { products, type Product } from "@/lib/products";
import { cn, formatTRY } from "@/lib/utils";
import { initialsOf } from "./customer-list";
import { useRole } from "./role-context";

type Mode = "quote" | "order";
type Line = { product: Product; qty: number; extra: number };

function limitText(available: number) {
  return available >= 0 ? `Kalan limit ${formatTRY(available, { whole: true })}` : `Limit ${formatTRY(-available, { whole: true })} aşıldı`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function QuoteBuilder({ mode }: { mode: Mode }) {
  const params = useSearchParams();
  const { role, user } = useRole();
  const [customer, setCustomer] = useState<AdminCustomer | null>(() => adminCustomers.find((c) => c.id === params.get("musteri")) ?? null);
  const [lines, setLines] = useState<Line[]>([]);
  const [delivery, setDelivery] = useState<"customer" | "pickup">("customer");
  const [validity, setValidity] = useState("15");
  const [payment, setPayment] = useState<"account" | "link">("account");
  const [channels, setChannels] = useState({ portal: true, email: true, whatsapp: false });
  const [done, setDone] = useState<null | { id: string; approval: boolean }>(null);

  const isOrder = mode === "order";
  const maxExtra = extraDiscountLimit[role];
  const detail = customer ? getCustomerDetail(customer) : null;

  const priced = lines.map((l) => {
    const special = detail?.specialPrices.find((s) => s.productId === l.product.id);
    const base = special ? special.price : l.product.listPrice * (1 - groupRate(customer?.group ?? "") / 100);
    const unit = round2(base * (1 - l.extra / 100));
    return { ...l, special: !!special, base: round2(base), unit, total: round2(unit * l.qty) };
  });
  const list = priced.reduce((s, l) => s + l.product.listPrice * l.qty, 0);
  const groupNet = priced.reduce((s, l) => s + l.base * l.qty, 0);
  const subtotal = priced.reduce((s, l) => s + l.total, 0);
  const vat = round2(subtotal * VAT_RATE);
  const total = round2(subtotal + vat);
  const overAuthority = priced.some((l) => l.extra > maxExtra);
  const available = customer ? customer.limit - customer.balance : 0;
  const limitExceeded = isOrder && payment === "account" && total > available;
  const needsApproval = overAuthority || limitExceeded || (isOrder && customer?.status === "blocked");

  function add(p: Product) {
    setLines((ls) => (ls.some((l) => l.product.id === p.id) ? ls.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l)) : [...ls, { product: p, qty: 1, extra: 0 }]));
  }

  if (done) return <Done mode={mode} id={done.id} approval={done.approval} customer={customer!} total={total} />;

  return (
    <div className="mx-auto max-w-[1300px] pb-24 lg:pb-0">
      <Link href={isOrder ? "/panel/siparisler" : "/panel/teklifler"} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {isOrder ? "Siparişler" : "Teklifler"}
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight md:text-[28px]">{isOrder ? "Müşteri adına sipariş" : "Yeni teklif"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Fiyatlar müşterinin iskonto grubu ve özel fiyatlarıyla otomatik hesaplanır. Ek iskonto yetkiniz %{maxExtra}.
      </p>

      {/* Müşteri adına işlem şeridi */}
      {isOrder && customer && (
        <div className="sticky top-16 z-20 mt-4 flex items-center gap-3 rounded-2xl bg-warning-soft px-4 py-3 text-sm ring-1 ring-warning/25 md:top-[76px]">
          <UserRound className="size-4 shrink-0 text-warning" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold text-warning">{customer.name}</span>{" "}
            <span className="text-muted-foreground">adına işlem yapıyorsunuz · {user.user} olarak kaydedilecek</span>
          </p>
        </div>
      )}

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {/* 1 — Müşteri */}
          <Step n={1} title="Müşteri" done={!!customer}>
            {customer && detail ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3.5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-sm font-bold text-primary-soft-foreground">{initialsOf(customer.name)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{customer.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {customer.group} · %{groupRate(customer.group)} iskonto · {detail.specialPrices.length} özel fiyat · {limitText(available)}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setCustomer(null)}>
                  Değiştir
                </Button>
                {(customer.overdue > 0 || customer.status === "blocked") && (
                  <p className="flex w-full items-center gap-1.5 rounded-lg bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    {customer.status === "blocked" ? "Müşteri sipariş blokesinde; sipariş onaya düşer." : `${formatTRY(customer.overdue, { whole: true })} vadesi geçmiş borcu var.`}
                  </p>
                )}
              </div>
            ) : (
              <CustomerPicker onPick={setCustomer} />
            )}
          </Step>

          {/* 2 — Ürünler */}
          <Step n={2} title="Ürünler" done={lines.length > 0} disabled={!customer}>
            <ProductPicker onPick={add} disabled={!customer} />
            {priced.length > 0 && (
              <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
                {priced.map((l) => (
                  <li key={l.product.id} className="flex flex-col gap-3 p-3.5 md:flex-row md:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-border">
                        <Image src={l.product.image} alt="" fill sizes="48px" className="object-contain p-1" />
                      </div>
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-semibold">{l.product.name}</p>
                        <p className="tabular text-[11px] text-muted-foreground">
                          Liste {formatTRY(l.product.listPrice)} ·{" "}
                          {l.special ? (
                            <span className="font-semibold text-primary">
                              <Sparkles className="inline size-3" /> özel fiyat
                            </span>
                          ) : (
                            `grup %${groupRate(customer!.group)}`
                          )}{" "}
                          → {formatTRY(l.base)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <QtyStepper value={l.qty} onChange={(n) => setLines((ls) => (n <= 0 ? ls.filter((x) => x.product.id !== l.product.id) : ls.map((x) => (x.product.id === l.product.id ? { ...x, qty: n } : x))))} size="sm" className="w-28" />
                      <label
                        className={cn(
                          "flex h-9 w-20 items-center rounded-full border bg-card px-3 text-sm",
                          l.extra > maxExtra ? "border-warning ring-2 ring-warning/20" : "border-border",
                        )}
                        title="Ek iskonto"
                      >
                        <span className="text-muted-foreground">%</span>
                        <input
                          inputMode="numeric"
                          value={l.extra || ""}
                          placeholder="0"
                          onChange={(e) => {
                            const n = Math.min(Number(e.target.value.replace(/\D/g, "")) || 0, 50);
                            setLines((ls) => ls.map((x) => (x.product.id === l.product.id ? { ...x, extra: n } : x)));
                          }}
                          className="tabular w-full bg-transparent text-right font-semibold outline-none"
                          aria-label="Ek iskonto yüzdesi"
                        />
                      </label>
                      <div className="ml-auto w-28 text-right">
                        <p className="tabular text-sm font-bold">{formatTRY(l.total)}</p>
                        <p className="tabular text-[11px] text-muted-foreground">{formatTRY(l.unit)} / adet</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLines((ls) => ls.filter((x) => x.product.id !== l.product.id))}
                        className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
                        aria-label="Kaldır"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {overAuthority && (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3 text-xs font-medium text-warning">
                <AlertTriangle className="mt-px size-3.5 shrink-0" />
                Ek iskonto yetki sınırınızı (%{maxExtra}) aşıyor. {isOrder ? "Sipariş" : "Teklif"} gönderilmeden önce yönetici onayına düşecek.
              </p>
            )}
          </Step>

          {/* 3 — Koşullar */}
          <Step n={3} title={isOrder ? "Teslimat ve ödeme" : "Teslimat ve geçerlilik"} disabled={!lines.length}>
            <div className="grid grid-cols-2 gap-2">
              <Choice active={delivery === "customer"} onClick={() => setDelivery("customer")} icon={Truck} title="Müşteri adresine" hint={customer ? `${customer.city} · kayıtlı adres` : "Kayıtlı adres"} />
              <Choice active={delivery === "pickup"} onClick={() => setDelivery("pickup")} icon={Factory} title="Fabrikadan teslim" hint="Müşteri teslim alır" />
            </div>
            {isOrder ? (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium">Ödeme</p>
                <div className="grid grid-cols-2 gap-2">
                  <Choice active={payment === "account"} onClick={() => setPayment("account")} title="Cariye işle" hint={limitText(available)} />
                  <Choice active={payment === "link"} onClick={() => setPayment("link")} title="Ödeme linki gönder" hint="Müşteri kartla öder" />
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium">Teklif geçerliliği</span>
                <div className="inline-flex rounded-full bg-muted p-1">
                  {["7", "15", "30"].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setValidity(d)}
                      className={cn("h-8 rounded-full px-3.5 text-xs font-semibold", validity === d ? "bg-card shadow-card" : "text-muted-foreground")}
                    >
                      {d} gün
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label className="mt-4 block text-sm">
              <span className="mb-1.5 block font-medium">{isOrder ? "Sipariş notu" : "Müşteriye not"}</span>
              <textarea
                rows={3}
                placeholder={isOrder ? "Üretim veya teslimat notu" : "Teklifte görünecek açıklama"}
                className="w-full resize-none rounded-xl border border-input bg-card px-4 py-3 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </label>
          </Step>
        </div>

        {/* Özet */}
        <aside className="space-y-4 lg:sticky lg:top-[92px]">
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">{isOrder ? "Sipariş özeti" : "Teklif özeti"}</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <Row label="Liste toplamı" value={formatTRY(list)} muted />
              <Row label={customer ? `Grup / özel fiyat (${customer.group})` : "Grup iskontosu"} value={`−${formatTRY(list - groupNet)}`} success />
              {groupNet - subtotal > 0 && <Row label="Ek iskonto" value={`−${formatTRY(groupNet - subtotal)}`} success />}
              <Row label="Ara toplam" value={formatTRY(subtotal)} />
              <Row label="KDV (%20)" value={formatTRY(vat)} muted />
            </dl>
            <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
              <span className="text-sm font-semibold">Genel toplam</span>
              <span className="tabular text-2xl font-bold tracking-tight">{formatTRY(total)}</span>
            </div>

            {!isOrder && (
              <div className="mt-4 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">Gönderim kanalı</p>
                {(
                  [
                    { key: "portal", label: "Müşteri portalı", icon: MonitorSmartphone },
                    { key: "email", label: "E-posta (PDF)", icon: Mail },
                    { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
                  ] as const
                ).map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1 text-sm">
                    <input type="checkbox" checked={channels[c.key]} onChange={(e) => setChannels((s) => ({ ...s, [c.key]: e.target.checked }))} className="size-4 accent-[var(--primary)]" />
                    <c.icon className="size-4 text-muted-foreground" /> {c.label}
                  </label>
                ))}
              </div>
            )}

            {needsApproval && lines.length > 0 && (
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-xs font-medium text-warning">
                <AlertTriangle className="mt-px size-3.5 shrink-0" />
                {limitExceeded ? "Kredi limiti aşılıyor. " : ""}
                {overAuthority ? "Ek iskonto yetki sınırını aşıyor. " : ""}
                {isOrder && customer?.status === "blocked" ? "Müşteri bloke. " : ""}
                Yönetici onayına gönderilecek.
              </p>
            )}

            <div className="mt-5 hidden gap-2 lg:grid">
              <Submit mode={mode} approval={needsApproval} disabled={!customer || !lines.length} onClick={() => setDone({ id: isOrder ? "SP-2026-0991" : "TK-2026-0321", approval: needsApproval })} />
              {!isOrder && (
                <Button variant="outline" disabled={!customer || !lines.length}>
                  Taslak olarak kaydet
                </Button>
              )}
            </div>
          </Card>
        </aside>
      </div>

      {/* Mobil sabit çubuk */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-[11px] text-muted-foreground">Genel toplam</p>
            <p className="tabular text-lg font-bold">{formatTRY(total)}</p>
          </div>
          <Submit mode={mode} approval={needsApproval} disabled={!customer || !lines.length} onClick={() => setDone({ id: isOrder ? "SP-2026-0991" : "TK-2026-0321", approval: needsApproval })} compact />
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, done, disabled, children }: { n: number; title: string; done?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Card className={cn("p-4 transition-opacity md:p-5", disabled && "pointer-events-none opacity-50")}>
      <div className="mb-4 flex items-center gap-3">
        <span className={cn("grid size-7 place-items-center rounded-full text-xs font-bold", done ? "bg-success text-white" : "bg-primary text-primary-foreground")}>
          {done ? <Check className="size-3.5" strokeWidth={3} /> : n}
        </span>
        <h2 className="text-[15px] font-semibold">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

function CustomerPicker({ onPick }: { onPick: (c: AdminCustomer) => void }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const query = q.trim().toLocaleLowerCase("tr");
    return adminCustomers.filter((c) => !query || `${c.name} ${c.city} ${c.id}`.toLocaleLowerCase("tr").includes(query));
  }, [q]);
  return (
    <div>
      <label className="flex h-11 items-center gap-2.5 rounded-xl border border-input bg-card px-4 text-sm focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
        <Search className="size-4 text-muted-foreground" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Firma adı, şehir veya cari kodu" className="w-full bg-transparent outline-none placeholder:text-muted-foreground" />
      </label>
      <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto">
        {list.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => onPick(c)} className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-muted/70">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-xs font-bold">{initialsOf(c.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{c.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {c.id} · {c.city} · {c.group} %{groupRate(c.group)}
                </span>
              </span>
              {c.status === "blocked" ? <Badge tone="danger">Bloke</Badge> : c.overdue > 0 ? <Badge tone="warning">Gecikme</Badge> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProductPicker({ onPick, disabled }: { onPick: (p: Product) => void; disabled?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    const query = q.trim().toLocaleLowerCase("tr");
    return products.filter((p) => !query || `${p.name} ${p.sku}`.toLocaleLowerCase("tr").includes(query)).slice(0, 8);
  }, [q]);
  return (
    <div className="relative">
      <label className="flex h-11 items-center gap-2.5 rounded-xl border border-input bg-card px-4 text-sm focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
        <Plus className="size-4 text-muted-foreground" />
        <input
          disabled={disabled}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Ürün ekle: ad veya stok kodu yazın"
          className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </label>
      {open && (
        <ul className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-pop">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(p);
                  setQ("");
                }}
                className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted/70"
              >
                <span className="relative size-10 shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-border">
                  <Image src={p.image} alt="" fill sizes="40px" className="object-contain p-0.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block text-[11px] text-muted-foreground">{p.sku}</span>
                </span>
                <span className="tabular text-xs font-semibold">{formatTRY(p.listPrice, { whole: true })}</span>
              </button>
            </li>
          ))}
          {!results.length && <li className="p-4 text-center text-sm text-muted-foreground">Ürün bulunamadı</li>}
        </ul>
      )}
    </div>
  );
}

function Choice({
  active,
  onClick,
  icon: Icon,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex items-center gap-3 rounded-xl border p-3 text-left transition-colors", active ? "border-primary bg-primary-soft/60" : "border-border hover:bg-muted/50")}
    >
      {Icon && (
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
          <Icon className="size-[18px]" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

function Row({ label, value, muted, success }: { label: string; value: string; muted?: boolean; success?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3", muted && "text-muted-foreground", success && "text-success")}>
      <dt className="min-w-0 truncate">{label}</dt>
      <dd className="tabular shrink-0 font-medium">{value}</dd>
    </div>
  );
}

function Submit({ mode, approval, disabled, onClick, compact }: { mode: Mode; approval: boolean; disabled: boolean; onClick: () => void; compact?: boolean }) {
  const label = approval ? "Onaya gönder" : mode === "order" ? "Siparişi oluştur" : "Müşteriye gönder";
  return (
    <Button size="lg" disabled={disabled} onClick={onClick} className={compact ? "px-5" : "w-full"}>
      {mode === "quote" && !approval && <Send />} {label}
    </Button>
  );
}

const quoteFlow = ["Taslak", "Gönderildi", "Müşteri değerlendirmesinde", "Kabul / Red"];

function Done({ mode, id, approval, customer, total }: { mode: Mode; id: string; approval: boolean; customer: AdminCustomer; total: number }) {
  const isOrder = mode === "order";
  const reached = approval ? 1 : 2;
  return (
    <div className="mx-auto max-w-lg pt-4 md:pt-10">
      <Card className="p-6 md:p-8">
        <span className={cn("mx-auto grid size-16 place-items-center rounded-full", approval ? "bg-warning-soft text-warning" : "bg-success-soft text-success")}>
          {approval ? <AlertTriangle className="size-7" /> : <CheckCircle2 className="size-8" />}
        </span>
        <h1 className="mt-4 text-center text-xl font-bold">
          {approval ? "Yönetici onayına gönderildi" : isOrder ? "Sipariş oluşturuldu" : "Teklif müşteriye gönderildi"}
        </h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {id} · {customer.name} · <span className="tabular font-semibold text-foreground">{formatTRY(total)}</span>
        </p>

        {!isOrder && (
          <ol className="mt-6 space-y-3">
            {quoteFlow.map((s, i) => (
              <li key={s} className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                    i < reached ? "bg-primary text-primary-foreground" : i === reached ? "bg-warning-soft text-warning ring-4 ring-warning/15" : "bg-muted text-muted-foreground",
                  )}
                >
                  {i < reached ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span className={cn("text-sm", i <= reached ? "font-semibold" : "text-muted-foreground")}>{s}</span>
              </li>
            ))}
          </ol>
        )}

        <p className="mt-5 flex gap-2 rounded-xl bg-muted px-4 py-3 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" />
          {isOrder
            ? "Sipariş müşterinin portalında görünür; müşteriye e-posta ve SMS bildirimi gider."
            : "Müşteri portalda teklifi kabul ederse yeniden veri girişi olmadan siparişe dönüşür. Süre dolarsa teklif otomatik olarak “Süresi doldu” durumuna geçer."}
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" size="lg" className="sm:flex-1">
            <Download /> PDF
          </Button>
          <Link href={isOrder ? "/panel/uretim" : "/panel/teklifler"} className={cn(buttonVariants({ size: "lg" }), "sm:flex-1")}>
            {isOrder ? "Üretim panosu" : "Tekliflere dön"}
          </Link>
        </div>
      </Card>
    </div>
  );
}
