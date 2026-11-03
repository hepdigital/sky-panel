"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Link2Off, RefreshCw } from "lucide-react";
import { gonderiBagla, yurticiEsitle, yurticiKaydet } from "@/app/panel/sevkiyat/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";
import { tl } from "./package-fields";

export type ShipmentRow = {
  id: number;
  tarih: string;
  yon: "giden" | "gelen";
  karsi: string;
  adres: string | null;
  koli: number;
  desi: number;
  ucret: number;
  toplam: number;
  durum: string | null;
  teslim: boolean;
  red: boolean;
  takipUrl: string | null;
  siparisId: number | null;
  siparisNo: string | null;
  /** Tarifeye göre beklenen (KDV hariç) ve fark */
  tarife: { beklenen: number; fark: number; uygun: boolean } | null;
};
export type YurticiStatus = { bagli: boolean; kullanici: string | null; musteriNo: string | null; son: string | null; hata: string | null };

type Filter = "tumu" | "giden" | "gelen" | "fark" | "teslim" | "siparissiz";
const input = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";
const when = (iso: string) => formatDate(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Yurtiçi bağlantısı, aylık kargo gideri ve gönderiler (Yurtiçi rapor servisinden, salt okuma) */
export function ShipmentsPanel({ api, rows }: { api: YurticiStatus; rows: ShipmentRow[] }) {
  return (
    <div className="mt-4 space-y-4">
      <ApiCard api={api} />
      {api.bagli && <MonthSummary rows={rows} />}
      {api.bagli && <ShipmentList rows={rows} />}
    </div>
  );
}

function ApiCard({ api }: { api: YurticiStatus }) {
  const router = useRouter();
  const [edit, setEdit] = useState(!api.bagli);
  const [f, setF] = useState({ kullanici: api.kullanici ?? "", sifre: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await yurticiKaydet(f.kullanici, f.sifre);
      setMsg(r.ok ? { ok: true, text: "Bağlandı. Gönderiler çekiliyor…" } : { ok: false, text: r.hata });
      if (!r.ok) return;
      setEdit(false);
      const s = await yurticiEsitle();
      setMsg(s.ok ? { ok: true, text: `${s.count} gönderi çekildi.` } : { ok: false, text: s.hata });
      router.refresh();
    });
  const sync = () =>
    start(async () => {
      const s = await yurticiEsitle();
      setMsg(s.ok ? { ok: true, text: `${s.count} gönderi güncellendi.` } : { ok: false, text: s.hata });
      router.refresh();
    });
  return (
    <Card className="p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Yurtiçi Kargo bağlantısı</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {api.bagli
              ? `Web servis kullanıcısı ${api.kullanici} · müşteri ${api.musteriNo} · son eşitleme ${api.son ? when(api.son) : "—"}`
              : "Web servis kullanıcı adı ve şifresi (Yurtiçi’nin verdiği). Yalnızca okunur: gönderiler, desi, ücret ve durum çekilir; Yurtiçi’ye hiçbir şey yazılmaz."}
          </p>
          {api.hata && <p className="mt-1 text-xs font-medium text-danger">Son eşitleme hatası: {api.hata}</p>}
        </div>
        {api.bagli && !edit && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={sync}>
              <RefreshCw className={cn(pending && "animate-spin")} /> Şimdi eşitle
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit(true)}>
              Bilgileri değiştir
            </Button>
          </div>
        )}
      </div>
      {edit && (
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Web servis kullanıcı adı</span>
            <input value={f.kullanici} onChange={(e) => setF({ ...f, kullanici: e.target.value })} className={input} autoComplete="off" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Şifre{api.bagli ? " (boş: değişmez)" : ""}</span>
            <input type="password" value={f.sifre} onChange={(e) => setF({ ...f, sifre: e.target.value })} className={input} autoComplete="new-password" />
          </label>
          <Button disabled={pending || !f.kullanici.trim()} onClick={save} className="h-10">
            {pending ? "Deneniyor…" : "Test et ve kaydet"}
          </Button>
        </div>
      )}
      {msg && <p className={cn("mt-2 text-xs font-medium", msg.ok ? "text-success" : "text-danger")}>{msg.text}</p>}
    </Card>
  );
}

