"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  CalendarPlus,
  FilePlus2,
  History,
  Lock,
  Mail,
  MapPin,
  MessageSquareText,
  Pencil,
  Phone,
  PhoneCall,
  Plus,
  ShoppingCart,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import {
  adminOrders,
  discountGroups,
  getCustomerDetail,
  groupRate,
  type AdminCustomer,
  type CustomerDetail as Detail,
} from "@/lib/admin-mock";
import { ledger, openInvoices, daysUntil } from "@/lib/ledger";
import { getProduct } from "@/lib/products";
import { cn, formatDate, formatTRY } from "@/lib/utils";
import { initialsOf, statusMeta } from "./customer-list";
import { useRole } from "./role-context";
import { OrdersTable } from "./widgets";

const tabs = ["Özet", "Siparişler", "Cari", "Notlar", "Fiyatlandırma"] as const;
type Tab = (typeof tabs)[number];

type Audit = { field: string; from: string; to: string; by: string; when: string; reason: string };

export function CustomerDetail({ customer }: { customer: AdminCustomer }) {
  const { role, user } = useRole();
  const base = getCustomerDetail(customer);
  const [tab, setTab] = useState<Tab>("Özet");
  const [limit, setLimit] = useState(customer.limit);
  const [group, setGroup] = useState(customer.group);
  const [notes, setNotes] = useState(base.notes);
  const [audit, setAudit] = useState<Audit[]>([
    { field: "Kredi limiti", from: formatTRY(120_000, { whole: true }), to: formatTRY(customer.limit, { whole: true }), by: "Selin Acar", when: "28 Eyl 2026 16:40", reason: "Düzenli ödeme geçmişi" },
  ]);
  const [editing, setEditing] = useState<null | "limit" | "group">(null);

  const canEditLimit = role === "admin" || role === "finance";
  const canEditGroup = role === "admin";
  const st = statusMeta[customer.status];
  const usage = Math.round((customer.balance / limit) * 100);
  const orders = adminOrders.filter((o) => o.customer === customer.name);

  function record(field: string, from: string, to: string, reason: string) {
    setAudit((a) => [{ field, from, to, by: user.user, when: "Şimdi", reason }, ...a]);
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <Link href="/panel/musteriler" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Müşteriler
      </Link>

      {/* Başlık */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary-soft text-lg font-bold text-primary-soft-foreground">
            {initialsOf(customer.name)}
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight md:text-[26px]">{customer.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge tone={st.tone}>{st.label}</Badge>
              <span>{customer.id}</span>·<span>{base.type}</span>·<span>{group} %{groupRate(group)}</span>·<span>Temsilci {customer.rep}</span>
            </div>
          </div>
        </div>
        <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
          <a href={`tel:${base.phone.replace(/\s/g, "")}`} className={cn(buttonVariants({ variant: "outline" }), "px-2 sm:px-4")}>
            <PhoneCall /> Ara
          </a>
          <Link href={`/panel/teklifler/yeni?musteri=${customer.id}`} className={cn(buttonVariants({ variant: "outline" }), "px-2 sm:px-4")}>
            <FilePlus2 /> Teklif
          </Link>
          <Link href={`/panel/siparisler/yeni?musteri=${customer.id}`} className={cn(buttonVariants(), "px-2 sm:px-4")}>
            <ShoppingCart /> Sipariş
          </Link>
        </div>
      </div>

      {/* Özet şeridi */}
      <div className="mt-5 grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Mini label="Bakiye" value={formatTRY(customer.balance, { whole: true })} hint={base.paymentTerm} />
        <Mini label="Vadesi geçmiş" value={customer.overdue ? formatTRY(customer.overdue, { whole: true }) : "—"} hint={customer.overdue ? "Takip gerekli" : "Gecikme yok"} danger={customer.overdue > 0} />
        <Card className="p-4 md:p-5">
          <p className="text-xs text-muted-foreground">Limit kullanımı</p>
          <p className={cn("tabular mt-1 text-lg font-bold md:text-xl", usage > 100 && "text-danger")}>%{usage}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", usage > 100 ? "bg-danger" : "bg-primary")} style={{ width: `${Math.min(usage, 100)}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Limit {formatTRY(limit, { whole: true })}</p>
        </Card>
        <Mini label="Bu yıl ciro" value={formatTRY(base.ytdSales, { whole: true })} hint={`${base.since}'den beri müşteri`} />
      </div>

      {/* Sekmeler */}
      <div className="-mx-4 mt-6 flex gap-1 overflow-x-auto border-b border-border px-4 no-scrollbar md:mx-0 md:px-0">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn("relative h-11 shrink-0 px-3 text-sm font-semibold transition-colors", tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {t}
            {t === "Siparişler" && <span className="ml-1.5 text-[11px] opacity-60">{orders.length}</span>}
            {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "Özet" && (
          <div className="grid gap-4 md:gap-5 lg:grid-cols-12">
            <div className="space-y-4 md:space-y-5 lg:col-span-7">
              <Card>
                <CardHeader title="Firma bilgileri" />
                <dl className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
                  <Info icon={Building2} label="Vergi no" value={`${base.taxNo} · ${customer.city} V.D.`} />
                  <Info icon={Phone} label="Telefon" value={base.phone} />
                  <Info icon={Mail} label="E-posta" value={base.email} />
                  <Info icon={MapPin} label="Adres" value={base.address} />
                </dl>
              </Card>
              <Card>
                <CardHeader
                  title="Yetkililer"
                  description="Portal erişimi olan kullanıcılar müşteri adına sipariş verebilir"
                  action={
                    <Button variant="outline" size="sm">
                      <Plus /> Ekle
                    </Button>
                  }
                />
                <ul className="divide-y divide-border p-2">
                  {base.contacts.map((c) => (
                    <li key={c.name} className="flex items-center gap-3 px-3 py-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold">{initialsOf(c.name)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.title} · {c.phone}
                        </p>
                      </div>
                      {c.portal ? <Badge tone="success">Portal</Badge> : <Badge tone="neutral">Portal yok</Badge>}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            <div className="space-y-4 md:space-y-5 lg:col-span-5">
              <Card>
                <CardHeader title="Ticari koşullar" description="Değişiklikler gerekçesiyle kayıt altına alınır" />
                <ul className="divide-y divide-border p-2">
                  <TermRow label="Kredi limiti" value={formatTRY(limit, { whole: true })} canEdit={canEditLimit} onEdit={() => setEditing("limit")} />
                  <TermRow label="İskonto grubu" value={`${group} · %${groupRate(group)}`} canEdit={canEditGroup} onEdit={() => setEditing("group")} />
                  <TermRow label="Ödeme vadesi" value={base.paymentTerm} canEdit={canEditLimit} />
                  <TermRow label="Özel fiyatlı ürün" value={`${base.specialPrices.length} ürün`} canEdit={canEditGroup} onEdit={() => setTab("Fiyatlandırma")} />
                </ul>
              </Card>
              <AuditCard audit={audit} />
            </div>
          </div>
        )}

        {tab === "Siparişler" && (
          orders.length ? <OrdersTable orders={orders} title="Siparişler" description={`${customer.name} · tüm siparişler`} /> : <Empty text="Bu müşterinin açık siparişi yok." />
        )}

        {tab === "Cari" && <AccountTab customer={customer} />}

        {tab === "Notlar" && <NotesTab notes={notes} onAdd={(text, kind) => setNotes((n) => [{ by: user.user, when: "Şimdi", text, kind }, ...n])} />}

        {tab === "Fiyatlandırma" && <PricingTab detail={base} group={group} canEdit={canEditGroup} />}
      </div>

      {/* Düzenleme pencereleri */}
      <EditSheet
        open={editing === "limit"}
        title="Kredi limitini değiştir"
        onClose={() => setEditing(null)}
        current={formatTRY(limit, { whole: true })}
        onSave={(value, reason) => {
          const n = Number(value.replace(/\D/g, ""));
          if (!n) return;
          record("Kredi limiti", formatTRY(limit, { whole: true }), formatTRY(n, { whole: true }), reason);
          setLimit(n);
          setEditing(null);
        }}
        input={(v, set) => (
          <input
            autoFocus
            inputMode="numeric"
            value={v}
            onChange={(e) => set(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="Yeni limit (₺)"
            className="tabular h-12 w-full rounded-xl border border-input bg-card px-4 text-lg font-semibold outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
        )}
      />
      <EditSheet
        open={editing === "group"}
        title="İskonto grubunu değiştir"
        onClose={() => setEditing(null)}
        current={`${group} · %${groupRate(group)}`}
        initial={group}
        onSave={(value, reason) => {
          record("İskonto grubu", `${group} %${groupRate(group)}`, `${value} %${groupRate(value)}`, reason);
          setGroup(value);
          setEditing(null);
        }}
        input={(v, set) => (
          <div className="grid grid-cols-2 gap-2">
            {discountGroups.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => set(g.key)}
                className={cn("rounded-xl border p-3 text-left", v === g.key ? "border-primary bg-primary-soft/60" : "border-border hover:bg-muted/50")}
              >
                <span className="block text-sm font-semibold">{g.key}</span>
                <span className="block text-xs text-muted-foreground">%{g.rate} iskonto</span>
              </button>
            ))}
          </div>
        )}
      />
    </div>
  );
}

function Mini({ label, value, hint, danger }: { label: string; value: string; hint: string; danger?: boolean }) {
  return (
    <Card className="p-4 md:p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("tabular mt-1 text-lg font-bold md:text-xl", danger && "text-danger")}>{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </Card>
  );
}

function Info({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="truncate text-sm font-medium">{value}</dd>
      </div>
    </div>
  );
}

function TermRow({ label, value, canEdit, onEdit }: { label: string; value: string; canEdit: boolean; onEdit?: () => void }) {
  return (
    <li className="flex items-center gap-3 px-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="tabular block text-sm font-semibold">{value}</span>
      </span>
      {canEdit ? (
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`${label} düzenle`}>
          <Pencil />
        </Button>
      ) : (
        <span className="grid size-8 place-items-center text-muted-foreground" title="Bu alanı değiştirme yetkiniz yok">
          <Lock className="size-3.5" />
        </span>
      )}
    </li>
  );
}

function AuditCard({ audit }: { audit: Audit[] }) {
  return (
    <Card>
      <CardHeader title="Değişiklik geçmişi" description="Kim, ne zaman, neden" action={<History className="size-4 text-muted-foreground" />} />
      <ul className="space-y-3 p-5">
        {audit.map((a, i) => (
          <li key={i} className="rounded-xl bg-muted/60 p-3 text-sm">
            <p>
              <span className="font-semibold">{a.field}</span>{" "}
              <span className="tabular text-muted-foreground">
                {a.from} → <span className="font-semibold text-foreground">{a.to}</span>
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {a.by} · {a.when} · “{a.reason}”
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function EditSheet({
  open,
  title,
  current,
  initial = "",
  onClose,
  onSave,
  input,
}: {
  open: boolean;
  title: string;
  current: string;
  initial?: string;
  onClose: () => void;
  onSave: (value: string, reason: string) => void;
  input: (value: string, set: (v: string) => void) => React.ReactNode;
}) {
  const [value, setValue] = useState(initial);
  const [reason, setReason] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="text-sm text-muted-foreground">
        Mevcut değer: <span className="tabular font-semibold text-foreground">{current}</span>
      </p>
      <div className="mt-4">{input(value, setValue)}</div>
      <label className="mt-4 block text-sm">
        <span className="mb-1.5 block font-medium">Değişiklik nedeni (zorunlu)</span>
        <textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Örn. 6 aylık düzenli ödeme performansı"
          className="w-full resize-none rounded-xl border border-input bg-card px-4 py-3 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        />
      </label>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onClose}>
          Vazgeç
        </Button>
        <Button disabled={!value || !reason.trim()} onClick={() => onSave(value, reason.trim())}>
          Kaydet
        </Button>
      </div>
    </Sheet>
  );
}

function AccountTab({ customer }: { customer: AdminCustomer }) {
  const isDemo = customer.id === "C-0457";
  return (
    <div className="grid gap-4 md:gap-5 lg:grid-cols-12">
      <Card className="overflow-hidden lg:col-span-7">
        <CardHeader title="Son hareketler" description={isDemo ? "Son 3 ay" : "Örnek veri yalnızca Akdeniz Reklam için"} className="pb-4" />
        {isDemo ? (
          <ul className="divide-y divide-border border-t border-border">
            {ledger
              .slice()
              .reverse()
              .slice(0, 6)
              .map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">{formatDate(r.date, { day: "numeric", month: "short" })}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{r.doc}</span> <span className="text-muted-foreground">· {r.description}</span>
                  </span>
                  <span className={cn("tabular font-semibold", r.credit && "text-success")}>
                    {r.credit ? "−" : "+"}
                    {formatTRY(r.debit || r.credit)}
                  </span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="border-t border-border p-8 text-center text-sm text-muted-foreground">Cari hareketler EnterERP entegrasyonu sonrası burada listelenecek.</p>
        )}
      </Card>
      <Card className="lg:col-span-5">
        <CardHeader title="Açık faturalar" />
        <ul className="space-y-2 p-3">
          {(isDemo ? openInvoices : []).map((inv) => {
            const d = daysUntil(inv.due);
            return (
              <li key={inv.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{inv.id}</p>
                  <p className="text-xs text-muted-foreground">Vade {formatDate(inv.due, { day: "numeric", month: "short" })}</p>
                </div>
                <Badge tone={d < 0 ? "danger" : "neutral"}>{d < 0 ? `${-d} gün gecikti` : `${d} gün`}</Badge>
                <span className="tabular w-24 text-right text-sm font-bold">{formatTRY(inv.amount)}</span>
              </li>
            );
          })}
          {!isDemo && <p className="p-6 text-center text-sm text-muted-foreground">Kayıt yok.</p>}
        </ul>
        <div className="px-5 pb-5">
          <Button variant="soft" className="w-full">
            <MessageSquareText /> Ödeme hatırlatması gönder
          </Button>
        </div>
      </Card>
    </div>
  );
}

const noteKinds = [
  { key: "call", label: "Telefon", icon: PhoneCall },
  { key: "visit", label: "Ziyaret", icon: Users },
  { key: "note", label: "Not", icon: MessageSquareText },
] as const;

function NotesTab({ notes, onAdd }: { notes: Detail["notes"]; onAdd: (text: string, kind: Detail["notes"][number]["kind"]) => void }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<Detail["notes"][number]["kind"]>("call");
  return (
    <div className="grid gap-4 md:gap-5 lg:grid-cols-12">
      <Card className="p-5 lg:col-span-5 lg:self-start">
        <p className="text-[15px] font-semibold">Görüşme notu ekle</p>
        <div className="mt-3 inline-flex rounded-full bg-muted p-1">
          {noteKinds.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              className={cn("flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold", kind === k.key ? "bg-card shadow-card" : "text-muted-foreground")}
            >
              <k.icon className="size-3.5" /> {k.label}
            </button>
          ))}
        </div>
        <textarea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Görüşmede ne konuşuldu?"
          className="mt-3 w-full resize-none rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        />
        <div className="mt-3 flex gap-2">
          <Button variant="outline" className="flex-1">
            <CalendarPlus /> Hatırlatma
          </Button>
          <Button
            className="flex-1"
            disabled={!text.trim()}
            onClick={() => {
              onAdd(text.trim(), kind);
              setText("");
            }}
          >
            Kaydet
          </Button>
        </div>
      </Card>
      <Card className="lg:col-span-7">
        <CardHeader title="Notlar" description={`${notes.length} kayıt`} />
        <ol className="space-y-4 p-5">
          {notes.map((n, i) => {
            const K = noteKinds.find((k) => k.key === n.kind)!;
            return (
              <li key={i} className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground">
                  <K.icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-muted/70 px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{n.by}</span> · {K.label} · {n.when}
                  </p>
                  <p className="mt-1 text-sm">{n.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}

function PricingTab({ detail, group, canEdit }: { detail: Detail; group: string; canEdit: boolean }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Müşteriye özel fiyatlar"
        description={`Bu ürünlerde ${group} grubu (%${groupRate(group)}) yerine özel fiyat uygulanır`}
        className="pb-4"
        action={
          canEdit ? (
            <Button size="sm">
              <Plus /> Özel fiyat ekle
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3.5" /> Yalnızca yönetici
            </span>
          )
        }
      />
      {detail.specialPrices.length ? (
        <ul className="divide-y divide-border border-t border-border">
          {detail.specialPrices.map((sp) => {
            const p = getProduct(sp.productId)!;
            const groupNet = p.listPrice * (1 - groupRate(group) / 100);
            return (
              <li key={sp.productId} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-border">
                  <Image src={p.image} alt="" fill sizes="48px" className="object-contain p-1" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <Sparkles className="size-3.5 text-primary" /> {p.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tanımlayan {sp.by} · {sp.when}
                  </p>
                </div>
                <div className="tabular text-right text-sm">
                  <p className="text-xs text-muted-foreground">
                    Liste {formatTRY(p.listPrice)} · Grup fiyatı {formatTRY(groupNet)}
                  </p>
                  <p className="font-bold">
                    {formatTRY(sp.price)} <span className="text-xs font-semibold text-success">%{Math.round((1 - sp.price / p.listPrice) * 100)}</span>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty text="Özel fiyat tanımlı değil; tüm ürünlerde grup iskontosu geçerli." />
      )}
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{text}</p>;
}
