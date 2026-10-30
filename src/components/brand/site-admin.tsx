"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Globe, Pencil, Plug, Plus, RefreshCw, XCircle } from "lucide-react";
import { siteEsitle, siteKaydet, siteTest } from "@/app/panel/siteler/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { cn, formatDate } from "@/lib/utils";

export type SiteRow = {
  id: number;
  markaId: number;
  marka: string | null;
  markaRenk: string | null;
  tur: "gazebotente" | "woocommerce" | "trendyol" | "hepsiburada";
  ad: string;
  adres: string;
  aktif: boolean;
  anahtarVar: boolean;
  sonDeneme: string | null;
  sonBasari: string | null;
  sonHata: string | null;
  siparis: number;
};
type Brand = { id: number; ad: string };

const input = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";
const label = "mb-1 block text-xs font-semibold text-muted-foreground";
const when = (iso: string | null) => (iso ? formatDate(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const TUR = { gazebotente: "GazeboTente sitesi", woocommerce: "WooCommerce", trendyol: "Trendyol", hepsiburada: "Hepsiburada" };
/** Türün varsayılan adresi (pazaryerlerinde API adresi) */
const ADRES: Partial<Record<SiteRow["tur"], string>> = { trendyol: "https://apigw.trendyol.com" };

/** Site bağlantıları: markaların e-ticaret siteleri; siparişler buradan panele gelir, durumlar siteye yazılır */
export function SiteAdmin({ sites, brands }: { sites: SiteRow[]; brands: Brand[] }) {
  const [edit, setEdit] = useState<SiteRow | "yeni" | null>(null);
  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Site ve pazaryeri bağlantıları</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sitelerden ve pazaryerlerinden gelen siparişler panele düşer; panelde değişen durum, ödeme, kargo ve fatura karşı tarafa yazılır.</p>
        </div>
        <Button onClick={() => setEdit("yeni")}>
          <Plus /> Bağlantı ekle
        </Button>
      </div>
      <div className="mt-5 space-y-3">
        {sites.map((s) => (
          <SiteCard key={s.id} s={s} onEdit={() => setEdit(s)} />
        ))}
        {!sites.length && <Card className="p-10 text-center text-sm text-muted-foreground">Henüz bağlantı yok.</Card>}
      </div>
      <SiteSheet key={edit === "yeni" ? "yeni" : (edit?.id ?? "kapali")} site={edit} brands={brands} onClose={() => setEdit(null)} />
    </div>
  );
}

function SiteCard({ s, onEdit }: { s: SiteRow; onEdit: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ok = !s.sonHata && !!s.sonBasari;
  return (
    <Card className={cn("p-5", !s.aktif && "opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
            <Globe className="size-4 text-muted-foreground" /> {s.ad}
            <Badge tone="neutral">{TUR[s.tur]}</Badge>
            {s.marka && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold">
                <span className="size-2 rounded-full" style={{ background: s.markaRenk ?? "#888" }} /> {s.marka}
              </span>
            )}
            {!s.aktif && <Badge tone="neutral">Kapalı</Badge>}
          </p>
          <a href={s.adres} target="_blank" rel="noopener" className="text-xs text-muted-foreground hover:underline">
            {s.adres}
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => {
            const r = await siteTest(s.id);
            setMsg(r.ok ? { ok: true, text: "Bağlantı çalışıyor." } : { ok: false, text: r.hata });
          })}>
            <Plug /> Test et
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => {
            const r = await siteEsitle(s.id);
            setMsg(r.ok ? { ok: true, text: `${r.adet ?? 0} sipariş eşitlendi.` } : { ok: false, text: r.hata });
            router.refresh();
          })}>
            <RefreshCw className={cn(pending && "animate-spin")} /> Şimdi eşitle
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Pencil /> Düzenle
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Durum</p>
          <p className={cn("mt-0.5 flex items-center gap-1.5 font-semibold", s.sonHata ? "text-danger" : ok ? "text-success" : "text-muted-foreground")}>
            {s.sonHata ? <XCircle className="size-4" /> : ok ? <CheckCircle2 className="size-4" /> : null}
            {s.sonHata ? "Hata" : ok ? "Çalışıyor" : "Henüz eşitlenmedi"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Son başarılı eşitleme</p>
          <p className="mt-0.5 font-medium">{when(s.sonBasari)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Son deneme</p>
          <p className="mt-0.5 font-medium">{when(s.sonDeneme)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Paneldeki sipariş</p>
          <p className="mt-0.5 font-medium">{s.siparis}</p>
        </div>
      </div>
      {s.sonHata && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">Son hata: {s.sonHata}</p>}
      {!s.anahtarVar && <p className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-xs font-medium text-warning">Anahtar girilmedi; Düzenle’den ekleyin.</p>}
      {msg && <p className={cn("mt-3 rounded-xl px-3 py-2 text-xs font-medium", msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>{msg.text}</p>}
    </Card>
  );
}

function SiteSheet({ site, brands, onClose }: { site: SiteRow | "yeni" | null; brands: Brand[]; onClose: () => void }) {
  const router = useRouter();
  const s = site && site !== "yeni" ? site : null;
  const [f, setF] = useState({ markaId: s?.markaId ?? brands[0]?.id ?? 0, tur: s?.tur ?? "woocommerce", ad: s?.ad ?? "", adres: s?.adres ?? "https://", anahtar: "", aktif: s?.aktif ?? true });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const r = await siteKaydet({ id: s?.id ?? null, ...f });
    setBusy(false);
    if (!r.ok) return setErr(r.hata);
    router.refresh();
    onClose();
  }
  return (
    <Sheet open={!!site} onClose={onClose} title={s ? `${s.ad} · bağlantı` : "Yeni site bağlantısı"} className="md:max-w-lg">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Marka (siparişler bu markaya düşer)</span>
            <select value={f.markaId} onChange={(e) => setF({ ...f, markaId: Number(e.target.value) })} className={input}>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.ad}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={label}>Site türü</span>
            <select
              value={f.tur}
              onChange={(e) => {
                const tur = e.target.value as SiteRow["tur"];
                // Pazaryerinde adres API adresidir: tür değişince boşsa ya da başka türün varsayılanıysa doldurulur
                const bos = f.adres === "https://" || Object.values(ADRES).includes(f.adres);
                setF({ ...f, tur, adres: bos ? (ADRES[tur] ?? "https://") : f.adres, ad: f.ad || (ADRES[tur] ? TUR[tur] : "") });
              }}
              className={input}
            >
              <option value="woocommerce">WooCommerce</option>
              <option value="gazebotente">GazeboTente sitesi</option>
              <option value="trendyol">Trendyol</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className={label}>Bağlantı adı</span>
          <input value={f.ad} onChange={(e) => setF({ ...f, ad: e.target.value })} className={input} placeholder="ör. skygorselmarket.com" />
        </label>
        <label className="block">
          <span className={label}>{f.tur === "trendyol" ? "API adresi" : "Site adresi"}</span>
          <input value={f.adres} onChange={(e) => setF({ ...f, adres: e.target.value })} className={input} placeholder="https://…" />
          {f.tur === "trendyol" && <span className="mt-1 block text-[11px] text-muted-foreground">Canlı: https://apigw.trendyol.com · Test ortamı: https://stageapigw.trendyol.com</span>}
        </label>
        {f.tur === "trendyol" ? (
          <TrendyolKey kayitli={!!s?.anahtarVar} onChange={(anahtar) => setF({ ...f, anahtar })} />
        ) : (
          <label className="block">
            <span className={label}>{f.tur === "woocommerce" ? "REST API anahtarı (ck_…:cs_…)" : "Panel API anahtarı"}</span>
            <input
              type="password"
              autoComplete="off"
              value={f.anahtar}
              onChange={(e) => setF({ ...f, anahtar: e.target.value })}
              className={input}
              placeholder={s?.anahtarVar ? "Kayıtlı · değiştirmek için yenisini yazın" : f.tur === "woocommerce" ? "ck_xxxx:cs_xxxx" : "anahtar"}
            />
            {f.tur === "woocommerce" && <span className="mt-1 block text-[11px] text-muted-foreground">WooCommerce → Ayarlar → Gelişmiş → REST API → “Okuma/Yazma” anahtarı. Tüketici anahtarı ve gizli anahtarı aralarına iki nokta koyarak yazın.</span>}
          </label>
        )}
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" checked={f.aktif} onChange={(e) => setF({ ...f, aktif: e.target.checked })} className="size-4 accent-[var(--primary)]" />
          Aktif (kapalıyken siparişler çekilmez)
        </label>
        {err && <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{err}</p>}
        <Button size="lg" className="w-full" disabled={busy} onClick={save}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>
    </Sheet>
  );
}

/** Trendyol: satıcı ID, API key, API secret ayrı alanlarda; kayıtta "saticiId:key:secret" olarak birleşir. Üçü de boşsa eskisi korunur */
function TrendyolKey({ kayitli, onChange }: { kayitli: boolean; onChange: (anahtar: string) => void }) {
  const [k, setK] = useState({ id: "", key: "", secret: "" });
  const set = (patch: Partial<typeof k>) => {
    const next = { ...k, ...patch };
    setK(next);
    onChange(next.id || next.key || next.secret ? `${next.id.trim()}:${next.key.trim()}:${next.secret.trim()}` : "");
  };
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="text-xs font-semibold text-muted-foreground">
        Trendyol API bilgileri {kayitli && <span className="font-normal">· kayıtlı; değiştirmek için üçünü de yazın</span>}
      </p>
      <input value={k.id} onChange={(e) => set({ id: e.target.value.replace(/\D/g, "") })} inputMode="numeric" autoComplete="off" className={input} placeholder="Satıcı ID (Cari ID)" />
      <input value={k.key} onChange={(e) => set({ key: e.target.value })} autoComplete="off" className={input} placeholder="API Key" />
      <input type="password" value={k.secret} onChange={(e) => set({ secret: e.target.value })} autoComplete="off" className={input} placeholder="API Secret" />
      <span className="block text-[11px] text-muted-foreground">Trendyol satıcı paneli → sağ üstte hesap → Hesap Bilgilerim → Entegrasyon Bilgileri.</span>
    </div>
  );
}
