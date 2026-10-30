"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Barcode, ImagePlus, Pencil, Plus, RefreshCw, Search, Send, Settings2, Store, Trash2, X } from "lucide-react";
import {
  pyAyarKaydet, pyBarkod, pyDurumYenile, pyGonder, pyKategoriAra, pyKategoriYenile, pyMarkaAra, pyOzellikler, pyUrunKaydet, pyUrunSil,
} from "@/app/panel/pazaryeri/actions";
import { urunGorselYukle } from "@/app/panel/urunler/actions";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { toWebp } from "@/lib/image";
import { cn, formatDate } from "@/lib/utils";

type Settings = { fiyatFarki: number; kargoFirmaId: number | null; markaId: number | null; markaAd: string | null };
type Channel = { id: number; ad: string; tur: string; aktif: boolean; ayarlar: Settings; kategoriSayisi: number };
type Values = Record<string, { v?: number; c?: string }>;
type ListingRow = {
  siteId: number;
  aktif: boolean;
  kategoriId: number | null;
  kategoriYol: string | null;
  markaId: number | null;
  markaAd: string | null;
  ozellikler: Values;
  fiyat: number | null;
  durum: string;
  olustu: boolean;
  hata: string | null;
  sonGonderim: string | null;
  satisFiyati: number | null;
};
type ItemRow = {
  id: number;
  stokKodu: string;
  barkod: string;
  ad: string;
  aciklama: string;
  grupKodu: string;
  markaAdi: string;
  urunId: number | null;
  renk: string;
  olcu: string;
  gorseller: string[];
  desi: number | null;
  kdv: number;
  fiyat: number | null;
  stok: number;
  hazirlikGun: number;
  aktif: boolean;
  katalogAd: string | null;
  katalogFiyat: number | null;
  listelemeler: ListingRow[];
};
type CatalogRow = { id: number; kod: string; ad: string; aciklama: string | null; perakende: number | null; gorsel: string | null };
type LogRow = { id: number; site: string; tur: string; durum: string; ozet: string; kullanici: string | null; tarih: string };
type Attr = { id: number; ad: string; zorunlu: boolean; serbest: boolean; varyant: boolean; degerler: { id: number; ad: string }[] };

