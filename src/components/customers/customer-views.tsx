"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, FilePlus2, ListPlus, Mail, MapPin, MessageCircle, Pencil, Phone, Plus, Search, Tags } from "lucide-react";
import { OrderBadge, type OrderStatus } from "@/components/orders/order-views";
import { ASAMA, type Asama } from "@/components/terminal/quote-flow";
import { Avatar } from "@/components/tasks/task-meta";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatDate, formatTRY } from "@/lib/utils";
import { CustomerForm, emptyCustomer, type CustomerDraft, type GroupOption } from "./customer-form";
import { GroupSheet } from "./group-sheet";

type Group = GroupOption & { aciklama: string | null; musteri: number };
type Staff = { id: number; adSoyad: string };
const TL = (n: number) => formatTRY(n, { whole: true });
const groupText = (g: { ad: string; oran: number; fiyatListesi?: string }) => `${g.ad}${g.oran ? ` · %${String(Math.abs(g.oran)).replace(".", ",")}` : ""}`;

export type CustomerRow = {
  id: number;
  firma: string;
  yetkili: string | null;
  telefon: string | null;
  il: string | null;
  grup: string | null;
  grupOran: number | null;
  temsilci: string | null;
  teklif: number;
  siparis: number;
  ciro: number;
  sonIslem: string | null;
};

/** Müşteriler: satışçı kendi müşterilerini, yönetici hepsini görür */
export function CustomerList({ rows, q, admin, groups, staff, openNew }: { rows: CustomerRow[]; q: string; admin: boolean; groups: Group[]; staff: Staff[]; openNew: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [adding, setAdding] = useState(openNew);
  const [grouping, setGrouping] = useState(false);
  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Müşteriler</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} müşteri{q ? " bulundu" : ""}
            {admin ? " · tüm satışçıların müşterileri" : " · teklif verdiğiniz müşteriler burada toplanır"}
          </p>
        </div>
        <div className="flex gap-2">
          {admin && (
            <Button variant="outline" onClick={() => setGrouping(true)}>
              <Tags /> İskonto grupları
            </Button>
          )}
          <Button onClick={() => setAdding(true)}>
            <Plus /> Yeni müşteri
          </Button>
        </div>
      </div>

      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          const v = new FormData(e.currentTarget).get("q")?.toString().trim() ?? "";
          router.push(v ? `${pathname}?q=${encodeURIComponent(v)}` : pathname);
        }}
      >
        <label className="flex h-11 max-w-md items-center gap-2.5 rounded-xl border border-input bg-card px-4 text-sm focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
          <Search className="size-4 text-muted-foreground" />
          <input name="q" defaultValue={q} placeholder="Firma, yetkili, telefon ya da e-posta" className="w-full bg-transparent outline-none placeholder:text-muted-foreground" />
        </label>
      </form>

      <Card className="mt-4 overflow-hidden">
        {!rows.length ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">{q ? "Aramaya uyan müşteri yok." : "Henüz müşteri yok. Teklif kaydederken yazılan müşteri de buraya eklenir."}</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((c) => (
              <li key={c.id}>
                <Link href={`/panel/musteriler/${c.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3.5 hover:bg-muted/40 md:grid-cols-[1.6fr_1fr_0.7fr_0.9fr] md:gap-4 md:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{c.firma}</p>
                    <p className="truncate text-xs text-muted-foreground">{[c.yetkili, c.telefon, c.il].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <p className="tabular text-right text-sm font-bold md:order-last">
                    {c.ciro ? TL(c.ciro) : <span className="font-normal text-muted-foreground">—</span>}
                    <span className="block text-[11px] font-normal text-muted-foreground">{c.siparis} sipariş</span>
                  </p>
                  <div className="col-span-2 flex flex-wrap items-center gap-1.5 md:col-span-1">
                    {c.grup ? <Badge tone="success">{groupText({ ad: c.grup, oran: c.grupOran ?? 0 })}</Badge> : <span className="text-xs text-muted-foreground">Grup yok</span>}
                  </div>
                  <p className="col-span-2 text-xs text-muted-foreground md:col-span-1">
                    {c.teklif} teklif
                    {admin && c.temsilci ? ` · ${c.temsilci}` : ""}
                    {c.sonIslem ? ` · ${formatDate(c.sonIslem, { day: "numeric", month: "short" })}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <CustomerForm
        key={adding ? "acik" : "kapali"}
        open={adding}
        onClose={() => {
          setAdding(false);
          if (openNew) router.replace(pathname);
        }}
        initial={emptyCustomer()}
        admin={admin}
        groups={groups}
        staff={staff}
      />
      {admin && <GroupSheet open={grouping} onClose={() => setGrouping(false)} groups={groups} />}
    </div>
  );
}

type Detail = CustomerDraft & {
  olusturma: string;
  temsilci: string | null;
  grup: GroupOption | null;
  quotes: { id: number; no: string; olusturma: string; asama: Asama; dahil: number; satisci: string | null }[];
  orders: { id: number; no: string; olusturma: string; durum: OrderStatus; dahil: number; satisci: string | null }[];
};

