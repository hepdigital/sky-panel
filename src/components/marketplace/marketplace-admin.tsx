"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Barcode, ChevronDown, Download, ExternalLink, Globe, ImagePlus, Link2, Pencil, Plus, RefreshCw, Search, Send, Settings2, Store, Trash2, X } from "lucide-react";
import {
  pyAyarKaydet, pyBarkod, pyDurumYenile, pyGonder, pyKategoriAra, pyKategoriYenile, pyMarkaAra, pyOzellikler, pyUrunKaydet, pyUrunSil, pyWooAktar, pyWooAra, pyWooOnizle,
  pyWooVaryantlar, pyWooYenile,
} from "@/app/panel/satis-urunleri/actions";
import { urunGorselYukle } from "@/app/panel/urunler/actions";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { toWebp } from "@/lib/image";
import { cn, formatDate } from "@/lib/utils";

type Settings = { fiyatFarki: number; fiyatYaz: boolean; kargoFirmaId: number | null; markaId: number | null; markaAd: string | null };
type Channel = { id: number; ad: string; tur: string; aktif: boolean; pazaryeri: boolean; ayarlar: Settings; kategoriSayisi: number };
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
  fiyatFarki: number | null;
  durum: string;
  olustu: boolean;
  hata: string | null;
  sonGonderim: string | null;
  disUrunId: number | null;
  disVaryantId: number | null;
  disAd: string | null;
  disFiyat: number | null;
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
  agirlik: number | null;
  en: number | null;
  boy: number | null;
  yukseklik: number | null;
  kdv: number;
  fiyat: number | null;
  secenekDahil: boolean;
  maliyet: number | null;
  stok: number;
  hazirlikGun: number;
  aktif: boolean;
  katalogAd: string | null;
  katalogFiyat: number | null;
  katalogMaliyet: number | null;
  listelemeler: ListingRow[];
};
type CatalogRow = {
  id: number; kod: string; ad: string; aciklama: string | null; perakende: number | null; maliyet: number | null; gorsel: string | null;
  secenekAd: string | null; secenekPerakende: number | null; secenekMaliyet: number | null;
};
type WooRow = { id: number; ad: string; sku: string; varyantli: boolean; fiyat: number | null; link: string; gorsel: string | null; durum: string };
type ImportRow = {
  disVaryantId: number | null; ad: string; sku: string; fiyat: number | null; olcu: string; renk: string; gorsel: string | null; urunId: number | null; stokKodu: string; bagli: string | null;
};
type ImportPreview = { urun: { id: number; ad: string; sku: string; varyantli: boolean; aciklama: string; gorseller: string[] }; grupKodu: string; satirlar: ImportRow[] };
/** Düzenlenen kart: mevcut, yeni ya da bir grubun yeni seçeneği (ortak alanlar kopyalanır) */
type EditTarget = ItemRow | "yeni" | { kopya: ItemRow } | null;
type LogRow = { id: number; site: string; tur: string; durum: string; ozet: string; kullanici: string | null; tarih: string };
type Attr = { id: number; ad: string; zorunlu: boolean; serbest: boolean; varyant: boolean; degerler: { id: number; ad: string }[] };