const input = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:bg-muted disabled:text-muted-foreground";
const label = "mb-1 block text-xs font-semibold text-muted-foreground";
const tl = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ₺`);
const when = (iso: string | null) => (iso ? formatDate(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const numOrNull = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v.replace(",", "."))) ? null : Number(v.replace(",", ".")));

const DURUM: Record<string, { label: string; tone: BadgeTone }> = {
  taslak: { label: "Gönderilmedi", tone: "neutral" },
  gonderildi: { label: "Gönderildi, sonuç bekleniyor", tone: "info" },
  onay: { label: "Onay bekliyor", tone: "warning" },
  yayinda: { label: "Yayında", tone: "success" },
  hata: { label: "Hata", tone: "danger" },
  pasif: { label: "Satışa kapalı", tone: "neutral" },
};
const LOG_TUR: Record<string, string> = {
  "urun-olustur": "Ürün oluşturma", "urun-guncelle": "Ürün güncelleme", "urun-sonuc": "Gönderim sonucu", "fiyat-stok": "Fiyat / stok", kategori: "Kategoriler",
};

/** Pazaryeri ürünleri: ortak ürün kartı + kanal başına kategori, özellik, marka ve gönderim durumu */
export function MarketplaceAdmin({ channels, items, catalog, logs }: { channels: Channel[]; items: ItemRow[]; catalog: CatalogRow[]; logs: LogRow[] }) {
  const [edit, setEdit] = useState<ItemRow | "yeni" | null>(null);
  const [ayar, setAyar] = useState<Channel | null>(null);
  const [q, setQ] = useState("");
  const list = items.filter((i) => !q.trim() || `${i.ad} ${i.stokKodu} ${i.barkod} ${i.renk} ${i.olcu}`.toLocaleLowerCase("tr").includes(q.trim().toLocaleLowerCase("tr")));

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Pazaryeri ürünleri</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Ürün kartı bir kez girilir (barkod, görsel, desi, fiyat, stok); her pazaryeri için kategori, özellik ve marka eşleştirilip gönderilir. Siparişler Siparişler ekranına düşer.
          </p>
        </div>
        <Button onClick={() => setEdit("yeni")} disabled={!channels.length}>
          <Plus /> Ürün ekle
        </Button>
      </div>

      {!channels.length ? (
        <Card className="mt-5 p-8 text-center text-sm">
          <Store className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 font-semibold">Henüz pazaryeri bağlantısı yok.</p>
          <p className="mt-1 text-muted-foreground">Önce Bağlantılar ekranından Trendyol bağlantısını ekleyin (satıcı ID, API key, API secret).</p>
          <Link href="/panel/siteler" className="mt-3 inline-block font-semibold text-primary hover:underline">
            Bağlantılar →
          </Link>
        </Card>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {channels.map((c) => (
            <ChannelCard key={c.id} c={c} items={items} onSettings={() => setAyar(c)} />
          ))}
        </div>
      )}

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <h2 className="text-[15px] font-semibold">
            Ürünler <span className="font-normal text-muted-foreground">· {items.length}</span>
          </h2>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, stok kodu, barkod…" className={cn(input, "pl-9")} />
          </div>
        </div>
        <div className="divide-y divide-border">
          {list.map((i) => (
            <button key={i.id} type="button" onClick={() => setEdit(i)} className={cn("flex w-full flex-wrap items-center gap-4 p-4 text-left hover:bg-muted/50", !i.aktif && "opacity-60")}>
              <div className="size-14 shrink-0 overflow-hidden rounded-xl border border-border bg-white">
                {i.gorseller[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.gorseller[0]} alt="" className="size-full object-contain" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{i.ad}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {i.stokKodu} · {i.barkod}
                  {[i.olcu, i.renk].filter(Boolean).length ? ` · ${[i.olcu, i.renk].filter(Boolean).join(" · ")}` : ""} · stok {i.stok}
                  {!i.aktif && " · kapalı"}
                </p>
              </div>
              <div className="flex w-full flex-wrap gap-3 pl-[72px] sm:w-auto sm:pl-0">
                {channels.map((c) => {
                  const l = i.listelemeler.find((x) => x.siteId === c.id);
                  if (!l) return null;
                  const d = DURUM[l.durum] ?? DURUM.taslak;
                  return (
                    <div key={c.id} className="max-w-[260px] sm:text-right">
                      <p className="text-[11px] font-semibold text-muted-foreground">
                        {c.ad} · {tl(l.satisFiyati)}
                      </p>
                      <Badge tone={d.tone}>{d.label}</Badge>
                      {l.hata && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-danger" title={l.hata}>
                          {l.hata}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </button>
          ))}
          {!list.length && <p className="p-10 text-center text-sm text-muted-foreground">{items.length ? "Aramaya uyan ürün yok." : "Henüz ürün yok. “Ürün ekle” ile başlayın; katalogdaki bir üründen doldurabilirsiniz."}</p>}
        </div>
      </Card>

      {logs.length > 0 && (
        <Card className="mt-4 p-5">
          <h2 className="text-[15px] font-semibold">İşlem kaydı</h2>
          <ul className="mt-3 space-y-2">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="w-24 shrink-0 text-xs text-muted-foreground">{when(l.tarih)}</span>
                <Badge tone={l.durum === "hata" ? "danger" : l.durum === "tamam" ? "success" : "info"} className="shrink-0">
                  {LOG_TUR[l.tur] ?? l.tur}
                </Badge>
                <span className="min-w-0 basis-full break-words sm:flex-1 sm:basis-auto">
                  {l.ozet}
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {l.site}
                    {l.kullanici ? ` · ${l.kullanici}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ItemSheet key={`urun-${edit === "yeni" ? "yeni" : (edit?.id ?? "kapali")}`} item={edit} channels={channels} catalog={catalog} onClose={() => setEdit(null)} />
      <SettingsSheet key={`ayar-${ayar?.id ?? "kapali"}`} channel={ayar} onClose={() => setAyar(null)} />
    </div>
  );
}