/** wa.me numarası: 05xx… / 5xx… / +90 5xx… → 905xx… */
function wa(tel: string) {
  const d = tel.replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("5")) return `90${d}`;
  if (d.length === 11 && d.startsWith("0")) return `9${d}`;
  return d;
}

export function CustomerDetail({ c, admin, groups, staff }: { c: Detail; admin: boolean; groups: Group[]; staff: Staff[] }) {
  const [editing, setEditing] = useState(false);
  const ciro = c.orders.filter((o) => o.durum !== "iptal").reduce((a, o) => a + o.dahil, 0);
  const onay = c.quotes.filter((q) => q.asama === "onaylandi" || q.asama === "siparis").length;
  return (
    <div className="mx-auto max-w-[1200px]">
      <Link href="/panel/musteriler" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Müşteriler
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight md:text-[26px]">{c.firma}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {c.grup ? <Badge tone="success">İskonto: {groupText(c.grup)} · {c.grup.fiyatListesi === "toptan" ? "Toptan" : "Perakende"}</Badge> : <Badge tone="neutral">İskonto grubu yok</Badge>}
            {c.temsilci && (
              <span className="flex items-center gap-1.5">
                <Avatar name={c.temsilci} /> {c.temsilci}
              </span>
            )}
            <span>· Kayıt: {formatDate(c.olusturma, { day: "numeric", month: "long", year: "numeric" })}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil /> Düzenle
          </Button>
          <Link href={`/panel/gorevler?yeni=1&musteri=${c.id}`} className={buttonVariants({ variant: "outline" })}>
            <ListPlus /> Görev
          </Link>
          <Link href={`/panel/teklifler/yeni?musteri=${c.id}`} className={buttonVariants()}>
            <FilePlus2 /> Teklif oluştur
          </Link>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Mini label="Teklif" value={String(c.quotes.length)} />
        <Mini label="Onaylanan" value={String(onay)} />
        <Mini label="Sipariş" value={String(c.orders.filter((o) => o.durum !== "iptal").length)} />
        <Mini label="Sipariş toplamı" value={TL(ciro)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <Card className="min-w-0 p-5 lg:col-span-4">
          <h2 className="text-[15px] font-semibold">İletişim</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <Info label="Yetkili" value={c.yetkili} />
            <Info
              label="Telefon"
              value={c.telefon}
              extra={
                c.telefon && (
                  <span className="mt-1 flex gap-2">
                    <a href={`tel:${c.telefon.replace(/[^\d+]/g, "")}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                      <Phone /> Ara
                    </a>
                    <a href={`https://wa.me/${wa(c.telefon)}`} target="_blank" rel="noopener" className={buttonVariants({ size: "sm", variant: "outline" })}>
                      <MessageCircle /> WhatsApp
                    </a>
                  </span>
                )
              }
            />
            <Info label="E-posta" value={c.eposta} icon={Mail} />
            <Info label="Vergi" value={[c.vergiDairesi, c.vergiNo].filter(Boolean).join(" · ") || null} />
            <Info label="Adres" value={[c.adres, c.il].filter(Boolean).join(" · ") || null} icon={MapPin} />
            {c.notlar && <Info label="Not" value={c.notlar} />}
          </dl>
        </Card>

        <div className="min-w-0 space-y-4 lg:col-span-8">
          <Card className="overflow-hidden">
            <h2 className="px-5 pt-4 pb-3 text-[15px] font-semibold">Teklifler</h2>
            {!c.quotes.length ? (
              <p className="border-t border-border px-5 py-8 text-center text-sm text-muted-foreground">Bu müşteriye henüz teklif verilmedi.</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {c.quotes.map((t) => (
                  <li key={t.id}>
                    <Link href={`/panel/teklifler/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{t.no}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(t.olusturma, { day: "numeric", month: "short", year: "numeric" })}
                          {t.satisci ? ` · ${t.satisci}` : ""}
                        </p>
                      </div>
                      <Badge tone={ASAMA[t.asama].tone}>{ASAMA[t.asama].label}</Badge>
                      <span className="tabular w-24 text-right text-sm font-bold">{TL(t.dahil)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="overflow-hidden">
            <h2 className="px-5 pt-4 pb-3 text-[15px] font-semibold">Siparişler</h2>
            {!c.orders.length ? (
              <p className="border-t border-border px-5 py-8 text-center text-sm text-muted-foreground">Henüz sipariş yok.</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {c.orders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/panel/siparisler/${o.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{o.no}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(o.olusturma, { day: "numeric", month: "short", year: "numeric" })}
                          {o.satisci ? ` · ${o.satisci}` : ""}
                        </p>
                      </div>
                      <OrderBadge durum={o.durum} />
                      <span className="tabular w-24 text-right text-sm font-bold">{TL(o.dahil)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <CustomerForm key={editing ? "acik" : "kapali"} open={editing} onClose={() => setEditing(false)} initial={c} admin={admin} groups={groups} staff={staff} />
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-lg font-bold md:text-xl">{value}</p>
    </Card>
  );
}

function Info({ label, value, extra, icon: Icon }: { label: string; value: string | null; extra?: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 flex items-start gap-1.5 whitespace-pre-line font-medium", !value && "text-muted-foreground")}>
        {Icon && value && <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
        {value || "—"}
      </dd>
      {extra}
    </div>
  );
}
