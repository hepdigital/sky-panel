"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowUp, EyeOff, ImagePlus, Palette, Pencil, Plus, Search, Tent, Trash2 } from "lucide-react";
import { kategoriKaydet, kategoriTasi, renkStok, urunFiyat, urunGorselYukle, urunKaydet, urunTasi } from "@/app/panel/urunler/actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { toWebp } from "@/lib/image";
import { imgSrc } from "@/lib/terminal/calc";
import { cn } from "@/lib/utils";

type Category = { id: number; ad: string; aciklama: string | null; uyari: string | null; aktif: boolean };
type Product = {
  id: number;
  kod: string;
  kategoriId: number | null;
  ad: string;
  aciklama: string | null;
  gorsel: string | null;
  toptan: number | null;
  perakende: number | null;
  uyari: string | null;
  aktif: boolean;
  renkSecimi: boolean;
  secenekAd: string | null;
  secenekToptan: number | null;
  secenekPerakende: number | null;
  ekleyen: string | null;
  duzenlenebilir: boolean;
  /** Yalnızca yöneticiye dolu gelir */
  maliyet: number | null;
  secenekMaliyet: number | null;
  markalar: Override[];
};
type Override = { markaId: number; toptan: number | null; perakende: number | null; gorsel: string | null; gizli: boolean };
type Brand = { id: number; ad: string; renk: string };
type FabricColor = { hex: string; ad: string; aktif: boolean };