/** Bu ay ve geçen ay: giden gönderi, kargo gideri (KDV dahil), tarifeden fazla kesilen ve henüz teslim edilmemiş (yolda) */
function MonthSummary({ rows }: { rows: ShipmentRow[] }) {
  const now = new Date();
  const months = [0, 1].map((back) => {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const list = rows.filter((r) => r.tarih.startsWith(key));
    const giden = list.filter((r) => r.yon === "giden");
    return {
      ad: d.toLocaleDateString("tr-TR", { month: "long", year: "numeric" }),
      giden: giden.length,
      koli: giden.reduce((a, r) => a + r.koli, 0),
      gider: list.reduce((a, r) => a + r.toplam, 0),
      gelen: list.length - giden.length,
      fark: list.filter((r) => r.tarife && !r.tarife.uygun).length,
      bekleyen: giden.filter((r) => !r.teslim).length,
    };
  });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {months.map((m) => (
        <Card key={m.ad} className="p-4">
          <p className="text-xs font-semibold text-muted-foreground capitalize">{m.ad}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight tabular">{tl(m.gider)}</p>
          <p className="text-[11px] text-muted-foreground">kargo gideri, KDV dahil</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {m.giden} giden gönderi ({m.koli} koli){m.gelen ? ` · ${m.gelen} gelen` : ""}
            {m.fark ? <span className="font-semibold text-warning"> · {m.fark} tarifeden fazla</span> : null}
            {m.bekleyen ? <span className="font-semibold text-info"> · {m.bekleyen} yolda</span> : null}
          </p>
        </Card>
      ))}
    </div>
  );
}

function ShipmentList({ rows }: { rows: ShipmentRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("tumu");
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const match: Record<Filter, (r: ShipmentRow) => boolean> = {
    tumu: () => true,
    giden: (r) => r.yon === "giden",
    gelen: (r) => r.yon === "gelen",
    fark: (r) => !!r.tarife && !r.tarife.uygun,
    teslim: (r) => !r.teslim || r.red,
    siparissiz: (r) => r.yon === "giden" && !r.siparisId,
  };
  const list = useMemo(
    () => rows.filter((r) => match[filter](r) && (!q.trim() || `${r.karsi} ${r.adres} ${r.siparisNo}`.toLocaleLowerCase("tr").includes(q.trim().toLocaleLowerCase("tr")))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, filter, q],
  );
  const chips: [Filter, string][] = [
    ["tumu", "Tümü"],
    ["giden", "Giden"],
    ["gelen", "Gelen"],
    ["fark", "Tarifeden fazla"],
    ["teslim", "Yolda / iade"],
    ["siparissiz", "Siparişi bulunamayan"],
  ];
  const unlink = (id: number) =>
    start(async () => {
      await gonderiBagla(id, null);
      router.refresh();
    });
  return (
    <Card className="p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Gönderiler · {list.length}</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Alıcı, adres ya da sipariş no" className={cn(input, "sm:w-64")} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {chips.map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn("h-8 rounded-full border px-3 text-xs font-semibold", filter === k ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground hover:text-foreground")}
          >
            {l} · {rows.filter(match[k]).length}
          </button>
        ))}
      </div>
      <ul className="mt-3 divide-y divide-border">
        {list.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-semibold break-words">
                <span className="mr-1.5 text-xs font-normal text-muted-foreground tabular">{formatDate(r.tarih, { day: "numeric", month: "short" })}</span>
                {r.yon === "gelen" && <Badge tone="neutral" className="mr-1.5">Gelen</Badge>}
                {r.karsi}
              </p>
              {r.adres && <p className="truncate text-[11px] text-muted-foreground">{r.adres}</p>}
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                <span>
                  {r.koli} koli · {r.desi.toLocaleString("tr-TR")} desi
                </span>
                <Badge tone={r.red ? "danger" : r.teslim ? "success" : "info"}>{r.red ? `İade / red · ${r.durum ?? ""}` : (r.durum ?? "—")}</Badge>
                {r.siparisId ? (
                  <span className="inline-flex items-center gap-1">
                    <Link href={`/panel/siparisler/${r.siparisId}`} className="font-semibold text-primary hover:underline">
                      Sipariş {r.siparisNo}
                    </Link>
                    <button type="button" disabled={pending} onClick={() => unlink(r.id)} title="Bu eşleşme yanlışsa kaldır" className="text-muted-foreground hover:text-danger">
                      <Link2Off className="size-3.5" />
                    </button>
                  </span>
                ) : null}
                {r.takipUrl && (
                  <a href={r.takipUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 font-semibold text-primary hover:underline">
                    Takip <ExternalLink className="size-3" />
                  </a>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold tabular">{tl(r.toplam)}</p>
              <p className="text-[11px] text-muted-foreground tabular">{tl(r.ucret)} + KDV</p>
              {r.tarife && !r.tarife.uygun && (
                <p className={cn("text-[11px] font-semibold", r.tarife.fark > 0 ? "text-warning" : "text-success")} title={`Tarifeye göre ${tl(r.tarife.beklenen)} + KDV`}>
                  tarifeden {r.tarife.fark > 0 ? "+" : "−"}
                  {tl(Math.abs(r.tarife.fark))}
                </p>
              )}
            </div>
          </li>
        ))}
        {!list.length && <li className="py-6 text-center text-sm text-muted-foreground">Bu süzgeçte gönderi yok.</li>}
      </ul>
    </Card>
  );
}
