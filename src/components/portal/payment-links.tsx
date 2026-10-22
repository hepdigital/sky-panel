"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, ExternalLink, Info, Link2, MessageCircle, Plus, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { paymentLinks, type PaymentLink } from "@/lib/ledger";
import { currentCustomer } from "@/lib/mock";
import { cn, formatDate, formatTRY } from "@/lib/utils";
import { MoneyInput } from "./pay-layout";

const validity = [
  { key: "1", label: "24 saat" },
  { key: "3", label: "3 gün" },
  { key: "7", label: "7 gün" },
] as const;

const statusMeta: Record<PaymentLink["status"], { label: string; tone: "warning" | "success" | "neutral" }> = {
  pending: { label: "Ödeme bekleniyor", tone: "warning" },
  paid: { label: "Ödendi", tone: "success" },
  expired: { label: "Süresi doldu", tone: "neutral" },
};

export function PaymentLinks() {
  const [customer, setCustomer] = useState("Mavi Kafe");
  const [phone, setPhone] = useState("0535 777 88 99");
  const [amount, setAmount] = useState(12_000);
  const [desc, setDesc] = useState("Baskılı gazebo çadır · 2 adet");
  const [target, setTarget] = useState<"debt" | "prepaid">("debt");
  const [days, setDays] = useState<(typeof validity)[number]["key"]>("3");
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const message = created
    ? `Merhaba, ${currentCustomer.firmName} olarak ${formatTRY(amount)} tutarındaki ödemeniz için güvenli ödeme linkiniz: ${created}`
    : "";
  const waPhone = "90" + phone.replace(/\D/g, "").replace(/^0/, "");

  return (
    <div className="mx-auto max-w-[1200px]">
      <Link href="/portal/cari" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Cari hesap
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight md:text-[28px]">Ödeme linki</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Müşterinize kartla ödeme linki gönderin; tahsil edilen tutar hesabınıza işlensin.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_400px]">
        {created ? (
          <Card className="p-5 md:p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-success-soft text-success">
                <Check className="size-5" strokeWidth={3} />
              </span>
              <div>
                <p className="font-semibold">Link hazır</p>
                <p className="text-sm text-muted-foreground">
                  {customer} · {formatTRY(amount)} · {validity.find((v) => v.key === days)!.label} geçerli
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-2 rounded-xl border border-border bg-muted/60 p-2 pl-4">
              <Link2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{created}</span>
              <Button
                size="sm"
                variant={copied ? "soft" : "primary"}
                onClick={() => {
                  navigator.clipboard?.writeText(created).catch(() => {});
                  setCopied(true);
                }}
              >
                {copied ? <Check /> : <Copy />} {copied ? "Kopyalandı" : "Kopyala"}
              </Button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <a
                href={`https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ size: "lg" }), "bg-[#1f8f4e] text-white hover:bg-[#197a42]")}
              >
                <MessageCircle /> WhatsApp
              </a>
              <a href={`sms:${phone.replace(/\s/g, "")}?body=${encodeURIComponent(message)}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
                <Smartphone /> SMS
              </a>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-5">
              <Link href="/odeme/demo" target="_blank" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                <ExternalLink /> Müşteri ekranını önizle
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCreated(null);
                  setCopied(false);
                }}
              >
                <Plus /> Yeni link oluştur
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-5 md:p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Müşteri / firma adı" value={customer} onChange={setCustomer} />
              <TextField label="Cep telefonu" value={phone} onChange={setPhone} inputMode="tel" />
            </div>

            <p className="mt-4 mb-1.5 text-sm font-medium">Tutar</p>
            <MoneyInput value={amount} onChange={setAmount} />

            <div className="mt-4">
              <TextField label="Açıklama (müşteri görür)" value={desc} onChange={setDesc} />
            </div>

            <p className="mt-5 mb-2 text-sm font-medium">Tahsil edilen tutar nereye işlensin?</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  { key: "debt", title: "Cari borcumdan düşülsün", hint: "Açık faturalarınızı kapatır" },
                  { key: "prepaid", title: "Ön ödeme bakiyeme eklensin", hint: "Sonraki siparişlerde kullanılır" },
                ] as const
              ).map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setTarget(o.key)}
                  className={cn(
                    "rounded-xl border p-3.5 text-left transition-colors",
                    target === o.key ? "border-primary bg-primary-soft/60" : "border-border hover:bg-muted/50",
                  )}
                >
                  <span className="block text-sm font-semibold">{o.title}</span>
                  <span className="block text-xs text-muted-foreground">{o.hint}</span>
                </button>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-medium">Geçerlilik süresi</span>
              <div className="inline-flex rounded-full bg-muted p-1">
                {validity.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => setDays(v.key)}
                    className={cn(
                      "h-8 rounded-full px-3.5 text-xs font-semibold transition-colors",
                      days === v.key ? "bg-card text-foreground shadow-card" : "text-muted-foreground",
                    )}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="mt-5 flex gap-2 rounded-xl bg-info-soft px-4 py-3 text-xs text-info">
              <Info className="mt-px size-3.5 shrink-0" />
              Ödeme Sky Görsel Çözümler sanal POS&apos;u üzerinden alınır; müşteriniz ekranda firmanızın adını görür. Ödeme
              onaylandığında size bildirim gelir ve tutar seçtiğiniz hesaba işlenir.
            </p>

            <Button
              size="lg"
              className="mt-5 w-full"
              disabled={!customer.trim() || amount <= 0}
              onClick={() => setCreated(`${window.location.origin}/odeme/demo`)}
            >
              <Link2 /> Linki oluştur
            </Button>
          </Card>
        )}

        {/* Gönderilen linkler */}
        <Card className="overflow-hidden">
          <CardHeader title="Gönderilen linkler" description="Son 90 gün" className="pb-4" />
          <ul className="divide-y divide-border border-t border-border">
            {paymentLinks.map((l) => {
              const s = statusMeta[l.status];
              return (
                <li key={l.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{l.customer}</p>
                      <p className="truncate text-xs text-muted-foreground">{l.description}</p>
                    </div>
                    <p className="tabular text-sm font-bold">{formatTRY(l.amount)}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone={s.tone}>{s.label}</Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {l.target === "debt" ? "Borçtan düşülür" : "Bakiyeye eklenir"} · Son{" "}
                      {formatDate(l.expires, { day: "numeric", month: "short" })}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium">{label}</span>
      <input
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-input bg-card px-4 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
      />
    </label>
  );
}