const input = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";
const label = "mb-1 block text-xs font-semibold text-muted-foreground";
/** "1.250" / "1250,50" → 1250.5; boş → null ("fiyat sorunuz") */
const parsePrice = (v: string) => {
  const t = v.trim().replace(/\./g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};
const showPrice = (n: number | null) => (n === null ? "" : n.toLocaleString("tr-TR", { maximumFractionDigits: 2 }));

/**
 * Ürünler (modüler gazebo dışındaki her şey): kategorilere göre liste, satır içi fiyat düzenleme, yeni ürün ve görsel.
 * Teklif ekranının ürün menüsü buradan beslenir; fiyat değişikliği kayıtlı teklifleri etkilemez (teklif o anki fiyatı saklar).
 */
export function ProductAdmin({
  admin,
  brands,
  colors,
  kategoriler,
  urunler,
}: {
  admin: boolean;
  brands: Brand[];
  colors: FabricColor[];
  kategoriler: Category[];
  urunler: Product[];
}) {
  const [q, setQ] = useState("");
  const [colorsOpen, setColorsOpen] = useState(false);
  const outCount = colors.filter((c) => !c.aktif).length;
  const [editing, setEditing] = useState<Product | "yeni" | null>(null);
  const [cat, setCat] = useState<Category | "yeni" | null>(null);
  const [newIn, setNewIn] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const filtered = useMemo(() => {
    const s = q.trim().toLocaleLowerCase("tr-TR");
    return s ? urunler.filter((u) => `${u.ad} ${u.aciklama ?? ""} ${u.kod}`.toLocaleLowerCase("tr-TR").includes(s)) : urunler;
  }, [q, urunler]);
  const move = (fn: () => Promise<unknown>) => start(async () => void (await fn(), router.refresh()));

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Ürünler</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Teklif ekranının ürün menüsü buradan gelir · fiyatlar KDV hariç · boş fiyat “fiyat sorunuz” demektir
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {admin && (
            <Link href="/panel/urunler/gazebo" className={buttonVariants({ variant: "outline" })}>
              <Tent /> Modüler gazebo fiyatları
            </Link>
          )}
          {admin && (
            <Button variant="outline" onClick={() => setColorsOpen(true)}>
              <Palette /> Kumaş renkleri
              {outCount > 0 && <Badge tone="danger">{outCount} stokta yok</Badge>}
            </Button>
          )}
          {admin && (
            <Button variant="outline" onClick={() => setCat("yeni")}>
              <Plus /> Kategori
            </Button>
          )}
          <Button
            onClick={() => {
              setNewIn(null);
              setEditing("yeni");
            }}
          >
            <Plus /> Yeni ürün
          </Button>
        </div>
      </div>

      <label className="mt-5 flex h-11 max-w-md items-center gap-2.5 rounded-xl border border-input bg-card px-4 text-sm focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
        <Search className="size-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ürün ara" className="w-full bg-transparent outline-none placeholder:text-muted-foreground" />
      </label>

      <div className="mt-4 space-y-4">
        {kategoriler.map((k, ki) => {
          const items = filtered.filter((u) => u.kategoriId === k.id);
          if (q && !items.length) return null;
          return (
            <Card key={k.id} className={cn("overflow-hidden", !k.aktif && "opacity-70")}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <h2 className="flex items-center gap-2 text-[15px] font-bold">
                    {k.ad}
                    <span className="text-xs font-medium text-muted-foreground">{items.length} ürün</span>
                    {!k.aktif && <Badge tone="neutral">Menüde gizli</Badge>}
                  </h2>
                  {k.aciklama && k.aciklama !== k.ad && <p className="text-xs text-muted-foreground">{k.aciklama}</p>}
                  {k.uyari && (
                    <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-warning">
                      <AlertTriangle className="mt-px size-3.5 shrink-0" /> {k.uyari}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {admin && (
                    <>
                      <IconBtn label="Menüde yukarı" disabled={pending || ki === 0} onClick={() => move(() => kategoriTasi(k.id, -1))}>
                        <ArrowUp />
                      </IconBtn>
                      <IconBtn label="Menüde aşağı" disabled={pending || ki === kategoriler.length - 1} onClick={() => move(() => kategoriTasi(k.id, 1))}>
                        <ArrowDown />
                      </IconBtn>
                      <IconBtn label="Kategoriyi düzenle" onClick={() => setCat(k)}>
                        <Pencil />
                      </IconBtn>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="soft"
                    onClick={() => {
                      setNewIn(k.id);
                      setEditing("yeni");
                    }}
                  >
                    <Plus /> Ürün
                  </Button>
                </div>
              </div>
              {items.length ? (
                <ul className="divide-y divide-border">
                  {items.map((u, i) => (
                    <ProductRow
                      key={u.id}
                      u={u}
                      onEdit={() => setEditing(u)}
                      move={admin && !q ? { up: i > 0, down: i < items.length - 1, go: (d) => move(() => urunTasi(u.id, d)), pending } : null}
                    />
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-6 text-center text-sm text-muted-foreground">Bu kategoride ürün yok.</p>
              )}
            </Card>
          );
        })}
        {filtered.some((u) => u.kategoriId === null) && (
          <Card className="overflow-hidden">
            <h2 className="border-b border-border px-5 py-3.5 text-[15px] font-bold">Kategorisiz (teklif ekranında görünmez)</h2>
            <ul className="divide-y divide-border">
              {filtered
                .filter((u) => u.kategoriId === null)
                .map((u) => (
                  <ProductRow key={u.id} u={u} onEdit={() => setEditing(u)} move={null} />
                ))}
            </ul>
          </Card>
        )}
      </div>

      <ProductSheet
        key={editing === "yeni" ? `yeni-${newIn}` : editing ? `urun-${editing.id}` : "urun-kapali"}
        product={editing}
        kategoriId={newIn}
        kategoriler={kategoriler}
        admin={admin}
        brands={brands}
        onClose={() => setEditing(null)}
      />
      {admin && <ColorSheet open={colorsOpen} colors={colors} onClose={() => setColorsOpen(false)} />}
      {admin && <CategorySheet key={cat === "yeni" ? "yeni" : (cat ? `kat-${cat.id}` : "kat-kapali")} category={cat} onClose={() => setCat(null)} />}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}

/** Ürün satırı: fiyatlar satır içinde düzenlenir, alandan çıkınca kaydedilir */
function ProductRow({ u, onEdit, move }: { u: Product; onEdit: () => void; move: { up: boolean; down: boolean; go: (d: -1 | 1) => void; pending: boolean } | null }) {
  const router = useRouter();
  const [t, setT] = useState(showPrice(u.toptan));
  const [p, setP] = useState(showPrice(u.perakende));
  const [state, setState] = useState<"" | "kaydediliyor" | "kaydedildi" | string>("");

  async function save() {
    const toptan = parsePrice(t);
    const perakende = parsePrice(p);
    if (Number.isNaN(toptan) || Number.isNaN(perakende)) return setState("Geçersiz fiyat");
    if (toptan === u.toptan && perakende === u.perakende) return;
    setState("kaydediliyor");
    const r = await urunFiyat(u.id, toptan, perakende);
    setState(r.ok ? "kaydedildi" : r.hata);
    if (r.ok) router.refresh();
  }
  const priceInput = (v: string, set: (v: string) => void, name: string) => (
    <input
      value={v}
      disabled={!u.duzenlenebilir}
      onChange={(e) => {
        set(e.target.value);
        setState("");
      }}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      inputMode="decimal"
      placeholder="sorunuz"
      aria-label={`${u.ad} ${name} fiyatı`}
      className="tabular h-9 w-full rounded-lg border border-input bg-card px-2.5 text-right text-sm font-semibold outline-none focus:border-primary disabled:border-transparent disabled:bg-transparent"
    />
  );

  return (
    <li className={cn("grid grid-cols-[56px_1fr] items-center gap-x-3 gap-y-2 px-5 py-3 md:grid-cols-[56px_1fr_120px_120px_auto]", !u.aktif && "opacity-60")}>
      <span className="relative size-14 overflow-hidden rounded-lg bg-white ring-1 ring-border">
        {u.gorsel && <Image src={imgSrc(u.gorsel)} alt="" fill sizes="56px" className="object-contain p-1" unoptimized={u.gorsel.startsWith("/dosya/")} />}
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold leading-tight">
          {u.ad}
          {!u.aktif && <Badge tone="neutral">Pasif</Badge>}
          {u.renkSecimi && <Badge tone="info">Renkli</Badge>}
          {u.secenekAd && <Badge tone="info">+ {u.secenekAd}</Badge>}
          {u.markalar.some((o) => o.gizli) && <Badge tone="neutral">Bazı markalarda gizli</Badge>}
          {u.markalar.some((o) => o.toptan !== null || o.perakende !== null || o.gorsel) && <Badge tone="neutral">Markaya özel fiyat/görsel</Badge>}
        </p>
        <p className="truncate text-xs text-muted-foreground">{u.aciklama || "—"}</p>
        {u.uyari && <p className="truncate text-[11px] font-medium text-warning">{u.uyari}</p>}
        {state && <p className={cn("text-[11px]", state === "kaydedildi" ? "text-success" : state === "kaydediliyor" ? "text-muted-foreground" : "text-danger")}>{state === "kaydedildi" ? "Fiyat kaydedildi" : state === "kaydediliyor" ? "Kaydediliyor…" : state}</p>}
      </div>
      <label className="col-start-2 md:col-start-auto">
        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:hidden">Toptan</span>
        {priceInput(t, setT, "toptan")}
      </label>
      <label className="col-start-2 md:col-start-auto">
        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:hidden">Perakende</span>
        {priceInput(p, setP, "perakende")}
      </label>
      <div className="col-start-2 flex items-center justify-end gap-0.5 md:col-start-auto">
        {move && (
          <>
            <IconBtn label="Yukarı" disabled={move.pending || !move.up} onClick={() => move.go(-1)}>
              <ArrowUp />
            </IconBtn>
            <IconBtn label="Aşağı" disabled={move.pending || !move.down} onClick={() => move.go(1)}>
              <ArrowDown />
            </IconBtn>
          </>
        )}
        {u.duzenlenebilir && (
          <IconBtn label="Düzenle" onClick={onEdit}>
            <Pencil />
          </IconBtn>
        )}
      </div>
    </li>
  );
}


function ProductSheet({
  product,
  kategoriId,
  kategoriler,
  admin,
  brands,
  onClose,
}: {
  product: Product | "yeni" | null;
  kategoriId: number | null;
  kategoriler: Category[];
  admin: boolean;
  brands: Brand[];
  onClose: () => void;
}) {
  const router = useRouter();
  const p = product && product !== "yeni" ? product : null;
  // Markaya özel değerler: her marka için bir satır (boş = ortak değer)
  const [ov, setOv] = useState(() =>
    brands.map((b) => {
      const o = p?.markalar.find((x) => x.markaId === b.id);
      return { markaId: b.id, toptan: showPrice(o?.toptan ?? null), perakende: showPrice(o?.perakende ?? null), gorsel: o?.gorsel ?? null, gizli: o?.gizli ?? false };
    }),
  );
  const [ovOpen, setOvOpen] = useState(() => !!p?.markalar.length);
  const [maliyet, setMaliyet] = useState({ m: showPrice(p?.maliyet ?? null), s: showPrice(p?.secenekMaliyet ?? null) });
  const [f, setF] = useState({
    kategoriId: p?.kategoriId ?? kategoriId ?? kategoriler[0]?.id ?? 0,
    ad: p?.ad ?? "",
    aciklama: p?.aciklama ?? "",
    gorsel: p?.gorsel ?? null,
    toptan: showPrice(p?.toptan ?? null),
    perakende: showPrice(p?.perakende ?? null),
    uyari: p?.uyari ?? "",
    aktif: p?.aktif ?? true,
    renkSecimi: p?.renkSecimi ?? false,
    secenekAd: p?.secenekAd ?? "",
    secenekToptan: showPrice(p?.secenekToptan ?? null),
    secenekPerakende: showPrice(p?.secenekPerakende ?? null),
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setErr(null);
    setBusy(true);
    try {
      const r = await urunGorselYukle(await toWebp(file));
      if (r.ok) setF((x) => ({ ...x, gorsel: r.yol }));
      else setErr(r.hata);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Görsel okunamadı.");
    }
    setBusy(false);
  }

  async function save() {
    const toptan = parsePrice(f.toptan);
    const perakende = parsePrice(f.perakende);
    const sToptan = parsePrice(f.secenekToptan);
    const sPerakende = parsePrice(f.secenekPerakende);
    const mal = parsePrice(maliyet.m);
    const sMal = parsePrice(maliyet.s);
    const markalar = ov.map((o) => ({ markaId: o.markaId, toptan: parsePrice(o.toptan), perakende: parsePrice(o.perakende), gorsel: o.gorsel, gizli: o.gizli }));
    if ([toptan, perakende, sToptan, sPerakende, mal, sMal, ...markalar.flatMap((o) => [o.toptan, o.perakende])].some((n) => Number.isNaN(n))) return setErr("Fiyatları rakamla yazın (ör. 1.250).");
    setBusy(true);
    const r = await urunKaydet({
      id: p?.id ?? null, kategoriId: f.kategoriId, ad: f.ad, aciklama: f.aciklama, gorsel: f.gorsel, toptan, perakende, uyari: f.uyari, aktif: f.aktif, renkSecimi: f.renkSecimi,
      secenekAd: f.secenekAd, secenekToptan: sToptan, secenekPerakende: sPerakende,
      ...(admin ? { maliyet: mal, secenekMaliyet: sMal, markalar } : {}),
    });
    setBusy(false);
    if (!r.ok) return setErr(r.hata);
    router.refresh();
    onClose();
  }

  return (
    <Sheet open={!!product} onClose={onClose} title={p ? "Ürünü düzenle" : "Yeni ürün"} className="md:max-w-xl">
      <div className="space-y-3">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-input bg-white text-muted-foreground hover:border-primary"
          >
            {f.gorsel ? <Image src={imgSrc(f.gorsel)} alt="" fill sizes="96px" className="object-contain p-1" unoptimized /> : <ImagePlus className="size-6" />}
          </button>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 text-xs text-muted-foreground">
            <p>Ürün görseli: teklif ekranında, teklif sayfasında ve PDF&apos;te görünür. Beyaz zeminli, kare görsel en iyisidir.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
                <ImagePlus /> {f.gorsel ? "Değiştir" : "Görsel seç"}
              </Button>
              {f.gorsel && (
                <Button size="sm" variant="ghost" onClick={() => setF({ ...f, gorsel: null })}>
                  <Trash2 /> Kaldır
                </Button>
              )}
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
        </div>
        <label className="block">
          <span className={label}>Kategori</span>
          <select value={f.kategoriId} onChange={(e) => setF({ ...f, kategoriId: Number(e.target.value) })} className={input}>
            {kategoriler.map((k) => (
              <option key={k.id} value={k.id}>
                {k.ad}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Ürün adı</span>
          <input value={f.ad} onChange={(e) => setF({ ...f, ad: e.target.value })} maxLength={160} className={input} placeholder="ör. Dikey A-Pano" />
        </label>
        <label className="block">
          <span className={label}>Açıklama / ölçü (teklifte ürün adının altında yazar)</span>
          <input value={f.aciklama} onChange={(e) => setF({ ...f, aciklama: e.target.value })} maxLength={255} className={input} placeholder="ör. 100 × 150 cm · çift taraflı baskı" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={label}>Toptan fiyat (KDV hariç)</span>
            <input value={f.toptan} onChange={(e) => setF({ ...f, toptan: e.target.value })} inputMode="decimal" className={`${input} tabular text-right`} placeholder="boş = sorunuz" />
          </label>
          <label>
            <span className={label}>Perakende fiyat (KDV hariç)</span>
            <input value={f.perakende} onChange={(e) => setF({ ...f, perakende: e.target.value })} inputMode="decimal" className={`${input} tabular text-right`} placeholder="boş = sorunuz" />
          </label>
        </div>
        {admin && (
          <div className="rounded-xl border border-dashed border-border p-3">
            <span className={label}>Maliyet (KDV hariç) · yalnızca yönetici görür; boş bırakılabilir</span>
            <div className="grid grid-cols-2 gap-3">
              <input value={maliyet.m} onChange={(e) => setMaliyet({ ...maliyet, m: e.target.value })} inputMode="decimal" className={`${input} tabular text-right`} placeholder="boş = girilmedi" aria-label="Birim maliyet" />
              {f.secenekAd.trim() ? (
                <input value={maliyet.s} onChange={(e) => setMaliyet({ ...maliyet, s: e.target.value })} inputMode="decimal" className={`${input} tabular text-right`} placeholder="seçenek maliyeti (+)" aria-label="Seçenek maliyeti" />
              ) : (
                <span />
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">Maliyet girilirse satışçı bu ürünü (iskontolar sonrası) maliyetin altında teklif edemez.</p>
          </div>
        )}
        {admin && brands.length > 0 && (
          <div className="rounded-xl bg-muted/50 p-3">
            <button type="button" onClick={() => setOvOpen(!ovOpen)} className="flex w-full items-center justify-between text-left text-xs font-semibold text-muted-foreground">
              Markaya özel fiyat ve görsel (isteğe bağlı)
              <span className="text-primary">{ovOpen ? "Gizle" : "Aç"}</span>
            </button>
            {ovOpen && (
              <div className="mt-2 space-y-3">
                <p className="text-[11px] text-muted-foreground">Boş alanlar yukarıdaki ortak fiyat ve görseli kullanır.</p>
                {brands.map((b, i) => {
                  const o = ov[i];
                  const set = (patch: Partial<typeof o>) => setOv(ov.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <div key={b.id} className={cn("rounded-lg bg-card p-2.5 ring-1 ring-border", o.gizli && "opacity-70")}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-semibold">
                          <span className="size-2 rounded-full" style={{ background: b.renk }} /> {b.ad}
                        </span>
                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                          <input type="checkbox" checked={o.gizli} onChange={(e) => set({ gizli: e.target.checked })} className="size-3.5 accent-[var(--primary)]" />
                          <EyeOff className="size-3" /> Bu markada gösterme
                        </label>
                      </div>
                      {!o.gizli && (
                        <div className="mt-2 grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                          <input value={o.toptan} onChange={(e) => set({ toptan: e.target.value })} inputMode="decimal" className={`${input} h-9 tabular text-right`} placeholder={`toptan · ${f.toptan || "ortak"}`} aria-label={`${b.ad} toptan`} />
                          <input value={o.perakende} onChange={(e) => set({ perakende: e.target.value })} inputMode="decimal" className={`${input} h-9 tabular text-right`} placeholder={`perakende · ${f.perakende || "ortak"}`} aria-label={`${b.ad} perakende`} />
                          <BrandImage value={o.gorsel} onChange={(gorsel) => set({ gorsel })} onError={setErr} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <label className="block">
          <span className={label}>Satışçıya uyarı (isteğe bağlı)</span>
          <input value={f.uyari} onChange={(e) => setF({ ...f, uyari: e.target.value })} maxLength={500} className={input} placeholder="ör. Dolgu malzemesi fiyata dahil değildir." />
        </label>
        <div className="rounded-xl bg-muted/50 p-3">
          <span className={label}>Ek seçenek (isteğe bağlı) · kartta anahtarla açılır, fiyatı ürüne eklenir</span>
          <input value={f.secenekAd} onChange={(e) => setF({ ...f, secenekAd: e.target.value })} maxLength={120} className={input} placeholder="ör. Kumaş baskı dahil" />
          {f.secenekAd.trim() && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label>
                <span className={label}>Seçenek toptan (+, KDV hariç)</span>
                <input value={f.secenekToptan} onChange={(e) => setF({ ...f, secenekToptan: e.target.value })} inputMode="decimal" className={`${input} tabular text-right`} />
              </label>
              <label>
                <span className={label}>Seçenek perakende (+, KDV hariç)</span>
                <input value={f.secenekPerakende} onChange={(e) => setF({ ...f, secenekPerakende: e.target.value })} inputMode="decimal" className={`${input} tabular text-right`} />
              </label>
            </div>
          )}
        </div>
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" checked={f.renkSecimi} onChange={(e) => setF({ ...f, renkSecimi: e.target.checked })} className="size-4 accent-[var(--primary)]" />
          Renk seçilebilir (gazebo renkleri; her renk teklifte ayrı satır)
        </label>
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" checked={f.aktif} onChange={(e) => setF({ ...f, aktif: e.target.checked })} className="size-4 accent-[var(--primary)]" />
          Satışta (kapalıysa teklif ekranında görünmez)
        </label>
        {p && <p className="text-[11px] text-muted-foreground">Kod: {p.kod}{p.ekleyen ? ` · ekleyen ${p.ekleyen}` : ""}</p>}
        {err && <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{err}</p>}
        <Button size="lg" className="w-full" disabled={busy || !f.ad.trim()} onClick={save}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>
    </Sheet>
  );
}

/** Markaya özel görsel: küçük kutu, tıklayınca yüklenir; doluysa kaldırma düğmesi */
function BrandImage({ value, onChange, onError }: { value: string | null; onChange: (v: string | null) => void; onError: (e: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span className="relative">
      <button
        type="button"
        title={value ? "Markaya özel görseli değiştir" : "Markaya özel görsel (boş = ortak görsel)"}
        disabled={busy}
        onClick={() => ref.current?.click()}
        className="relative grid size-9 place-items-center overflow-hidden rounded-lg border border-dashed border-input bg-white text-muted-foreground hover:border-primary"
      >
        {value ? <Image src={imgSrc(value)} alt="" fill sizes="36px" className="object-contain" unoptimized /> : <ImagePlus className="size-4" />}
      </button>
      {value && (
        <button type="button" aria-label="Görseli kaldır" onClick={() => onChange(null)} className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-danger text-[10px] font-bold text-white">
          ×
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            const r = await urunGorselYukle(await toWebp(file));
            if (r.ok) onChange(r.yol);
            else onError(r.hata);
          } catch (err) {
            onError(err instanceof Error ? err.message : "Görsel okunamadı.");
          }
          setBusy(false);
        }}
      />
    </span>
  );
}

/** Kumaş renkleri: stokta olmayan renk teklif ekranında seçilemez ve GazeboTente sitesinde gösterilmez */
function ColorSheet({ open, colors, onClose }: { open: boolean; colors: FabricColor[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyHex, setBusyHex] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const toggle = (c: FabricColor) =>
    start(async () => {
      setBusyHex(c.hex);
      const r = await renkStok(c.hex, !c.aktif);
      setBusyHex(null);
      setMsg(r.ok ? (r.uyari ? { ok: false, text: r.uyari } : { ok: true, text: `${c.ad}: ${c.aktif ? "stokta yok olarak işaretlendi" : "yeniden stokta"}.` }) : { ok: false, text: r.hata });
      router.refresh();
    });
  return (
    <Sheet open={open} onClose={onClose} title="Kumaş renkleri" className="md:max-w-lg">
      <p className="text-sm text-muted-foreground">Stokta olmayan renk teklif ekranında seçilemez (satışçılar “stokta yok” görür) ve GazeboTente sitesinde gösterilmez.</p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {colors.map((c) => (
          <li key={c.hex}>
            <button
              type="button"
              disabled={pending}
              onClick={() => toggle(c)}
              aria-pressed={c.aktif}
              className={cn("flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-60", c.aktif ? "border-border bg-card" : "border-danger/30 bg-danger-soft")}
            >
              <span className={cn("size-7 shrink-0 rounded-full ring-1 ring-black/15", !c.aktif && "opacity-40")} style={{ background: c.hex }} />
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-semibold", !c.aktif && "line-through")}>{c.ad}</span>
                <span className={cn("block text-[11px] font-semibold", c.aktif ? "text-success" : "text-danger")}>{busyHex === c.hex ? "Kaydediliyor…" : c.aktif ? "Stokta" : "Stokta yok"}</span>
              </span>
              <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", c.aktif ? "bg-success" : "bg-border")}>
                <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-all", c.aktif ? "left-[18px]" : "left-0.5")} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {msg && <p className={cn("mt-3 rounded-xl px-3 py-2 text-xs font-medium", msg.ok ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>{msg.text}</p>}
    </Sheet>
  );
}

function CategorySheet({ category, onClose }: { category: Category | "yeni" | null; onClose: () => void }) {
  const router = useRouter();
  const c = category && category !== "yeni" ? category : null;
  const [f, setF] = useState({ ad: c?.ad ?? "", aciklama: c?.aciklama ?? "", uyari: c?.uyari ?? "", aktif: c?.aktif ?? true });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const r = await kategoriKaydet({ id: c?.id ?? null, ...f });
    setBusy(false);
    if (!r.ok) return setErr(r.hata);
    router.refresh();
    onClose();
  }
  return (
    <Sheet open={!!category} onClose={onClose} title={c ? "Kategoriyi düzenle" : "Yeni kategori"}>
      <div className="space-y-3">
        <label className="block">
          <span className={label}>Menüdeki adı</span>
          <input value={f.ad} onChange={(e) => setF({ ...f, ad: e.target.value })} maxLength={80} className={input} placeholder="ör. Bayrak & Banner" />
        </label>
        <label className="block">
          <span className={label}>Başlık (teklif ekranında)</span>
          <input value={f.aciklama} onChange={(e) => setF({ ...f, aciklama: e.target.value })} maxLength={255} className={input} placeholder="ör. Bayrak ve L banner" />
        </label>
        <label className="block">
          <span className={label}>Kategori uyarısı (isteğe bağlı)</span>
          <textarea rows={2} value={f.uyari} onChange={(e) => setF({ ...f, uyari: e.target.value })} maxLength={500} className={`${input} h-auto resize-none py-2`} placeholder="ör. Baskı fiyata dahil değildir." />
        </label>
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" checked={f.aktif} onChange={(e) => setF({ ...f, aktif: e.target.checked })} className="size-4 accent-[var(--primary)]" />
          Teklif ekranının menüsünde görünsün
        </label>
        {err && <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{err}</p>}
        <Button size="lg" className="w-full" disabled={busy || !f.ad.trim()} onClick={save}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>
    </Sheet>
  );
}