const input = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:bg-muted disabled:text-muted-foreground";
const label = "mb-1 block text-xs font-semibold text-muted-foreground";
const tl = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ₺`);
const when = (iso: string | null) => (iso ? formatDate(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const desiOf = (en: number | null, boy: number | null, y: number | null) => (en && boy && y ? Math.round((en * boy * y) / 300) / 10 : null);
const numOrNull = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v.replace(",", "."))) ? null : Number(v.replace(",", ".")));

const DURUM: Record<string, { label: string; tone: BadgeTone }> = {
  taslak: { label: "Gönderilmedi", tone: "neutral" },
  gonderildi: { label: "Gönderildi, sonuç bekleniyor", tone: "info" },
  onay: { label: "Onay bekliyor", tone: "warning" },
  yayinda: { label: "Yayında", tone: "success" },
  hata: { label: "Hata", tone: "danger" },
  pasif: { label: "Satışa kapalı", tone: "neutral" },
};
/** Sitedeki ürünün yayın durumu (yayında olmayanlar aramada işaretlenir) */
const WC_DURUM: Record<string, string> = { draft: "taslak, sitede yayında değil", pending: "onay bekliyor", private: "gizli" };
const LOG_TUR: Record<string, string> = {
  "urun-olustur": "Ürün oluşturma", "urun-guncelle": "Ürün güncelleme", "urun-sonuc": "Gönderim sonucu", "fiyat-stok": "Fiyat / stok", kategori: "Kategoriler",
  "site-oku": "Site fiyatları", "site-fiyat": "Siteye fiyat",
};

/** Satış ürünleri: ortak ürün kartı + kanal başına bağlantı (WooCommerce) ya da kategori, özellik, marka ve gönderim (pazaryeri) */
export function MarketplaceAdmin({ channels, items, catalog, logs }: { channels: Channel[]; items: ItemRow[]; catalog: CatalogRow[]; logs: LogRow[] }) {
  const [edit, setEdit] = useState<EditTarget>(null);
  const [ayar, setAyar] = useState<Channel | null>(null);
  const [aktar, setAktar] = useState(false);
  const [acik, setAcik] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const list = items.filter((i) => !q.trim() || `${i.ad} ${i.stokKodu} ${i.barkod} ${i.renk} ${i.olcu}`.toLocaleLowerCase("tr").includes(q.trim().toLocaleLowerCase("tr")));
  // Aynı grup kodlu kartlar (seçenekler) tek ürün altında
  const groups = [...list.reduce((m, i) => m.set(i.grupKodu, [...(m.get(i.grupKodu) ?? []), i]), new Map<string, ItemRow[]>()).values()];
  const sites = channels.filter((c) => !c.pazaryeri);
  const toggle = (k: string) => setAcik((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : new Set([...s, k])));

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Ürünler</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Satılan ürünler: stok kodu, barkod, ölçü, kg, maliyet ve stok bir kez girilir. İstenirse teklif ürününe bağlanıp fiyatını oradan alır; sitedeki ürüne bağlanır, seçilen pazaryerlerine gönderilir.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sites.length > 0 && (
            <Button variant="outline" onClick={() => setAktar(true)}>
              <Download /> Siteden ekle
            </Button>
          )}
          <Button onClick={() => setEdit("yeni")}>
            <Plus /> Ürün ekle
          </Button>
        </div>
      </div>

      {!channels.length ? (
        <Card className="mt-5 p-8 text-center text-sm">
          <Store className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 font-semibold">Henüz site ya da pazaryeri bağlantısı yok.</p>
          <p className="mt-1 text-muted-foreground">Ürün kartları yine de açılabilir. Satış kanalları Bağlantılar ekranından eklenir (WooCommerce, Trendyol).</p>
          <Link href="/panel/siteler" className="mt-3 inline-block font-semibold text-primary hover:underline">
            Bağlantılar →
          </Link>
        </Card>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {channels.map((c) =>
            c.pazaryeri ? <ChannelCard key={c.id} c={c} items={items} onSettings={() => setAyar(c)} /> : <WooCard key={c.id} c={c} items={items} onSettings={() => setAyar(c)} />,
          )}
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
          {groups.map((g) =>
            g.length === 1 ? (
              <ItemLine key={g[0].id} i={g[0]} channels={channels} onOpen={() => setEdit(g[0])} />
            ) : (
              <GroupLine
                key={`g-${g[0].grupKodu}`}
                g={g}
                channels={channels}
                open={!!q.trim() || acik.has(g[0].grupKodu)}
                onToggle={() => toggle(g[0].grupKodu)}
                onOpen={setEdit}
                onAdd={() => setEdit({ kopya: g[0] })}
              />
            ),
          )}
          {!list.length && <p className="p-10 text-center text-sm text-muted-foreground">{items.length ? "Aramaya uyan ürün yok." : "Henüz ürün yok. “Ürün ekle” ile başlayın; bir teklif ürününden doldurabilirsiniz."}</p>}
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

      <ItemSheet
        key={`urun-${edit === null ? "kapali" : edit === "yeni" ? "yeni" : "kopya" in edit ? `kopya-${edit.kopya.id}` : edit.id}`}
        item={edit}
        items={items}
        channels={channels}
        catalog={catalog}
        onClose={() => setEdit(null)}
      />
      {sites.length > 0 && <ImportSheet key={`aktar-${aktar}`} open={aktar} channels={sites} catalog={catalog} onClose={() => setAktar(false)} />}
      <SettingsSheet key={`ayar-${ayar?.id ?? "kapali"}`} channel={ayar} onClose={() => setAyar(null)} />
    </div>
  );
}

/** Listede bir kart; seçenek satırında (sub) ad yerine ölçü/renk öne çıkar */
function ItemLine({ i, channels, onOpen, sub }: { i: ItemRow; channels: Channel[]; onOpen: () => void; sub?: boolean }) {
  return (
    <button type="button" onClick={onOpen} className={cn("flex w-full flex-wrap items-center gap-4 p-4 text-left hover:bg-muted/50", sub && "py-3 pl-8 sm:pl-[88px]", !i.aktif && "opacity-60")}>
              <div className="size-14 shrink-0 overflow-hidden rounded-xl border border-border bg-white">
                {i.gorseller[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.gorseller[0]} alt="" className="size-full object-contain" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{sub ? [i.olcu, i.renk].filter(Boolean).join(" · ") || i.stokKodu : i.ad}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {i.stokKodu} · {i.barkod}
                  {[i.olcu, i.renk].filter(Boolean).length ? ` · ${[i.olcu, i.renk].filter(Boolean).join(" · ")}` : ""} · stok {i.stok}
                  {i.desi ? ` · ${i.desi} desi` : ""}
                  {i.agirlik ? ` · ${i.agirlik} kg` : ""}
                  {!i.aktif && " · kapalı"}
                </p>
              </div>
              <div className="flex w-full flex-wrap gap-3 pl-[72px] sm:w-auto sm:pl-0">
                {channels.map((c) => {
                  const l = i.listelemeler.find((x) => x.siteId === c.id);
                  if (!l) return null;
                  if (!c.pazaryeri) return <WooBadge key={c.id} c={c} l={l} />;
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
  );
}

/** Seçenekli ürün: grup satırı (ad, seçenekler, kanal başına fiyat aralığı) ve açılınca seçenekler */
function GroupLine({
  g, channels, open, onToggle, onOpen, onAdd,
}: { g: ItemRow[]; channels: Channel[]; open: boolean; onToggle: () => void; onOpen: (i: ItemRow) => void; onAdd: () => void }) {
  const first = g[0];
  const img = g.find((i) => i.gorseller[0])?.gorseller[0];
  return (
    <div>
      <button type="button" onClick={onToggle} className="flex w-full flex-wrap items-center gap-4 p-4 text-left hover:bg-muted/50">
        <div className="size-14 shrink-0 overflow-hidden rounded-xl border border-border bg-white">
          {img && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" className="size-full object-contain" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{first.ad}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {g.length} seçenek · {g.map((i) => [i.olcu, i.renk].filter(Boolean).join(" ") || i.stokKodu).join(", ")} · stok {g.reduce((n, i) => n + i.stok, 0)}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 pl-[72px] sm:w-auto sm:pl-0">
          {channels.map((c) => {
            const ls = g.map((i) => i.listelemeler.find((x) => x.siteId === c.id && x.aktif)).filter((x): x is ListingRow => !!x);
            if (!ls.length) return null;
            const ps = ls.map((l) => l.satisFiyati).filter((n): n is number => n !== null);
            const min = Math.min(...ps);
            const max = Math.max(...ps);
            const fark = ls.filter((l) => l.disFiyat !== null && l.satisFiyati !== null && l.disFiyat !== l.satisFiyati).length;
            const hata = ls.filter((l) => l.hata).length;
            return (
              <div key={c.id} className="sm:text-right">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  {c.ad} · {ps.length ? (min === max ? tl(min) : `${tl(min)} – ${tl(max)}`) : "—"}
                </p>
                {hata ? (
                  <Badge tone="danger">Sorunlu: {hata}</Badge>
                ) : fark ? (
                  <Badge tone="warning">Fiyatı farklı: {fark}</Badge>
                ) : (
                  <Badge tone="success">
                    {c.pazaryeri ? "Listede" : "Bağlı"}: {ls.length}/{g.length}
                  </Badge>
                )}
              </div>
            );
          })}
          <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </button>
      {open && (
        <div className="divide-y divide-border border-t border-border bg-muted/30">
          {g.map((i) => (
            <ItemLine key={i.id} i={i} channels={channels} onOpen={() => onOpen(i)} sub />
          ))}
          <div className="py-2 pl-8 sm:pl-[88px]">
            <Button size="sm" variant="ghost" onClick={onAdd}>
              <Plus /> Seçenek ekle
            </Button>
          </div>
        </div>
      )}
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

/** Ürün satırında site bağlantısı: sitedeki fiyat paneldekinden farklıysa uyarı */
function WooBadge({ c, l }: { c: Channel; l: ListingRow }) {
  const fark = l.aktif && l.disFiyat !== null && l.satisFiyati !== null && l.disFiyat !== l.satisFiyati;
  return (
    <div className="max-w-[260px] sm:text-right">
      <p className="text-[11px] font-semibold text-muted-foreground">
        {c.ad} · {tl(l.aktif ? (l.disFiyat ?? l.satisFiyati) : null)}
      </p>
      {!l.aktif ? (
        <Badge tone="neutral">Bağlı değil</Badge>
      ) : l.hata ? (
        <Badge tone="danger">Sitede bulunamadı</Badge>
      ) : fark ? (
        <Badge tone="warning">Panelde {tl(l.satisFiyati)}</Badge>
      ) : (
        <Badge tone="success">Bağlı</Badge>
      )}
    </div>
  );
}

function WooCard({ c, items, onSettings }: { c: Channel; items: ItemRow[]; onSettings: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ls = items.flatMap((i) => i.listelemeler.filter((l) => l.siteId === c.id && l.aktif));
  const fark = ls.filter((l) => l.disFiyat !== null && l.satisFiyati !== null && l.disFiyat !== l.satisFiyati).length;
  const hata = ls.filter((l) => l.hata).length;
  const run = (yaz: boolean) =>
    start(async () => {
      const r = await pyWooYenile(c.id, yaz);
      setMsg(
        r.ok
          ? { ok: true, text: `${r.okunan} ürünün sitedeki fiyatı okundu${r.eksik ? `, ${r.eksik} ürün sitede yok` : ""}${yaz ? `; ${r.yazilan} ürünün fiyatı siteye yazıldı` : ""}.` }
          : { ok: false, text: r.hata },
      );
      router.refresh();
    });
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <Globe className="size-4 text-muted-foreground" /> {c.ad}
            {!c.aktif && <Badge tone="neutral">Kapalı</Badge>}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Site · fiyat farkı %{c.ayarlar.fiyatFarki} · {c.ayarlar.fiyatYaz ? "fiyatlar siteye yazılır" : "yalnızca okunur, siteye yazılmaz"}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onSettings}>
          <Settings2 /> Ayarlar
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {ls.length ? <Badge tone="success">Bağlı: {ls.length}</Badge> : <span className="text-xs text-muted-foreground">Bu siteye bağlı ürün yok.</span>}
        {fark > 0 && <Badge tone="warning">Fiyatı farklı: {fark}</Badge>}
        {hata > 0 && <Badge tone="danger">Sitede bulunamadı: {hata}</Badge>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pending || !ls.length} onClick={() => run(false)}>
          <RefreshCw className={cn(pending && "animate-spin")} /> Site fiyatlarını oku
        </Button>
        {c.ayarlar.fiyatYaz && (
          <Button size="sm" disabled={pending || !fark} onClick={() => confirm(`${fark} ürünün fiyatı sitede panel fiyatıyla değiştirilsin mi?`) && run(true)}>
            <Send /> Farklı fiyatları siteye yaz{fark ? ` (${fark})` : ""}
          </Button>
        )}
      </div>
      {msg && <p className={cn("mt-3 rounded-xl px-3 py-2 text-xs font-medium", msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>{msg.text}</p>}
    </Card>
  );
}

/* ───────────── kanal ayarları ───────────── */

function SettingsSheet({ channel, onClose }: { channel: Channel | null; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({
    fiyatFarki: String(channel?.ayarlar.fiyatFarki ?? 0), fiyatYaz: channel?.ayarlar.fiyatYaz ?? false,
    kargoFirmaId: channel?.ayarlar.kargoFirmaId ? String(channel.ayarlar.kargoFirmaId) : "",
  });
  const [marka, setMarka] = useState<{ id: number; ad: string } | null>(channel?.ayarlar.markaId ? { id: channel.ayarlar.markaId, ad: channel.ayarlar.markaAd ?? "" } : null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!channel) return null;
  async function save() {
    setBusy(true);
    const r = await pyAyarKaydet(channel!.id, {
      fiyatFarki: Number(f.fiyatFarki.replace(",", ".")) || 0, fiyatYaz: f.fiyatYaz, kargoFirmaId: numOrNull(f.kargoFirmaId), markaId: marka?.id ?? null, markaAd: marka?.ad ?? null,
    });
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
            {channel.pazaryeri
              ? "Satış fiyatı = KDV dahil perakende × (1 + fark). Komisyon ve kargo payı için. Ürüne kanal fiyatı girilirse o geçerlidir. Değişince yayındaki fiyatlar bir sonraki eşitlemede güncellenir."
              : "Site fiyatı = KDV dahil perakende × (1 + fark). Ürüne site fiyatı girilirse o geçerlidir (sitede farklı fiyat tutmak için)."}
          </span>
        </label>
        {channel.pazaryeri ? (
          <>
            <BrandPicker siteId={channel.id} value={marka} onChange={setMarka} hint="Yeni listelemelerde önerilir." />
            <label className="block">
              <span className={label}>Kargo firması kimliği (isteğe bağlı)</span>
              <input value={f.kargoFirmaId} onChange={(e) => setF({ ...f, kargoFirmaId: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className={input} placeholder="Boş: Trendyol'daki varsayılan" />
              <span className="mt-1 block text-[11px] text-muted-foreground">Trendyol’un kargo firması listesindeki numara. Boş bırakılırsa satıcı panelindeki varsayılan kullanılır.</span>
            </label>
          </>
        ) : (
          <label className="flex items-start gap-2.5 rounded-xl border border-border p-3 text-sm">
            <input type="checkbox" checked={f.fiyatYaz} onChange={(e) => setF({ ...f, fiyatYaz: e.target.checked })} className="mt-0.5 size-4 accent-[var(--primary)]" />
            <span>
              <span className="font-semibold">Fiyatları siteye yaz</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                Açıkken bağlı ürünlerde paneldeki fiyat değişince sitedeki fiyat da değişir (indirimli fiyat kaldırılır). Kapalıyken site yalnızca okunur. Başlık, görsel, açıklama ve stok hiçbir zaman yazılmaz.
              </span>
            </span>
          </label>
        )}
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

type NumField = "desi" | "agirlik" | "en" | "boy" | "yukseklik" | "fiyat" | "maliyet" | "stok" | "hazirlikGun";
type Form = Omit<ItemRow, "id" | "katalogAd" | "katalogFiyat" | "katalogMaliyet" | "listelemeler" | NumField> & Record<NumField, string>;
type ListingForm = {
  siteId: number; aktif: boolean; kategoriId: number | null; kategoriYol: string | null; markaId: number | null; markaAd: string | null; ozellikler: Values; fiyat: string; fiyatFarki: string;
  disUrunId: number | null; disVaryantId: number | null; disAd: string | null; disFiyat: number | null;
};

function ItemSheet({ item, items, channels, catalog, onClose }: { item: EditTarget; items: ItemRow[]; channels: Channel[]; catalog: CatalogRow[]; onClose: () => void }) {
  const router = useRouter();
  const it = item && item !== "yeni" && !("kopya" in item) ? item : null;
  // Yeni seçenek: ortak alanlar (ad, açıklama, grup, görseller, paket, pazaryeri kategorisi) gruptaki karttan gelir
  const kopya = item && item !== "yeni" && "kopya" in item ? item.kopya : null;
  const src = it ?? kopya;
  const [f, setF] = useState<Form>({
    stokKodu: it?.stokKodu ?? "", barkod: it?.barkod ?? "", ad: src?.ad ?? "", aciklama: src?.aciklama ?? "", grupKodu: src?.grupKodu ?? "", markaAdi: src?.markaAdi ?? "",
    urunId: it?.urunId ?? null, renk: it?.renk ?? "", olcu: it?.olcu ?? "", gorseller: src?.gorseller ?? [], kdv: src?.kdv ?? 20, aktif: it?.aktif ?? true,
    secenekDahil: it?.secenekDahil ?? false,
    desi: src?.desi?.toString() ?? "", agirlik: src?.agirlik?.toString() ?? "", en: src?.en?.toString() ?? "", boy: src?.boy?.toString() ?? "", yukseklik: src?.yukseklik?.toString() ?? "",
    fiyat: it?.fiyat?.toString() ?? "", maliyet: it?.maliyet?.toString() ?? "", stok: (src?.stok ?? 10).toString(), hazirlikGun: (src?.hazirlikGun ?? 3).toString(),
  });
  const [ls, setLs] = useState<ListingForm[]>(() =>
    channels.map((c) => {
      const l = it?.listelemeler.find((x) => x.siteId === c.id) ?? (kopya && c.pazaryeri ? kopya.listelemeler.find((x) => x.siteId === c.id) : undefined);
      return {
        siteId: c.id, aktif: l ? l.aktif : false, kategoriId: l?.kategoriId ?? null, kategoriYol: l?.kategoriYol ?? null,
        markaId: l?.markaId ?? c.ayarlar.markaId, markaAd: l?.markaAd ?? c.ayarlar.markaAd, ozellikler: l?.ozellikler ?? {}, fiyat: it ? (l?.fiyat?.toString() ?? "") : "",
        fiyatFarki: l?.fiyatFarki?.toString() ?? "",
        disUrunId: it ? (l?.disUrunId ?? null) : null, disVaryantId: it ? (l?.disVaryantId ?? null) : null, disAd: it ? (l?.disAd ?? null) : null, disFiyat: it ? (l?.disFiyat ?? null) : null,
      };
    }),
  );
  const sibs = items.filter((x) => x.grupKodu === (f.grupKodu.trim() || f.stokKodu.trim()) && x.id !== it?.id);
  const [grubaUygula, setGrubaUygula] = useState(() => !!src && items.filter((x) => x.grupKodu === src.grupKodu && x.id !== it?.id).every((x) => x.ad === src.ad));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState(false);
  const [url, setUrl] = useState("");
  const katalog = catalog.find((c) => c.id === f.urunId) ?? null;
  const katalogFiyat = katalog?.perakende == null ? null : katalog.perakende + (f.secenekDahil ? (katalog.secenekPerakende ?? 0) : 0);
  const katalogMaliyet = katalog?.maliyet == null ? null : katalog.maliyet + (f.secenekDahil ? (katalog.secenekMaliyet ?? 0) : 0);
  const base = numOrNull(f.fiyat) ?? katalogFiyat;
  const desi = desiOf(numOrNull(f.en), numOrNull(f.boy), numOrNull(f.yukseklik));

  useEffect(() => {
    if ((item === "yeni" || kopya) && !f.barkod) void pyBarkod().then((r) => r.ok && setF((x) => (x.barkod ? x : { ...x, barkod: r.barkod })));
  }, [item, kopya, f.barkod]);

  function fromCatalog(id: number) {
    const c = catalog.find((x) => x.id === id);
    if (!c) return setF({ ...f, urunId: null, secenekDahil: false });
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
      id: it?.id ?? null, ...f, desi: numOrNull(f.desi), agirlik: numOrNull(f.agirlik), en: numOrNull(f.en), boy: numOrNull(f.boy), yukseklik: numOrNull(f.yukseklik),
      fiyat: numOrNull(f.fiyat), maliyet: numOrNull(f.maliyet), stok: Number(f.stok) || 0, hazirlikGun: Number(f.hazirlikGun) || 3,
      listelemeler: ls.map((l) => ({ ...l, fiyat: numOrNull(l.fiyat), fiyatFarki: numOrNull(l.fiyatFarki) })),
      grubaUygula: sibs.length > 0 && grubaUygula,
    });
    setBusy(false);
    if (!r.ok) return setErr(r.hata);
    router.refresh();
    onClose();
  }

  async function remove() {
    if (!it || !confirm("Ürün kartı silinsin mi? Pazaryerinde oluşmuşsa silinmez, satışa kapatılır. Sitedeki ürüne dokunulmaz.")) return;
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
    <Sheet open={!!item} onClose={onClose} title={it ? it.ad : kopya ? `${kopya.ad} · yeni seçenek` : "Yeni ürün"} className="md:max-w-3xl">
      <div className="space-y-5">
        <section className="space-y-3">
          <label className="block">
            <span className={label}>Teklif ürünü (isteğe bağlı: fiyat ve maliyeti oradan alır, boş alanları doldurur)</span>
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
          {katalog?.secenekAd && (
            <label className="-mt-1 flex items-center gap-2.5 text-sm">
              <input type="checkbox" checked={f.secenekDahil} onChange={(e) => setF({ ...f, secenekDahil: e.target.checked })} className="size-4 accent-[var(--primary)]" />
              “{katalog.secenekAd}” fiyata dahil (+{tl(katalog.secenekPerakende)})
            </label>
          )}
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

        <section className="grid gap-3 sm:grid-cols-4">
          <label className="block sm:col-span-2">
            <span className={label}>Perakende fiyat (KDV hariç)</span>
            <input value={f.fiyat} onChange={(e) => setF({ ...f, fiyat: e.target.value })} inputMode="decimal" className={input} placeholder={katalogFiyat !== null ? `Teklif ürününden: ${tl(katalogFiyat)}` : "₺"} />
          </label>
          <label className="block">
            <span className={label}>Maliyet (KDV hariç)</span>
            <input value={f.maliyet} onChange={(e) => setF({ ...f, maliyet: e.target.value })} inputMode="decimal" className={input} placeholder={katalogMaliyet !== null ? tl(katalogMaliyet) : "₺"} />
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
        </section>

        <section>
          <p className={label}>Paket (kargo maliyeti ve pazaryeri desisi buradan)</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(
              [
                ["en", "En (cm)"],
                ["boy", "Boy (cm)"],
                ["yukseklik", "Yükseklik (cm)"],
                ["agirlik", "Ağırlık (kg)"],
              ] as const
            ).map(([k, t]) => (
              <label key={k} className="block">
                <span className={label}>{t}</span>
                <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} inputMode="decimal" className={input} />
              </label>
            ))}
            <label className="block">
              <span className={label}>Desi</span>
              <input value={desi !== null ? String(desi) : f.desi} onChange={(e) => setF({ ...f, desi: e.target.value })} disabled={desi !== null} inputMode="decimal" className={input} placeholder="ör. 25" />
            </label>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Desi = en × boy × yükseklik / 3000; ölçüler girilince kendiliğinden hesaplanır.</p>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block">
            <span className={label}>Stok</span>
            <input value={f.stok} onChange={(e) => setF({ ...f, stok: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className={input} />
          </label>
          <label className="block">
            <span className={label}>Hazırlık süresi (iş günü)</span>
            <input value={f.hazirlikGun} onChange={(e) => setF({ ...f, hazirlikGun: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className={input} />
          </label>
          <label className="col-span-2 flex items-end gap-2.5 pb-2.5 text-sm">
            <input type="checkbox" checked={f.aktif} onChange={(e) => setF({ ...f, aktif: e.target.checked })} className="size-4 accent-[var(--primary)]" />
            Satışta (kapatılırsa pazaryerlerinde stok 0 gönderilir)
          </label>
          <p className="col-span-2 text-[11px] text-muted-foreground sm:col-span-4">
            Siparişe üretim yapılıyorsa stoku sabit bir sayı tutun (ör. 10); pazaryeri satışla düşürür, panelden gönderilen değer yeniden yazar.
          </p>
        </section>

        {channels.some((c) => !c.pazaryeri) && <h3 className="pt-1 text-[13px] font-bold tracking-wide text-muted-foreground uppercase">E-ticaret sitesi</h3>}
        {channels.map((c, idx) =>
          c.pazaryeri ? null : (
            <WooSection
              key={c.id}
              c={c}
              l={ls[idx]}
              onChange={(patch) => setLs(ls.map((x, i) => (i === idx ? { ...x, ...patch } : x)))}
              base={base}
              kdv={f.kdv}
              hata={it?.listelemeler.find((x) => x.siteId === c.id)?.hata ?? null}
            />
          ),
        )}
        {channels.some((c) => c.pazaryeri) && <h3 className="pt-1 text-[13px] font-bold tracking-wide text-muted-foreground uppercase">Pazaryerleri</h3>}
        {channels.map((c, idx) =>
          c.pazaryeri ? (
            <ListingSection
              key={c.id}
              c={c}
              l={ls[idx]}
              onChange={(patch) => setLs(ls.map((x, i) => (i === idx ? { ...x, ...patch } : x)))}
              base={base}
              kdv={f.kdv}
              status={it?.listelemeler.find((x) => x.siteId === c.id) ?? null}
            />
          ) : null,
        )}

        {sibs.length > 0 && (
          <label className="flex items-start gap-2.5 rounded-xl border border-border px-3 py-2.5 text-sm">
            <input type="checkbox" checked={grubaUygula} onChange={(e) => setGrubaUygula(e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
            <span>
              Ad, açıklama, marka, KDV ve hazırlık süresi gruptaki diğer {sibs.length} seçeneğe de uygulansın
              <span className="block text-[11px] text-muted-foreground">Stok kodu, barkod, ölçü/renk, fiyat, stok ve site bağlantısı her seçenekte ayrı kalır.</span>
            </span>
          </label>
        )}
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
        <p className="text-center text-[11px] text-muted-foreground">Kayıt pazaryerine göndermez; kanal kartındaki “Bekleyenleri gönder” ile gönderilir. Siteye fiyat yalnızca site ayarında açıksa yazılır.</p>
      </div>
    </Sheet>
  );
}

/** Sitedeki ürüne bağlantı: ürün aranır, varyantlıysa varyant seçilir; site fiyatı korunabilir */
function WooSection({ c, l, onChange, base, kdv, hata }: { c: Channel; l: ListingForm; onChange: (p: Partial<ListingForm>) => void; base: number | null; kdv: number; hata: string | null }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<WooRow[]>([]);
  const [vars, setVars] = useState<{ urun: WooRow; liste: { id: number; ad: string; sku: string; fiyat: number | null }[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fark = numOrNull(l.fiyatFarki) ?? c.ayarlar.fiyatFarki;
  const hesap = base === null ? null : Math.round(base * (1 + kdv / 100) * (1 + fark / 100));
  const satis = numOrNull(l.fiyat) ?? hesap;
  // Sitedeki fiyatı veren fark: teklif ürününün fiyatı değişince site fiyatı da onunla değişir
  const siteFark = base && l.disFiyat ? Math.round((l.disFiyat / (base * (1 + kdv / 100)) - 1) * 10000) / 100 : null;

  const search = () =>
    start(async () => {
      const r = await pyWooAra(c.id, q);
      if (!r.ok) return setErr(r.hata);
      setErr(r.liste.length ? null : "Sitede bu adla ürün bulunamadı.");
      setRes(r.liste);
      setVars(null);
    });
  const pick = (p: WooRow) =>
    p.varyantli
      ? start(async () => {
          const r = await pyWooVaryantlar(c.id, p.id);
          if (!r.ok) return setErr(r.hata);
          setVars({ urun: p, liste: r.liste });
        })
      : (onChange({ aktif: true, disUrunId: p.id, disVaryantId: null, disAd: p.ad, disFiyat: p.fiyat }), setRes([]));

  return (
    <section className={cn("rounded-2xl border p-4", l.aktif ? "border-primary/40" : "border-border")}>
      <p className="flex items-center gap-2 text-[15px] font-semibold">
        <Globe className="size-4 text-muted-foreground" /> {c.ad}
      </p>
      {hata && <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium break-words text-danger">{hata}</p>}
      {l.aktif && l.disUrunId ? (
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <Link2 className="size-4 shrink-0 text-success" />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{l.disAd ?? `#${l.disUrunId}`}</span>
                <span className="text-xs text-muted-foreground">
                  Sitede {tl(l.disFiyat)} · #{l.disUrunId}
                  {l.disVaryantId ? ` / varyant #${l.disVaryantId}` : ""}
                </span>
              </span>
            </span>
            <button type="button" onClick={() => onChange({ aktif: false, disUrunId: null, disVaryantId: null, disAd: null, disFiyat: null })} className="text-muted-foreground hover:text-foreground" aria-label="Bağlantıyı kaldır">
              <X className="size-4" />
            </button>
          </div>
          <PriceFields c={c} l={l} onChange={onChange} hesap={hesap} fark={fark} sabitLabel="Sabit site fiyatı (KDV dahil)" />
          {l.disFiyat !== null && satis !== l.disFiyat && (
            <div className="flex flex-wrap gap-2">
              {siteFark !== null && (
                <Button size="sm" variant="outline" onClick={() => onChange({ fiyatFarki: String(siteFark), fiyat: "" })}>
                  Farkı sitedekine göre ayarla (%{siteFark.toLocaleString("tr-TR")})
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => onChange({ fiyat: String(l.disFiyat) })}>
                Sitedeki fiyatı sabitle
              </Button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            {satis !== null && l.disFiyat !== null && satis !== l.disFiyat ? `Panel ${tl(satis)}, sitede ${tl(l.disFiyat)}. ` : ""}
            {c.ayarlar.fiyatYaz ? "Fark siteye yazılır." : "Site ayarında fiyat yazma kapalı; site değişmez."}
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())} className={input} placeholder="Sitedeki ürünü arayın (ad ya da stok kodu)" />
            <Button variant="outline" className="h-10" disabled={pending || q.trim().length < 2} onClick={search}>
              <Search /> Ara
            </Button>
          </div>
          {vars ? (
            <div className="mt-1 max-h-64 overflow-auto rounded-xl border border-border">
              <p className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-2 text-xs font-semibold">
                {vars.urun.ad} · varyant seçin
                <button type="button" onClick={() => setVars(null)} className="text-primary hover:underline">
                  Geri
                </button>
              </p>
              {vars.liste.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => (onChange({ aktif: true, disUrunId: vars.urun.id, disVaryantId: v.id, disAd: `${vars.urun.ad} · ${v.ad}`, disFiyat: v.fiyat }), setVars(null), setRes([]))}
                  className="flex w-full justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span>
                    {v.ad}
                    {v.sku && <span className="text-xs text-muted-foreground"> · {v.sku}</span>}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{tl(v.fiyat)}</span>
                </button>
              ))}
            </div>
          ) : (
            res.length > 0 && (
              <div className="mt-1 max-h-64 overflow-auto rounded-xl border border-border">
                {res.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted">
                    <button type="button" onClick={() => pick(p)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className="size-9 shrink-0 overflow-hidden rounded-lg border border-border bg-white">
                        {p.gorsel && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.gorsel} alt="" className="size-full object-contain" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate">{p.ad}</span>
                        <span className="text-xs text-muted-foreground">
                          {p.sku || "stok kodu yok"} · {p.varyantli ? "varyantlı" : tl(p.fiyat)}
                          {p.durum !== "publish" && <span className="font-semibold text-warning"> · {WC_DURUM[p.durum] ?? p.durum}</span>}
                        </span>
                      </span>
                    </button>
                    <a href={p.link} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Sitede aç">
                      <ExternalLink className="size-4" />
                    </a>
                  </div>
                ))}
              </div>
            )
          )}
          {err ? <p className="mt-1 text-[11px] font-medium text-danger">{err}</p> : <p className="mt-1 text-[11px] text-muted-foreground">Bağlanmazsa bu ürün sitede yönetilmez; sitedeki ürüne dokunulmaz.</p>}
        </div>
      )}
    </section>
  );
}

