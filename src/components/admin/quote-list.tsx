"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, FilePlus2 } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatDate, formatTRY } from "@/lib/utils";

type QuoteStatus = "draft" | "sent" | "review" | "accepted" | "rejected" | "expired";

const statusMeta: Record<QuoteStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: "Taslak", tone: "neutral" },
  sent: { label: "Gönderildi", tone: "info" },
  review: { label: "Müşteri değerlendirmesinde", tone: "warning" },
  accepted: { label: "Kabul edildi", tone: "success" },
  rejected: { label: "Reddedildi", tone: "danger" },
  expired: { label: "Süresi doldu", tone: "neutral" },
};

const quotes: { id: string; customer: string; rep: string; title: string; total: number; date: string; validUntil: string; status: QuoteStatus; order?: string }[] = [
  { id: "TK-2026-0320", customer: "Kapadokya Etkinlik", rep: "Ozan Tekin", title: "3x6 gazebo 4 duvar · 2 adet", total: 85_944, date: "2026-10-16", validUntil: "2026-10-31", status: "draft" },
  { id: "TK-2026-0318", customer: "Marmara Fuarcılık", rep: "Elif Kaya", title: "3x6 gazebo · 3 adet", total: 95_550, date: "2026-10-15", validUntil: "2026-10-30", status: "sent" },
  { id: "TK-2026-0312", customer: "Akdeniz Reklam Ltd. Şti.", rep: "Elif Kaya", title: "Fuar standı paketi · 4 kalem", total: 64_500, date: "2026-10-14", validUntil: "2026-10-21", status: "review" },
  { id: "TK-2026-0305", customer: "Başkent Organizasyon", rep: "Deniz Yurt", title: "Beach flag · 40 adet", total: 26_350, date: "2026-10-02", validUntil: "2026-10-17", status: "review" },
  { id: "TK-2026-0299", customer: "Ege Promosyon A.Ş.", rep: "Ozan Tekin", title: "Örümcek stand 300x225 · 6 adet", total: 96_480, date: "2026-10-01", validUntil: "2026-10-16", status: "accepted", order: "SP-2026-0985" },
  { id: "TK-2026-0291", customer: "Karadeniz Matbaa", rep: "Deniz Yurt", title: "Roll-up · 50 adet", total: 84_000, date: "2026-09-26", validUntil: "2026-10-11", status: "rejected" },
  { id: "TK-2026-0284", customer: "Başkent Organizasyon", rep: "Deniz Yurt", title: "A pano · 10 adet", total: 25_920, date: "2026-09-20", validUntil: "2026-10-05", status: "expired" },
];

const tabs: { key: QuoteStatus | "all" | "open"; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "open", label: "Açık" },
  { key: "draft", label: "Taslak" },
  { key: "accepted", label: "Kabul" },
  { key: "rejected", label: "Red" },
  { key: "expired", label: "Süresi doldu" },
];

export function QuoteList() {
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("all");
  const match = (s: QuoteStatus) => tab === "all" || (tab === "open" ? s === "sent" || s === "review" : s === tab);
  const rows = quotes.filter((q) => match(q.status));
  const accepted = quotes.filter((q) => q.status === "accepted").length;
  const decided = quotes.filter((q) => ["accepted", "rejected", "expired"].includes(q.status)).length;

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Teklifler</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dönüşüm oranı <span className="font-semibold text-foreground">%{Math.round((accepted / decided) * 100)}</span> · kabul edilen teklifler otomatik siparişe dönüşür
          </p>
        </div>
        <Link href="/panel/teklifler/yeni" className={buttonVariants()}>
          <FilePlus2 /> Yeni teklif
        </Link>
      </div>

      <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
        {tabs.map((t) => {
          const count = quotes.filter((q) => t.key === "all" || (t.key === "open" ? q.status === "sent" || q.status === "review" : q.status === t.key)).length;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors",
                tab === t.key ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label} <span className="text-[11px] opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <Card className="mt-4 overflow-hidden">
        <ul className="divide-y divide-border">
          {rows.map((q) => {
            const st = statusMeta[q.status];
            return (
              <li key={q.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-4 md:grid-cols-[1.6fr_1.3fr_1fr_0.9fr] md:gap-4 md:px-5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{q.customer}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {q.id} · {q.title}
                  </p>
                </div>
                <p className="tabular text-right text-sm font-bold md:order-last">{formatTRY(q.total, { whole: true })}</p>
                <div className="col-span-2 flex flex-wrap items-center gap-2 md:col-span-1">
                  <Badge tone={st.tone}>{st.label}</Badge>
                  {q.order && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                      <ArrowRightLeft className="size-3" /> {q.order}
                    </span>
                  )}
                </div>
                <p className="col-span-2 text-xs text-muted-foreground md:col-span-1">
                  {q.rep} · Son geçerlilik {formatDate(q.validUntil, { day: "numeric", month: "short" })}
                </p>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