function ChannelCard({ c, items, onSettings }: { c: Channel; items: ItemRow[]; onSettings: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ls = items.flatMap((i) => i.listelemeler.filter((l) => l.siteId === c.id && l.aktif && i.aktif));
  const count = (d: string) => ls.filter((l) => l.durum === d).length;
  const bekleyen = count("taslak") + count("hata");
  const run = <T,>(fn: () => Promise<({ ok: true } & T) | { ok: false; hata: string }>, ok: (r: T) => string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: ok(r) } : { ok: false, text: r.hata });
      router.refresh();
    });
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <Store className="size-4 text-muted-foreground" /> {c.ad}
            {!c.aktif && <Badge tone="neutral">Kapalı</Badge>}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Fiyat farkı %{c.ayarlar.fiyatFarki} · {c.kategoriSayisi ? `${c.kategoriSayisi.toLocaleString("tr-TR")} kategori` : "kategoriler yüklenmedi"}
            {c.ayarlar.markaAd ? ` · marka ${c.ayarlar.markaAd}` : ""}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onSettings}>
          <Settings2 /> Ayarlar
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(["yayinda", "onay", "gonderildi", "taslak", "hata", "pasif"] as const).map((d) =>
          count(d) ? (
            <Badge key={d} tone={DURUM[d].tone}>
              {DURUM[d].label}: {count(d)}
            </Badge>
          ) : null,
        )}
        {!ls.length && <span className="text-xs text-muted-foreground">Bu kanalda listelenen ürün yok.</span>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" disabled={pending || !bekleyen} onClick={() => run(() => pyGonder(c.id), (r) => `${r.gonderilen} ürün gönderildi${r.eksik ? `, ${r.eksik} üründe eksik var (satırında yazıyor)` : ""}. Sonuç birkaç dakika içinde gelir.`)}>
          <Send /> Bekleyenleri gönder{bekleyen ? ` (${bekleyen})` : ""}
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => pyDurumYenile(c.id), (r) => `Durumlar güncellendi${r.fiyatStok ? `; ${r.fiyatStok} ürünün fiyat/stoku gönderildi` : ""}.`)}>
          <RefreshCw className={cn(pending && "animate-spin")} /> Durumları yenile
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => pyKategoriYenile(c.id), (r) => `${r.adet.toLocaleString("tr-TR")} kategori yüklendi.`)}>
          Kategorileri {c.kategoriSayisi ? "güncelle" : "yükle"}
        </Button>
      </div>
      {msg && <p className={cn("mt-3 rounded-xl px-3 py-2 text-xs font-medium", msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>{msg.text}</p>}
    </Card>
  );
}

/* ───────────── kanal ayarları ───────────── */