/** Kanal fiyatı: ürüne özel fark (%; boşsa kanalınki) ya da sabit fiyat */
function PriceFields({
  c, l, onChange, hesap, fark, sabitLabel,
}: { c: Channel; l: ListingForm; onChange: (p: Partial<ListingForm>) => void; hesap: number | null; fark: number; sabitLabel: string }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2">
      <label className="block">
        <span className={label}>Fark %</span>
        <input value={l.fiyatFarki} onChange={(e) => onChange({ fiyatFarki: e.target.value })} inputMode="decimal" className={input} placeholder={`${c.ayarlar.fiyatFarki}`} />
      </label>
      <label className="block">
        <span className={label}>{sabitLabel}</span>
        <input value={l.fiyat} onChange={(e) => onChange({ fiyat: e.target.value })} inputMode="decimal" className={input} placeholder={hesap ? `Hesaplanan ${tl(hesap)}` : "Önce perakende fiyat girin"} />
      </label>
      <span className="col-span-2 -mt-1 text-[11px] text-muted-foreground">
        {numOrNull(l.fiyat)
          ? "Sabit fiyat geçerli; teklif ürününün fiyatı değişse de değişmez."
          : hesap
            ? `KDV dahil perakende × %${fark.toLocaleString("tr-TR")} fark = ${tl(hesap)}${l.fiyatFarki.trim() ? " (bu ürüne özel fark)" : " (kanalın farkı)"}`
            : "Fiyat yoksa gönderilmez."}
      </span>
    </div>
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
  const fark = numOrNull(l.fiyatFarki) ?? c.ayarlar.fiyatFarki;
  const hesap = base === null ? null : Math.round(base * (1 + kdv / 100) * (1 + fark / 100));

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
            <PriceFields c={c} l={l} onChange={onChange} hesap={hesap} fark={fark} sabitLabel="Sabit fiyat (KDV dahil)" />
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

/* ───────────── siteden ekle ───────────── */

/** Sitedeki ürünü kart(lar)a aktarır: varyantlıysa her varyant ayrı seçenek kartı olur (aynı grup kodu) ve kendi varyantına bağlanır */
function ImportSheet({ open, channels, catalog, onClose }: { open: boolean; channels: Channel[]; catalog: CatalogRow[]; onClose: () => void }) {
  const router = useRouter();
  const [siteId, setSiteId] = useState(channels[0]?.id ?? 0);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<WooRow[]>([]);
  const [pv, setPv] = useState<ImportPreview | null>(null);
  const [rows, setRows] = useState<(ImportRow & { sec: boolean })[]>([]);
  const [ad, setAd] = useState("");
  const [grup, setGrup] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const c = channels.find((x) => x.id === siteId) ?? channels[0];
  const secili = rows.filter((r) => r.sec && !r.bagli);
  const panelPrice = (r: ImportRow) => {
    const k = catalog.find((x) => x.id === r.urunId);
    return k?.perakende == null ? null : Math.round(k.perakende * 1.2 * (1 + (c?.ayarlar.fiyatFarki ?? 0) / 100));
  };

  const search = () =>
    start(async () => {
      const r = await pyWooAra(siteId, q);
      if (!r.ok) return setErr(r.hata);
      setErr(r.liste.length ? null : "Sitede bu adla ürün bulunamadı.");
      setRes(r.liste);
    });
  const pick = (p: WooRow) =>
    start(async () => {
      const r = await pyWooOnizle(siteId, p.id);
      if (!r.ok) return setErr(r.hata);
      setErr(null);
      setPv(r);
      setRows(r.satirlar.map((x) => ({ ...x, sec: !x.bagli })));
      setAd(r.urun.ad);
      setGrup(r.grupKodu);
    });
  const save = () =>
    start(async () => {
      if (!pv) return;
      const r = await pyWooAktar({
        siteId, disUrunId: pv.urun.id, ad, aciklama: pv.urun.aciklama, grupKodu: grup, kdv: 20,
        satirlar: secili.map((x) => ({ disVaryantId: x.disVaryantId, stokKodu: x.stokKodu, urunId: x.urunId, olcu: x.olcu, renk: x.renk })),
      });
      if (!r.ok) return setErr(r.hata);
      router.refresh();
      if (r.hatalar.length) return setErr(`${r.eklenen} kart eklendi; eklenemeyenler: ${r.hatalar.join("; ")}`);
      onClose();
    });
  const patch = (i: number, p: Partial<ImportRow & { sec: boolean }>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <Sheet open={open} onClose={onClose} title="Siteden ekle" className="md:max-w-3xl">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Sitedeki ürünü seçin. Varyantlıysa her varyant ayrı seçenek olur (kendi stok kodu, barkodu ve stoku) ve listede tek ürün altında görünür. Teklif ürünü ölçü ve
          addan önerilir; fiyat oradan gelir. Sitede hiçbir şey değişmez.
        </p>
        {!pv ? (
          <>
            {channels.length > 1 && (
              <select value={siteId} onChange={(e) => (setSiteId(Number(e.target.value)), setRes([]))} className={input}>
                {channels.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.ad}
                  </option>
                ))}
              </select>
            )}
            <div className="flex gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())} className={input} placeholder="Sitedeki ürünü arayın (ad ya da stok kodu)" />
              <Button variant="outline" className="h-10" disabled={pending || q.trim().length < 2} onClick={search}>
                <Search /> Ara
              </Button>
            </div>
            {res.length > 0 && (
              <div className="max-h-[60vh] overflow-auto rounded-xl border border-border">
                {res.map((p) => (
                  <button key={p.id} type="button" disabled={pending} onClick={() => pick(p)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted">
                    <span className="size-10 shrink-0 overflow-hidden rounded-lg border border-border bg-white">
                      {p.gorsel && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.gorsel} alt="" className="size-full object-contain" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.ad}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.sku || "stok kodu yok"} · {p.varyantli ? "varyantlı" : tl(p.fiyat)}
                        {p.durum !== "publish" && <span className="font-semibold text-warning"> · {WC_DURUM[p.durum] ?? p.durum}</span>}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 rounded-xl border border-border p-3">
              <span className="size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-white">
                {pv.urun.gorseller[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pv.urun.gorseller[0]} alt="" className="size-full object-contain" />
                )}
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="block truncate font-semibold">{pv.urun.ad}</span>
                <span className="text-xs text-muted-foreground">
                  #{pv.urun.id} · {pv.urun.varyantli ? `${pv.satirlar.length} varyant` : "tek ürün"} · {pv.urun.gorseller.length} görsel
                </span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => (setPv(null), setRows([]))}>
                <ArrowLeft /> Geri
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
              <label className="block">
                <span className={label}>Ürün adı (tüm seçeneklerde)</span>
                <input value={ad} onChange={(e) => setAd(e.target.value)} maxLength={150} className={input} />
              </label>
              <label className="block">
                <span className={label}>Grup kodu</span>
                <input value={grup} onChange={(e) => setGrup(e.target.value.replace(/\s/g, ""))} className={input} />
              </label>
            </div>
            <div className="divide-y divide-border rounded-xl border border-border">
              {rows.map((r, i) => {
                const pp = panelPrice(r);
                return (
                  <div key={r.disVaryantId ?? 0} className={cn("space-y-2 p-3", (r.bagli || !r.sec) && "bg-muted/40")}>
                    <label className="flex items-center gap-2.5 text-sm">
                      <input type="checkbox" checked={r.sec && !r.bagli} disabled={!!r.bagli} onChange={(e) => patch(i, { sec: e.target.checked })} className="size-4 accent-[var(--primary)]" />
                      <span className="font-semibold">{r.ad || "Tek ürün"}</span>
                      <span className="text-muted-foreground">· sitede {tl(r.fiyat)}</span>
                      {r.urunId && pp !== null && (
                        <span className={cn("text-xs", pp === r.fiyat ? "text-success" : "text-warning")}>· panel {tl(pp)}</span>
                      )}
                    </label>
                    {r.bagli ? (
                      <p className="pl-6 text-xs text-muted-foreground">Zaten bağlı: {r.bagli} ({r.stokKodu})</p>
                    ) : (
                      r.sec && (
                        <div className="grid gap-2 pl-6 sm:grid-cols-[1fr_180px]">
                          <select value={r.urunId ?? ""} onChange={(e) => patch(i, { urunId: Number(e.target.value) || null })} className={input}>
                            <option value="">Teklif ürününe bağlama (fiyat siteden)</option>
                            {catalog.map((k) => (
                              <option key={k.id} value={k.id}>
                                {k.ad}
                                {k.aciklama ? ` · ${k.aciklama}` : ""} · {tl(k.perakende)}
                              </option>
                            ))}
                          </select>
                          <input value={r.stokKodu} onChange={(e) => patch(i, { stokKodu: e.target.value.replace(/\s/g, "") })} className={input} placeholder="Stok kodu" />
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Barkod her seçeneğe panelde üretilir; açıklama ve görseller siteden alınır. Kg, paket ölçüleri ve pazaryeri bilgileri sonra karttan girilir.
            </p>
            <Button size="lg" className="w-full" disabled={pending || !secili.length || !ad.trim() || !grup.trim()} onClick={save}>
              {pending ? "Ekleniyor…" : `${secili.length} kart ekle ve bağla`}
            </Button>
          </>
        )}
        {err && <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium break-words text-danger">{err}</p>}
      </div>
    </Sheet>
  );
}
