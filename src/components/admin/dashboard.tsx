"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, Eye, FilePlus2, FileText, ListPlus, Send, Wallet, type LucideIcon } from "lucide-react";
import { OrderBadge, ORDER_STATUS, type OrderStatus } from "@/components/orders/order-views";
import { ASAMA } from "@/components/terminal/quote-flow";
import { Avatar, PriorityTag, STATUS, dueText } from "@/components/tasks/task-meta";
import type { TaskRow } from "@/components/tasks/task-board";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatDate, formatTRY } from "@/lib/utils";
import type { DashboardData, Period } from "@/server/dashboard";

const PERIODS: { id: Period; label: string }[] = [
  { id: "ay", label: "Bu ay" },
  { id: "30", label: "Son 30 gün" },
  { id: "yil", label: "Bu yıl" },
  { id: "tum", label: "Tümü" },
];
const OPEN: OrderStatus[] = ["alindi", "uretimde", "hazir", "kargoda"];
const TL = (n: number) => formatTRY(n, { whole: true });
const pct = (n: number) => `%${Math.round(n * 100)}`;
const when = (iso: string) => formatDate(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

type Props = {
  greeting: { hello: string; date: string; name: string };
  role: "yonetici" | "satis" | "personel";
  period: Period;
  data: DashboardData | null;
  tasks: TaskRow[];
};

/** Dashboard: yalnızca veritabanındaki kayıtlar. Yönetici herkesi, satışçı kendini, personel görevlerini görür. */
export function Dashboard({ greeting, role, period, data, tasks }: Props) {
  const admin = role === "yonetici";
  return (
    <div className="mx-auto max-w-[1400px] space-y-5 md:space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <p className="text-sm text-muted-foreground">{greeting.date}</p>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">
            {greeting.hello}, {greeting.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{admin ? "Ekibin teklif, sipariş ve görev özeti." : role === "satis" ? "Tekliflerinin, siparişlerinin ve görevlerinin özeti." : "Sana atanan görevler."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data && (
            <div className="inline-flex rounded-full bg-muted p-1">
              {PERIODS.map((p) => (
                <Link key={p.id} href={p.id === "ay" ? "/panel" : `/panel?donem=${p.id}`} className={cn("flex h-9 items-center rounded-full px-3.5 text-sm font-semibold", period === p.id ? "bg-card shadow-card" : "text-muted-foreground")}>
                  {p.label}
                </Link>
              ))}
            </div>
          )}
          {data ? (
            <Link href="/panel/teklifler/yeni" className={buttonVariants()}>
              <FilePlus2 /> Yeni teklif
            </Link>
          ) : (
            <Link href="/panel/gorevler?yeni=1" className={buttonVariants()}>
              <ListPlus /> Yeni görev
            </Link>
          )}
        </div>
      </section>

      {data && (
        <>
          <section className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            <Kpi icon={FileText} label="Verilen teklif" value={String(data.teklif.adet)} hint={TL(data.teklif.tutar)} />
            <Kpi icon={Send} label="Müşteriye gönderilen" value={String(data.teklif.gonderilen)} hint={`${data.teklif.gorulen} tanesi görüldü · ${data.teklif.bekleyen} yanıt bekliyor`} />
            <Kpi icon={CheckCircle2} label="Onaylanan teklif" value={String(data.teklif.onaylanan)} hint={`Dönüşüm ${data.teklif.adet ? pct(data.teklif.onaylanan / data.teklif.adet) : "—"}${data.teklif.reddedilen ? ` · ${data.teklif.reddedilen} red` : ""}`} tone="success" />
            <Kpi icon={Wallet} label="Sipariş (KDV dahil)" value={TL(data.siparis.tutar)} hint={`${data.siparis.adet} sipariş`} tone="primary" />
          </section>

          <section className="grid gap-4 md:gap-5 lg:grid-cols-12">
            <div className="min-w-0 space-y-4 md:space-y-5 lg:col-span-8">
              {admin && <Performance rows={data.performans} />}
              <RecentQuotes rows={data.sonTeklifler} admin={admin} />
              <RecentOrders rows={data.sonSiparisler} admin={admin} />
            </div>
            <div className="min-w-0 space-y-4 md:space-y-5 lg:col-span-4">
              <OpenOrders acik={data.acik} />
              <MyTasks tasks={tasks} />
            </div>
          </section>
        </>
      )}

      {!data && <MyTasks tasks={tasks} big />}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint, tone }: { icon: LucideIcon; label: string; value: string; hint: string; tone?: "success" | "primary" }) {
  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className={cn("grid size-8 place-items-center rounded-xl bg-muted text-muted-foreground", tone === "success" && "bg-success-soft text-success", tone === "primary" && "bg-primary-soft text-primary")}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="tabular mt-2 text-xl font-bold tracking-tight md:text-2xl">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </Card>
  );
}

function Section({ title, href, children, action }: { title: string; href?: string; children: React.ReactNode; action?: string }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {href && (
          <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
            {action ?? "Tümü"} <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="border-t border-border px-5 py-8 text-center text-sm text-muted-foreground">{text}</p>;
}

/** Yönetici: kim kaç teklif verdi, ne kadarı onaylandı, ne kadar sipariş aldı */
function Performance({ rows }: { rows: DashboardData["performans"] }) {
  return (
    <Section title="Satışçı performansı">
      {!rows.length ? (
        <Empty text="Bu dönemde teklif yok." />
      ) : (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-2.5">Satışçı</th>
                <th className="px-3 py-2.5 text-right">Teklif</th>
                <th className="px-3 py-2.5 text-right">Teklif tutarı</th>
                <th className="px-3 py-2.5 text-right">Onay</th>
                <th className="px-3 py-2.5 text-right">Sipariş</th>
                <th className="px-5 py-2.5 text-right">Ciro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border border-t border-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2 font-semibold">
                      <Avatar name={r.adSoyad} /> {r.adSoyad}
                      {!r.aktif && <Badge tone="neutral">Pasif</Badge>}
                    </span>
                  </td>
                  <td className="tabular px-3 py-3 text-right">{r.teklif}</td>
                  <td className="tabular px-3 py-3 text-right text-muted-foreground">{TL(r.teklifTutar)}</td>
                  <td className="tabular px-3 py-3 text-right">
                    {r.onay} <span className="text-[11px] text-muted-foreground">{r.teklif ? pct(r.oran) : ""}</span>
                  </td>
                  <td className="tabular px-3 py-3 text-right">{r.siparis}</td>
                  <td className="tabular px-5 py-3 text-right font-bold">{TL(r.ciro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function RecentQuotes({ rows, admin }: { rows: DashboardData["sonTeklifler"]; admin: boolean }) {
  return (
    <Section title="Son teklifler" href="/panel/teklifler">
      {!rows.length ? (
        <Empty text="Henüz teklif yok." />
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((t) => (
            <li key={t.id}>
              <Link href={`/panel/teklifler/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{t.musteri || "—"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.no} · {when(t.olusturma)}
                    {admin && t.satisci ? ` · ${t.satisci}` : ""}
                  </p>
                </div>
                {t.ilkGorulme && t.asama === "gonderildi" && (
                  <span title="Müşteri görüntüledi" className="text-info">
                    <Eye className="size-4" />
                  </span>
                )}
                <Badge tone={ASAMA[t.asama].tone}>{ASAMA[t.asama].label}</Badge>
                <span className="tabular w-24 shrink-0 text-right text-sm font-bold">{TL(t.dahil)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function RecentOrders({ rows, admin }: { rows: DashboardData["sonSiparisler"]; admin: boolean }) {
  return (
    <Section title="Son siparişler" href="/panel/siparisler">
      {!rows.length ? (
        <Empty text="Henüz sipariş yok. Onaylanan teklifler “Siparişe dönüştür” ile siparişe döner." />
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((o) => (
            <li key={o.id}>
              <Link href={`/panel/siparisler/${o.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{o.musteri || "—"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {o.no} · {when(o.olusturma)}
                    {admin && o.satisci ? ` · ${o.satisci}` : ""}
                  </p>
                </div>
                <OrderBadge durum={o.durum} />
                <span className="tabular w-24 shrink-0 text-right text-sm font-bold">{TL(o.dahil)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Teslim edilmemiş siparişler, durumlarına göre */
function OpenOrders({ acik }: { acik: DashboardData["acik"] }) {
  const total = OPEN.reduce((a, s) => a + (acik[s] ?? 0), 0);
  return (
    <Section title="Açık siparişler" href="/panel/siparisler">
      <ul className="grid grid-cols-2 gap-2 border-t border-border p-3">
        {OPEN.map((s) => {
          const st = ORDER_STATUS[s];
          const Icon = st.icon;
          return (
            <li key={s} className="rounded-xl bg-muted/50 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Icon className="size-3.5" /> {st.label}
              </p>
              <p className="tabular mt-0.5 text-lg font-bold">{acik[s] ?? 0}</p>
            </li>
          );
        })}
      </ul>
      {!total && <p className="px-5 pb-4 text-xs text-muted-foreground">Bekleyen sipariş yok.</p>}
    </Section>
  );
}

function MyTasks({ tasks, big }: { tasks: TaskRow[]; big?: boolean }) {
  return (
    <Section title="Görevlerim" href="/panel/gorevler" action="Tüm görevler">
      {!tasks.length ? (
        <Empty text="Sana atanmış açık görev yok." />
      ) : (
        <ul className={cn("divide-y divide-border border-t border-border", big && "md:grid md:grid-cols-2 md:divide-y-0 md:gap-px md:bg-border")}>
          {tasks.map((t) => {
            const due = dueText(t.bitis, false);
            const Icon = STATUS[t.durum].icon;
            return (
              <li key={t.id} className="bg-card">
                <Link href={`/panel/gorevler/${t.id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-muted/40">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug">{t.baslik}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      {STATUS[t.durum].label}
                      {t.olusturan && t.olusturanId !== t.atananId && <span>· {t.olusturan} atadı</span>}
                      {due && (
                        <span className={cn("flex items-center gap-1", due.cls)}>
                          <CalendarDays className="size-3" /> {due.text}
                        </span>
                      )}
                    </p>
                  </div>
                  <PriorityTag p={t.oncelik} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

