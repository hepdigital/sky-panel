"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { adminCustomers, groupRate, type AdminCustomer } from "@/lib/admin-mock";
import { cn, formatTRY } from "@/lib/utils";
import { useRole } from "./role-context";

const filters = [
  { key: "all", label: "Tümü", match: () => true },
  { key: "mine", label: "Müşterilerim", match: (c: AdminCustomer, me: string) => c.rep === me },
  { key: "overdue", label: "Gecikmeli", match: (c: AdminCustomer) => c.overdue > 0 },
  { key: "blocked", label: "Bloke", match: (c: AdminCustomer) => c.status === "blocked" },
] as const;

export const statusMeta = {
  active: { label: "Aktif", tone: "success" },
  blocked: { label: "Sipariş bloke", tone: "danger" },
  prospect: { label: "Aday", tone: "neutral" },
} as const;

export function initialsOf(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toLocaleUpperCase("tr");
}

export function CustomerList() {
  const { user } = useRole();
  const [filter, setFilter] = useState<(typeof filters)[number]["key"]>("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const f = filters.find((x) => x.key === filter)!;
    const query = q.trim().toLocaleLowerCase("tr");
    return adminCustomers.filter(
      (c) => f.match(c, user.user) && (!query || `${c.name} ${c.city} ${c.id}`.toLocaleLowerCase("tr").includes(query)),
    );
  }, [filter, q, user.user]);

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Müşteriler</h1>
          <p className="mt-1 text-sm text-muted-foreground">{adminCustomers.length} kayıtlı müşteri · bayi ve kurumsal</p>
        </div>
        <Link href="/panel/musteriler/yeni" className={buttonVariants()}>
          <UserPlus /> Yeni müşteri
        </Link>
      </div>

      <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
        <label className="flex h-11 flex-1 items-center gap-2.5 rounded-full border border-border bg-card px-4 text-sm shadow-card focus-within:ring-2 focus-within:ring-ring md:max-w-sm">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Firma, şehir veya cari kodu ara"
            className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
          {filters.map((f) => {
            const count = adminCustomers.filter((c) => f.match(c, user.user)).length;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors",
                  filter === f.key ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
                <span className="text-[11px] opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="hidden grid-cols-[2fr_1fr_1fr_1.2fr_1fr_1fr_16px] gap-4 border-b border-border px-5 py-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase lg:grid">
          <span>Firma</span>
          <span>İskonto grubu</span>
          <span>Temsilci</span>
          <span>Limit kullanımı</span>
          <span className="text-right">Bakiye</span>
          <span className="text-right">Gecikme</span>
          <span />
        </div>
        <ul className="divide-y divide-border">
          {rows.map((c) => {
            const usage = Math.round((c.balance / c.limit) * 100);
            const st = statusMeta[c.status];
            return (
              <li key={c.id}>
                <Link
                  href={`/panel/musteriler/${c.id}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-4 transition-colors hover:bg-muted/60 md:px-5 lg:grid-cols-[2fr_1fr_1fr_1.2fr_1fr_1fr_16px] lg:gap-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-xs font-bold text-primary-soft-foreground">
                      {initialsOf(c.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{c.name}</p>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {c.id} · {c.city}
                        {c.status !== "active" && <Badge tone={st.tone} className="ml-1 py-0.5">{st.label}</Badge>}
                      </p>
                    </div>
                  </div>
                  <div className="text-right lg:hidden">
                    <p className="tabular text-sm font-bold">{formatTRY(c.balance, { whole: true })}</p>
                    {c.overdue > 0 ? (
                      <p className="tabular text-[11px] font-semibold text-danger">{formatTRY(c.overdue, { whole: true })} gecikme</p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Gecikme yok</p>
                    )}
                  </div>
                  <span className="hidden text-sm lg:block">
                    {c.group} <span className="text-muted-foreground">· %{groupRate(c.group)}</span>
                  </span>
                  <span className="hidden text-sm text-muted-foreground lg:block">{c.rep}</span>
                  <div className="col-span-2 flex items-center gap-2 lg:col-span-1">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full", usage > 100 ? "bg-danger" : usage > 80 ? "bg-warning" : "bg-primary")} style={{ width: `${Math.min(usage, 100)}%` }} />
                    </div>
                    <span className={cn("tabular w-10 text-right text-xs font-semibold", usage > 100 && "text-danger")}>%{usage}</span>
                    <span className="text-[11px] text-muted-foreground lg:hidden">
                      · {c.group} · {c.rep}
                    </span>
                  </div>
                  <span className="tabular hidden text-right text-sm font-semibold lg:block">{formatTRY(c.balance, { whole: true })}</span>
                  <span className={cn("tabular hidden text-right text-sm lg:block", c.overdue ? "font-semibold text-danger" : "text-muted-foreground")}>
                    {c.overdue ? formatTRY(c.overdue, { whole: true }) : "—"}
                  </span>
                  <ChevronRight className="hidden size-4 text-muted-foreground lg:block" />
                </Link>
              </li>
            );
          })}
        </ul>
        {!rows.length && <p className="p-10 text-center text-sm text-muted-foreground">Eşleşen müşteri yok.</p>}
      </Card>
    </div>
  );
}