function SettingsSheet({ channel, onClose }: { channel: Channel | null; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ fiyatFarki: String(channel?.ayarlar.fiyatFarki ?? 0), kargoFirmaId: channel?.ayarlar.kargoFirmaId ? String(channel.ayarlar.kargoFirmaId) : "" });
  const [marka, setMarka] = useState<{ id: number; ad: string } | null>(channel?.ayarlar.markaId ? { id: channel.ayarlar.markaId, ad: channel.ayarlar.markaAd ?? "" } : null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!channel) return null;
  async function save() {
    setBusy(true);
    const r = await pyAyarKaydet(channel!.id, { fiyatFarki: Number(f.fiyatFarki.replace(",", ".")) || 0, kargoFirmaId: numOrNull(f.kargoFirmaId), markaId: marka?.id ?? null, markaAd: marka?.ad ?? null });
    setBusy(false);
    if (!r.ok) return setErr(r.hata);
    router.refresh();
    onClose();
  }
  return (
    <Sheet open onClose={onClose} title={`${channel.ad} · ayarlar`} className="md:max-w-lg">
      <div className="space-y-3">
        <label className="block">
          <span className={label}>Fiyat farkı (%)</span>
          <input value={f.fiyatFarki} onChange={(e) => setF({ ...f, fiyatFarki: e.target.value })} inputMode="decimal" className={input} />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Satış fiyatı = KDV dahil perakende × (1 + fark). Komisyon ve kargo payı için. Ürüne kanal fiyatı girilirse o geçerlidir. Değişince yayındaki fiyatlar bir sonraki eşitlemede güncellenir.
          </span>
        </label>
        <BrandPicker siteId={channel.id} value={marka} onChange={setMarka} hint="Yeni listelemelerde önerilir." />
        <label className="block">
          <span className={label}>Kargo firması kimliği (isteğe bağlı)</span>
          <input value={f.kargoFirmaId} onChange={(e) => setF({ ...f, kargoFirmaId: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className={input} placeholder="Boş: Trendyol'daki varsayılan" />
          <span className="mt-1 block text-[11px] text-muted-foreground">Trendyol’un kargo firması listesindeki numara. Boş bırakılırsa satıcı panelindeki varsayılan kullanılır.</span>
        </label>
        {err && <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{err}</p>}
        <Button size="lg" className="w-full" disabled={busy} onClick={save}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>
    </Sheet>
  );
}

function BrandPicker({ siteId, value, onChange, hint }: { siteId: number; value: { id: number; ad: string } | null; onChange: (v: { id: number; ad: string } | null) => void; hint?: string }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ id: number; ad: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const search = () =>
    start(async () => {
      const r = await pyMarkaAra(siteId, q);
      if (!r.ok) return setErr(r.hata);
      setErr(null);
      setRes(r.liste);
      if (!r.liste.length) setErr("Bu adla marka bulunamadı. Markanız Trendyol'da kayıtlı değilse satıcı panelinden marka başvurusu yapılır.");
    });
  return (
    <div>
      <span className={label}>Marka</span>
      {value ? (
        <p className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
          <span className="font-semibold">
            {value.ad} <span className="text-xs font-normal text-muted-foreground">#{value.id}</span>
          </span>
          <button type="button" onClick={() => onChange(null)} className="text-muted-foreground hover:text-foreground" aria-label="Markayı kaldır">
            <X className="size-4" />
          </button>
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())} className={input} placeholder="Marka adı (ör. SKY)" />
            <Button variant="outline" className="h-10" disabled={pending || q.trim().length < 2} onClick={search}>
              Ara
            </Button>
          </div>
          {res.length > 0 && (
            <div className="mt-1 max-h-40 overflow-auto rounded-xl border border-border">
              {res.map((b) => (
                <button key={b.id} type="button" onClick={() => (onChange(b), setRes([]))} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">
                  {b.ad} <span className="text-xs text-muted-foreground">#{b.id}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {err && <p className="mt-1 text-[11px] font-medium text-danger">{err}</p>}
      {hint && !err && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

/* ───────────── ürün kartı ───────────── */

type Form = Omit<ItemRow, "id" | "katalogAd" | "katalogFiyat" | "listelemeler" | "desi" | "fiyat" | "stok" | "hazirlikGun"> & {
  desi: string;
  fiyat: string;
  stok: string;
  hazirlikGun: string;
};
type ListingForm = { siteId: number; aktif: boolean; kategoriId: number | null; kategoriYol: string | null; markaId: number | null; markaAd: string | null; ozellikler: Values; fiyat: string };

function ItemSheet({ item, channels, catalog, onClose }: { item: ItemRow | "yeni" | null; channels: Channel[]; catalog: CatalogRow[]; onClose: () => void }) {
  const router = useRouter();
  const it = item && item !== "yeni" ? item : null;
  const [f, setF] = useState<Form>({
    stokKodu: it?.stokKodu ?? "", barkod: it?.barkod ?? "", ad: it?.ad ?? "", aciklama: it?.aciklama ?? "", grupKodu: it?.grupKodu ?? "", markaAdi: it?.markaAdi ?? "",
    urunId: it?.urunId ?? null, renk: it?.renk ?? "", olcu: it?.olcu ?? "", gorseller: it?.gorseller ?? [], kdv: it?.kdv ?? 20, aktif: it?.aktif ?? true,
    desi: it?.desi?.toString() ?? "", fiyat: it?.fiyat?.toString() ?? "", stok: (it?.stok ?? 10).toString(), hazirlikGun: (it?.hazirlikGun ?? 3).toString(),
  });
  const [ls, setLs] = useState<ListingForm[]>(() =>
    channels.map((c) => {
      const l = it?.listelemeler.find((x) => x.siteId === c.id);
      return {
        siteId: c.id, aktif: l ? l.aktif : !it, kategoriId: l?.kategoriId ?? null, kategoriYol: l?.kategoriYol ?? null,
        markaId: l?.markaId ?? c.ayarlar.markaId, markaAd: l?.markaAd ?? c.ayarlar.markaAd, ozellikler: l?.ozellikler ?? {}, fiyat: l?.fiyat?.toString() ?? "",
      };
    }),
  );
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState(false);
  const [url, setUrl] = useState("");
  const katalog = catalog.find((c) => c.id === f.urunId) ?? null;
  const base = numOrNull(f.fiyat) ?? katalog?.perakende ?? null;

  useEffect(() => {
    if (item === "yeni" && !f.barkod) void pyBarkod().then((r) => r.ok && setF((x) => (x.barkod ? x : { ...x, barkod: r.barkod })));
  }, [item, f.barkod]);

  function fromCatalog(id: number) {
    const c = catalog.find((x) => x.id === id);
    if (!c) return setF({ ...f, urunId: null });
    setF({
      ...f,
      urunId: c.id,
      ad: f.ad || c.ad,
      stokKodu: f.stokKodu || c.kod.toUpperCase(),
      aciklama: f.aciklama || [c.ad, c.aciklama].filter(Boolean).join("\n\n"),
      gorseller: f.gorseller.length || !c.gorsel ? f.gorseller : [c.gorsel],
    });
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUp(true);
    const added: string[] = [];
    for (const file of [...files].slice(0, 8)) {
      const r = await urunGorselYukle(await toWebp(file, 1600)).catch(() => null);
      if (r?.ok) added.push(r.yol);
      else setErr(r && !r.ok ? r.hata : "Görsel yüklenemedi.");
    }
    setF((x) => ({ ...x, gorseller: [...x.gorseller, ...added].slice(0, 8) }));
    setUp(false);
  }

  async function save() {
    setBusy(true);
    setErr(null);
    const r = await pyUrunKaydet({
      id: it?.id ?? null, ...f, desi: numOrNull(f.desi), fiyat: numOrNull(f.fiyat), stok: Number(f.stok) || 0, hazirlikGun: Number(f.hazirlikGun) || 3,
      listelemeler: ls.map((l) => ({ ...l, fiyat: numOrNull(l.fiyat) })),
    });
    setBusy(false);
    if (!r.ok) return setErr(r.hata);
    router.refresh();
    onClose();
  }

  async function remove() {
    if (!it || !confirm("Ürün kartı silinsin mi? Pazaryerinde oluşmuşsa silinmez, satışa kapatılır.")) return;
    const r = await pyUrunSil(it.id);
    if (!r.ok) return setErr(r.hata);
    router.refresh();
    onClose();
  }

  const move = (i: number, d: -1 | 1) => {
    const g = [...f.gorseller];
    const j = i + d;
    if (j < 0 || j >= g.length) return;
    [g[i], g[j]] = [g[j], g[i]];
    setF({ ...f, gorseller: g });
  };

  return (
    <Sheet open={!!item} onClose={onClose} title={it ? it.ad : "Yeni pazaryeri ürünü"} className="md:max-w-3xl">
      <div className="space-y-5">
        <section className="space-y-3">
          <label className="block">
            <span className={label}>Katalogdaki ürün (isteğe bağlı: fiyatı oradan alır, boş alanları doldurur)</span>
            <select value={f.urunId ?? ""} onChange={(e) => fromCatalog(Number(e.target.value))} className={input}>
              <option value="">Bağlı değil</option>
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ad}
                  {c.aciklama ? ` · ${c.aciklama}` : ""} · {tl(c.perakende)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={label}>Ürün adı (pazaryerinde başlık, en fazla 100 karakter görünür)</span>
            <input value={f.ad} onChange={(e) => setF({ ...f, ad: e.target.value })} maxLength={150} className={input} placeholder="ör. Katlanır Gazebo Çadır 3x3 Beyaz Duvarsız 40 mm Alüminyum" />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className={label}>Stok kodu</span>
              <input value={f.stokKodu} onChange={(e) => setF({ ...f, stokKodu: e.target.value.replace(/\s/g, "") })} className={input} placeholder="GZ-3X3-BYZ-40" />
            </label>
            <label className="block">
              <span className={label}>Barkod</span>
              <div className="flex gap-1.5">
                <input value={f.barkod} onChange={(e) => setF({ ...f, barkod: e.target.value.trim() })} disabled={!!it?.listelemeler.some((l) => l.olustu)} className={input} />
                {!it?.listelemeler.some((l) => l.olustu) && (
                  <Button variant="outline" size="icon" title="Yeni barkod üret" onClick={() => void pyBarkod().then((r) => r.ok && setF((x) => ({ ...x, barkod: r.barkod })))}>
                    <Barcode />
                  </Button>
                )}
              </div>
            </label>
            <label className="block">
              <span className={label}>Seçenek grubu kodu</span>
              <input value={f.grupKodu} onChange={(e) => setF({ ...f, grupKodu: e.target.value.replace(/\s/g, "") })} className={input} placeholder="Boşsa stok kodu" />
            </label>
          </div>
          <p className="-mt-1 text-[11px] text-muted-foreground">
            Aynı ürünün renk/ölçü seçenekleri aynı grup koduyla tek sayfada birleşir (ör. GZ-3X3-40 altında beyaz, siyah, kırmızı).
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={label}>Ölçü</span>
              <input value={f.olcu} onChange={(e) => setF({ ...f, olcu: e.target.value })} className={input} placeholder="ör. 3x3 m" />
            </label>
            <label className="block">
              <span className={label}>Renk</span>
              <input value={f.renk} onChange={(e) => setF({ ...f, renk: e.target.value })} className={input} placeholder="ör. Beyaz" />
            </label>
          </div>
          <label className="block">
            <span className={label}>Açıklama (paragraflar boş satırla ayrılır)</span>
            <textarea value={f.aciklama} onChange={(e) => setF({ ...f, aciklama: e.target.value })} rows={6} className={cn(input, "h-auto py-2")} />
          </label>
        </section>

        <section>
          <p className={label}>Görseller (ilk görsel kapak; en fazla 8; pazaryerine 1200×1200 JPEG olarak gider)</p>
          <div className="flex flex-wrap gap-2">
            {f.gorseller.map((g, i) => (
              <div key={g + i} className="group relative size-24 overflow-hidden rounded-xl border border-border bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g} alt="" className="size-full object-contain" />
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/55 px-1 py-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <button type="button" onClick={() => move(i, -1)} aria-label="Sola">
                    <ArrowLeft className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => setF({ ...f, gorseller: f.gorseller.filter((_, j) => j !== i) })} aria-label="Kaldır">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {f.gorseller.length < 8 && (
              <label className={cn("flex size-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:bg-muted", up && "opacity-60")}>
                <ImagePlus className="size-5" /> {up ? "Yükleniyor…" : "Yükle"}
                <input type="file" accept="image/*" multiple className="hidden" disabled={up} onChange={(e) => void upload(e.target.files)} />
              </label>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="ya da görsel adresi (https://…jpg)" className={input} />
            <Button
              variant="outline"
              className="h-10"
              disabled={!/^https:\/\/\S+$/.test(url) || f.gorseller.length >= 8}
              onClick={() => (setF({ ...f, gorseller: [...f.gorseller, url.trim()] }), setUrl(""))}
            >
              Ekle
            </Button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-5">
          <label className="block sm:col-span-2">
            <span className={label}>Perakende fiyat (KDV hariç)</span>
            <input value={f.fiyat} onChange={(e) => setF({ ...f, fiyat: e.target.value })} inputMode="decimal" className={input} placeholder={katalog?.perakende ? `Katalogdan: ${tl(katalog.perakende)}` : "₺"} />
          </label>
          <label className="block">
            <span className={label}>KDV</span>
            <select value={f.kdv} onChange={(e) => setF({ ...f, kdv: Number(e.target.value) })} className={input}>
              {[20, 10, 1, 0].map((k) => (
                <option key={k} value={k}>
                  %{k}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={label}>Stok</span>
            <input value={f.stok} onChange={(e) => setF({ ...f, stok: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className={input} />
          </label>
          <label className="block">
            <span className={label}>Desi</span>
            <input value={f.desi} onChange={(e) => setF({ ...f, desi: e.target.value })} inputMode="decimal" className={input} placeholder="ör. 25" />
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>Hazırlık süresi (iş günü)</span>
            <input value={f.hazirlikGun} onChange={(e) => setF({ ...f, hazirlikGun: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className={input} />
          </label>
          <label className="flex items-end gap-2.5 pb-2.5 text-sm sm:col-span-3">
            <input type="checkbox" checked={f.aktif} onChange={(e) => setF({ ...f, aktif: e.target.checked })} className="size-4 accent-[var(--primary)]" />
            Satışta (kapatılırsa tüm kanallarda stok 0 gönderilir)
          </label>
          <p className="text-[11px] text-muted-foreground sm:col-span-5">
            Siparişe üretim yapılıyorsa stoku sabit bir sayı tutun (ör. 10); pazaryeri satışla düşürür, panelden gönderilen değer yeniden yazar.
          </p>
        </section>

        {channels.map((c, idx) => (
          <ListingSection
            key={c.id}
            c={c}
            l={ls[idx]}
            onChange={(patch) => setLs(ls.map((x, i) => (i === idx ? { ...x, ...patch } : x)))}
            base={base}
            kdv={f.kdv}
            status={it?.listelemeler.find((x) => x.siteId === c.id) ?? null}
          />
        ))}

        {err && <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{err}</p>}
        <div className="flex gap-2">
          {it && (
            <Button variant="outline" size="lg" onClick={remove}>
              <Trash2 /> Sil
            </Button>
          )}
          <Button size="lg" className="flex-1" disabled={busy || up} onClick={save}>
            {busy ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">Kayıt pazaryerine göndermez; kanal kartındaki “Bekleyenleri gönder” ile gönderilir.</p>
      </div>
    </Sheet>
  );
}

function ListingSection({
  c, l, onChange, base, kdv, status,
}: { c: Channel; l: ListingForm; onChange: (p: Partial<ListingForm>) => void; base: number | null; kdv: number; status: ListingRow | null }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ id: number; yol: string }[]>([]);
  const [attrs, setAttrs] = useState<Attr[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [showOptional, setShowOptional] = useState(false);
  const hesap = base === null ? null : Math.round(base * (1 + kdv / 100) * (1 + c.ayarlar.fiyatFarki / 100));

  useEffect(() => {
    if (!l.aktif || !l.kategoriId) return;
    let alive = true;
    void pyOzellikler(c.id, l.kategoriId).then((r) => {
      if (!alive) return;
      if (r.ok) setAttrs(r.liste);
      else setErr(r.hata);
    });
    return () => {
      alive = false;
    };
  }, [c.id, l.kategoriId, l.aktif]);

  const search = () =>
    start(async () => {
      const r = await pyKategoriAra(c.id, q);
      if (!r.ok) return setErr(r.hata);
      setErr(r.liste.length ? null : c.kategoriSayisi ? "Kategori bulunamadı; başka kelimeyle arayın." : "Kategoriler henüz yüklenmedi: kanal kartında “Kategorileri yükle”.");
      setRes(r.liste);
    });

  const setVal = (id: number, v: { v?: number; c?: string } | null) => {
    const o = { ...l.ozellikler };
    if (v) o[id] = v;
    else delete o[id];
    onChange({ ozellikler: o });
  };
  const zorunlu = attrs?.filter((a) => a.zorunlu) ?? [];
  const diger = attrs?.filter((a) => !a.zorunlu) ?? [];
  const eksik = zorunlu.filter((a) => !l.ozellikler[a.id]?.v && !l.ozellikler[a.id]?.c).length;

  return (
    <section className={cn("rounded-2xl border p-4", l.aktif ? "border-primary/40" : "border-border")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2.5 text-[15px] font-semibold">
          <input type="checkbox" checked={l.aktif} onChange={(e) => onChange({ aktif: e.target.checked })} className="size-4 accent-[var(--primary)]" />
          {c.ad} kanalında sat
        </label>
        {status && (
          <span className="flex items-center gap-2">
            <Badge tone={(DURUM[status.durum] ?? DURUM.taslak).tone}>{(DURUM[status.durum] ?? DURUM.taslak).label}</Badge>
            {status.sonGonderim && <span className="text-[11px] text-muted-foreground">son gönderim {when(status.sonGonderim)}</span>}
          </span>
        )}
      </div>
      {status?.hata && <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium break-words text-danger">{status.hata}</p>}
      {l.aktif && (
        <div className="mt-3 space-y-3">
          <div>
            <span className={label}>Kategori</span>
            {l.kategoriId ? (
              <p className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                <span>{l.kategoriYol}</span>
                <button type="button" onClick={() => (onChange({ kategoriId: null, kategoriYol: null, ozellikler: {} }), setAttrs(null))} className="text-muted-foreground hover:text-foreground" aria-label="Kategoriyi değiştir">
                  <Pencil className="size-4" />
                </button>
              </p>
            ) : (
              <>
                <div className="flex gap-2">
                  <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())} className={input} placeholder="ör. gazebo, çadır, şemsiye, roll up" />
                  <Button variant="outline" className="h-10" disabled={pending || q.trim().length < 2} onClick={search}>
                    Ara
                  </Button>
                </div>
                {res.length > 0 && (
                  <div className="mt-1 max-h-56 overflow-auto rounded-xl border border-border">
                    {res.map((k) => (
                      <button key={k.id} type="button" onClick={() => (onChange({ kategoriId: k.id, kategoriYol: k.yol, ozellikler: {} }), setRes([]))} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">
                        {k.yol}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {l.kategoriId && !attrs && !err && <p className="text-xs text-muted-foreground">Kategori özellikleri yükleniyor…</p>}
          {attrs && (
            <div>
              <p className={label}>
                Zorunlu özellikler {eksik ? <span className="text-danger">· {eksik} eksik</span> : zorunlu.length ? <span className="text-success">· tamam</span> : "· yok"}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {zorunlu.map((a) => (
                  <AttrField key={a.id} a={a} value={l.ozellikler[a.id]} onChange={(v) => setVal(a.id, v)} />
                ))}
              </div>
              {diger.length > 0 && (
                <>
                  <button type="button" onClick={() => setShowOptional(!showOptional)} className="mt-2 text-xs font-semibold text-primary hover:underline">
                    {showOptional ? "İsteğe bağlı özellikleri gizle" : `İsteğe bağlı özellikler (${diger.length})`}
                  </button>
                  {showOptional && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {diger.map((a) => (
                        <AttrField key={a.id} a={a} value={l.ozellikler[a.id]} onChange={(v) => setVal(a.id, v)} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <BrandPicker siteId={c.id} value={l.markaId ? { id: l.markaId, ad: l.markaAd ?? "" } : null} onChange={(b) => onChange({ markaId: b?.id ?? null, markaAd: b?.ad ?? null })} />
            <label className="block">
              <span className={label}>Kanal fiyatı (KDV dahil, isteğe bağlı)</span>
              <input value={l.fiyat} onChange={(e) => onChange({ fiyat: e.target.value })} inputMode="decimal" className={input} placeholder={hesap ? `Kurala göre ${tl(hesap)}` : "Önce perakende fiyat girin"} />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                {hesap ? `Kural: KDV dahil perakende × %${c.ayarlar.fiyatFarki} fark = ${tl(hesap)}` : "Fiyat yoksa gönderilmez."}
              </span>
            </label>
          </div>
          {err && <p className="text-[11px] font-medium text-danger">{err}</p>}
        </div>
      )}
    </section>
  );
}

function AttrField({ a, value, onChange }: { a: Attr; value: { v?: number; c?: string } | undefined; onChange: (v: { v?: number; c?: string } | null) => void }) {
  const ad = (
    <span className={label}>
      {a.ad}
      {a.zorunlu && <span className="text-danger"> *</span>}
    </span>
  );
  if (!a.degerler.length)
    return (
      <label className="block">
        {ad}
        <input value={value?.c ?? ""} onChange={(e) => onChange(e.target.value ? { c: e.target.value } : null)} className={input} />
      </label>
    );
  return (
    <label className="block">
      {ad}
      <select value={value?.v ?? (value?.c ? "ozel" : "")} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value === "ozel" ? { c: value?.c ?? " " } : { v: Number(e.target.value) })} className={input}>
        <option value="">Seçin…</option>
        {a.degerler.map((d) => (
          <option key={d.id} value={d.id}>
            {d.ad}
          </option>
        ))}
        {a.serbest && <option value="ozel">Listede yok, yazacağım…</option>}
      </select>
      {a.serbest && value?.c !== undefined && !value.v && (
        <input value={value.c.trim() ? value.c : ""} onChange={(e) => onChange({ c: e.target.value || " " })} className={cn(input, "mt-1")} placeholder={`${a.ad} değeri`} />
      )}
    </label>
  );
}
