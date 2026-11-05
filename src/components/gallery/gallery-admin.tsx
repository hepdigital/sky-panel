"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpToLine, ChevronLeft, ChevronRight, Copy, Eye, EyeOff, FolderInput, FolderPlus, Image as ImageIcon, ImagePlus, Images, MessageCircle, MoreVertical, Pencil, Settings2, Star, Trash2, X,
} from "lucide-react";
import {
  albumGuncelle, albumOlustur, albumSil, albumTasi, gorselAciklama, gorselBasa, gorselKapak, gorselSil, gorselTasi, type AlbumInput,
} from "@/app/panel/galeri/actions";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { AdminAlbum, AdminChild, AdminImage } from "@/server/gallery";

type View = { album: AdminAlbum | null; yol: { id: number; ad: string }[]; alt: AdminChild[]; gorseller: AdminImage[]; kokLink: string };
type Option = { id: number; ad: string };

/** Telefondan gelen büyük fotoğraf yüklemeden önce tarayıcıda küçültülür (mobil veride hızlı yüklensin) */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 3_000_000) return file;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.9));
  } catch {
    return file;
  }
}

/** Galeri yönetimi: albümler (iç içe), fotoğraf yükleme, kapak/sıra/açıklama, müşteriye link */
export function GalleryAdmin({ view, me, options }: { view: View; me: { id: number; admin: boolean }; options: Option[] }) {
  const router = useRouter();
  const { album } = view;
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [form, setForm] = useState<"yeni" | "duzenle" | null>(null);
  const [upload, setUpload] = useState<{ done: number; total: number; hata: string[] } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const act = (fn: () => Promise<{ ok: true; id?: number | null } | { ok: false; hata: string }>, ok?: string, then?: (id: number | null) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setMsg({ t: r.hata, ok: false });
      if (ok) setMsg({ t: ok, ok: true });
      then?.(r.id ?? null);
      router.refresh();
    });

  const send = async (files: File[]) => {
    if (!album || !files.length) return;
    const list = files.filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
    const state = { done: 0, total: list.length, hata: [] as string[] };
    setUpload({ ...state });
    for (const f of list) {
      const fd = new FormData();
      fd.set("album", String(album.id));
      fd.append("dosya", await shrink(f), f.name.replace(/\.\w+$/, "") + ".jpg");
      try {
        const r = (await (await fetch("/api/galeri/yukle", { method: "POST", body: fd })).json()) as { ok: boolean; hata?: string };
        if (!r.ok) state.hata.push(r.hata ?? f.name);
      } catch {
        state.hata.push(`“${f.name}” yüklenemedi.`);
      }
      state.done++;
      setUpload({ ...state, hata: [...state.hata] });
    }
    router.refresh();
    if (!state.hata.length) setTimeout(() => setUpload(null), 2500);
  };

  const share = (link: string) => `https://wa.me/?text=${encodeURIComponent(`${album?.ad ?? "Galeri"} örnek görselleri: ${link}`)}`;
  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setMsg({ t: "Link kopyalandı.", ok: true });
    } catch {
      prompt("Linki kopyalayın:", link);
    }
  };
  const link = album?.link ?? view.kokLink;

  return (
    <div
      className="mx-auto max-w-[1200px] space-y-5"
      onDragOver={(e) => {
        if (!album) return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)}
      onDrop={(e) => {
        if (!album) return;
        e.preventDefault();
        setDrag(false);
        void send([...e.dataTransfer.files]);
      }}
    >
      {/* Başlık ve yol */}
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div className="min-w-0">
          <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <Link href="/panel/galeri" className="hover:text-foreground">Galeri</Link>
            {view.yol.slice(0, -1).map((y) => (
              <span key={y.id} className="flex items-center gap-1">
                <ChevronRight className="size-3" />
                <Link href={`/panel/galeri/${y.id}`} className="hover:text-foreground">{y.ad}</Link>
              </span>
            ))}
          </nav>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight md:text-[28px]">
            {album && (
              <Link href={album.ustId ? `/panel/galeri/${album.ustId}` : "/panel/galeri"} className="grid size-8 place-items-center rounded-full hover:bg-muted" aria-label="Üst albüm">
                <ChevronLeft className="size-5" />
              </Link>
            )}
            <span className="truncate">{album?.ad ?? "Galeri"}</span>
            {album?.gizli && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Yalnızca linkle</span>}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {album
              ? `${view.gorseller.length} fotoğraf${view.alt.length ? ` · ${view.alt.length} alt albüm` : ""} · ${album.goruntulenme} görüntülenme · ${album.waTik} WhatsApp tıklaması`
              : "Örnek görselleri albümlere yükleyin, müşteriye albümün linkini gönderin."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => copy(link)}>
            <Copy /> Linki kopyala
          </Button>
          <a href={share(link)} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#25D366] px-3 text-xs font-semibold text-white hover:brightness-95">
            <MessageCircle className="size-4" /> WhatsApp&apos;ta gönder
          </a>
          {album && (
            <Button variant="outline" size="sm" onClick={() => setForm("duzenle")}>
              <Pencil /> Düzenle
            </Button>
          )}
          {!album && me.admin && (
            <Link href="/panel/galeri/ayarlar" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold hover:bg-muted">
              <Settings2 className="size-4" /> Filigran ve ayarlar
            </Link>
          )}
        </div>
      </div>

      {msg && (
        <p className={cn("flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-medium", msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
          {msg.t}
          <button type="button" onClick={() => setMsg(null)} aria-label="Kapat">
            <X className="size-4" />
          </button>
        </p>
      )}

      {/* Alt albümler */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{album ? "Alt albümler" : "Albümler"}</h2>
          <Button size="sm" variant="outline" onClick={() => setForm("yeni")}>
            <FolderPlus /> Yeni albüm
          </Button>
        </div>
        {view.alt.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {view.alt.map((c) => (
              <Link key={c.id} href={`/panel/galeri/${c.id}`} className="group overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
                <div className="relative aspect-[4/3] bg-muted">
                  {c.kapak ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.kapak} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.03]" />
                  ) : (
                    <Images className="absolute inset-0 m-auto size-8 text-muted-foreground/50" />
                  )}
                  {c.gizli && <EyeOff className="absolute top-2 right-2 size-5 rounded-full bg-black/55 p-1 text-white" />}
                </div>
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-semibold">{c.ad}</p>
                  <p className="text-xs text-muted-foreground">{c.adet} fotoğraf</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {album ? "Alt albüm yok. Örneğin “Baskılı” ve “Baskısız” diye ayırabilirsiniz." : "Henüz albüm yok. “Yeni albüm” ile başlayın (ör. Gazebo, Şemsiye)."}
          </p>
        )}
      </section>

      {/* Fotoğraflar */}
      {album && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Fotoğraflar</h2>
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={!!upload && upload.done < upload.total}>
              <ImagePlus /> Fotoğraf ekle
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void send([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </div>
          {upload && (
            <div className="mb-3 rounded-xl bg-muted/60 px-4 py-3 text-sm">
              <div className="flex justify-between font-medium">
                <span>{upload.done < upload.total ? `Yükleniyor… ${upload.done}/${upload.total}` : `${upload.total - upload.hata.length} fotoğraf eklendi.`}</span>
                {upload.done >= upload.total && (
                  <button type="button" onClick={() => setUpload(null)} aria-label="Kapat">
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
                <div className="h-full bg-primary transition-all" style={{ width: `${(upload.done / Math.max(1, upload.total)) * 100}%` }} />
              </div>
              {upload.hata.map((h, i) => (
                <p key={i} className="mt-1 text-xs text-danger">{h}</p>
              ))}
            </div>
          )}
          {view.gorseller.length ? (
            <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5", drag && "rounded-2xl ring-4 ring-primary/30")}>
              {view.gorseller.map((g, i) => (
                <Photo key={g.id} g={g} me={me} canAll={me.admin || album.olusturanId === me.id} options={options} albumId={album.id} onOpen={() => setOpen(i)} act={act} pending={pending} />
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={cn("flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-12 text-sm text-muted-foreground hover:bg-muted/40", drag && "border-primary bg-primary/5")}
            >
              <ImagePlus className="size-8" />
              <span className="font-semibold text-foreground">Fotoğraf ekle</span>
              Telefonda galeriden birden çok fotoğraf seçebilirsiniz; bilgisayarda sürükleyip bırakın.
            </button>
          )}
        </section>
      )}

      {open !== null && view.gorseller[open] && <Lightbox list={view.gorseller} index={open} onIndex={setOpen} />}

      <Sheet open={form !== null} onClose={() => setForm(null)} title={form === "yeni" ? (album ? `“${album.ad}” içine yeni albüm` : "Yeni albüm") : "Albümü düzenle"}>
        {form && (
          <AlbumForm
            key={form}
            album={form === "duzenle" ? album : null}
            canSlug={!!album && (me.admin || album.olusturanId === me.id)}
            options={options.filter((o) => o.id !== album?.id)}
            pending={pending}
            onSubmit={(input, ustId) =>
              form === "yeni"
                ? act(() => albumOlustur(album?.id ?? null, input), undefined, (id) => {
                    setForm(null);
                    if (id) router.push(`/panel/galeri/${id}`);
                  })
                : act(
                    async () => {
                      const r = await albumGuncelle(album!.id, input);
                      if (r.ok && ustId !== undefined && ustId !== album!.ustId) return albumTasi(album!.id, ustId);
                      return r;
                    },
                    "Kaydedildi.",
                    () => setForm(null),
                  )
            }
            onDelete={
              form === "duzenle" && album
                ? () =>
                    confirm(`“${album.ad}” albümü${view.gorseller.length ? ` ve içindeki ${view.gorseller.length} fotoğraf` : ""} silinsin mi?`) &&
                    act(() => albumSil(album.id), undefined, () => {
                      setForm(null);
                      router.push(album.ustId ? `/panel/galeri/${album.ustId}` : "/panel/galeri");
                    })
                : undefined
            }
          />
        )}
      </Sheet>
    </div>
  );
}

type Act = (fn: () => Promise<{ ok: true; id?: number | null } | { ok: false; hata: string }>, ok?: string, then?: (id: number | null) => void) => void;

function Photo({ g, me, canAll, options, albumId, onOpen, act, pending }: { g: AdminImage; me: { id: number }; canAll: boolean; options: Option[]; albumId: number; onOpen: () => void; act: Act; pending: boolean }) {
  const [menu, setMenu] = useState(false);
  const mine = canAll || g.yukleyenId === me.id;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  const item = "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted disabled:opacity-50";
  return (
    <div ref={ref} className="group relative">
      <button type="button" onClick={onOpen} className="block aspect-square w-full overflow-hidden rounded-xl bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={g.k} alt={g.baslik ?? ""} loading="lazy" className="size-full object-cover" />
      </button>
      {g.kapak && <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white"><Star className="size-3" /> Kapak</span>}
      {g.baslik && <p className="pointer-events-none absolute inset-x-0 bottom-0 truncate rounded-b-xl bg-gradient-to-t from-black/70 px-2 pt-4 pb-1.5 text-[11px] text-white">{g.baslik}</p>}
      <button type="button" onClick={() => setMenu((v) => !v)} className="absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-full bg-black/55 text-white" aria-label="İşlemler">
        <MoreVertical className="size-4" />
      </button>
      {menu && (
        <div className="absolute top-11 right-1.5 z-20 w-56 rounded-xl border border-border bg-card p-1 shadow-pop" onClick={() => setMenu(false)}>
          <button type="button" className={item} disabled={pending} onClick={() => act(() => gorselKapak(g.id))}>
            <Star className="size-4" /> {g.kapak ? "Kapaktan kaldır" : "Kapak yap"}
          </button>
          <button type="button" className={item} disabled={pending} onClick={() => act(() => gorselBasa(g.id))}>
            <ArrowUpToLine className="size-4" /> Başa al
          </button>
          <button
            type="button"
            className={item}
            disabled={pending}
            onClick={() => {
              const t = prompt("Fotoğraf açıklaması (sitede görünür, ör. “3×3 baskılı gazebo, fuar standı”):", g.baslik ?? "");
              if (t !== null) act(() => gorselAciklama(g.id, t));
            }}
          >
            <Pencil className="size-4" /> Açıklama
          </button>
          {mine && (
            <MoveSelect options={options.filter((o) => o.id !== albumId)} onPick={(id) => act(() => gorselTasi(g.id, id), "Fotoğraf taşındı.")} />
          )}
          {mine && (
            <button type="button" className={cn(item, "text-danger")} disabled={pending} onClick={() => confirm("Fotoğraf silinsin mi?") && act(() => gorselSil(g.id))}>
              <Trash2 className="size-4" /> Sil
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MoveSelect({ options, onPick }: { options: Option[]; onPick: (id: number) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-muted" onClick={(e) => e.stopPropagation()}>
      <FolderInput className="size-4 shrink-0" />
      <select className="w-full bg-transparent outline-none" value="" onChange={(e) => e.target.value && onPick(Number(e.target.value))}>
        <option value="">Taşı…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.ad}</option>
        ))}
      </select>
    </label>
  );
}

function Lightbox({ list, index, onIndex }: { list: AdminImage[]; index: number; onIndex: (i: number | null) => void }) {
  const g = list[index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onIndex(null);
      if (e.key === "ArrowRight") onIndex((index + 1) % list.length);
      if (e.key === "ArrowLeft") onIndex((index - 1 + list.length) % list.length);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, list.length, onIndex]);
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/92" onClick={() => onIndex(null)}>
      <div className="flex items-center justify-between p-3 text-sm text-white/80">
        <span>{index + 1} / {list.length}</span>
        <button type="button" className="grid size-10 place-items-center rounded-full hover:bg-white/10" aria-label="Kapat">
          <X className="size-6" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={g.b} alt={g.baslik ?? ""} className="max-h-full max-w-full object-contain" />
        {list.length > 1 && (
          <>
            <button type="button" onClick={() => onIndex((index - 1 + list.length) % list.length)} className="absolute left-2 grid size-11 place-items-center rounded-full bg-black/50 text-white" aria-label="Önceki">
              <ChevronLeft className="size-6" />
            </button>
            <button type="button" onClick={() => onIndex((index + 1) % list.length)} className="absolute right-2 grid size-11 place-items-center rounded-full bg-black/50 text-white" aria-label="Sonraki">
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
      </div>
      <p className="p-4 text-center text-sm text-white/85">{g.baslik ?? " "}</p>
    </div>
  );
}

function AlbumForm({
  album, canSlug, options, pending, onSubmit, onDelete,
}: {
  album: AdminAlbum | null;
  canSlug: boolean;
  options: Option[];
  pending: boolean;
  onSubmit: (input: AlbumInput, ustId?: number | null) => void;
  onDelete?: () => void;
}) {
  const [v, setV] = useState({
    ad: album?.ad ?? "", slug: album?.slug ?? "", aciklama: album?.aciklama ?? "", gizli: album?.gizli ?? false, ctaUrl: album?.ctaUrl ?? "", ctaAd: album?.ctaAd ?? "", ust: album?.ustId ?? null,
  });
  const input = "h-11 w-full rounded-xl border border-input bg-card px-3 text-[15px] outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";
  const label = "mb-1 block text-sm font-medium";
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(
          { ad: v.ad, ...(album && canSlug ? { slug: v.slug } : {}), aciklama: v.aciklama, gizli: v.gizli, ctaUrl: v.ctaUrl, ctaAd: v.ctaAd },
          album && canSlug ? v.ust : undefined,
        );
      }}
    >
      <label className="block">
        <span className={label}>Albüm adı</span>
        <input className={input} value={v.ad} onChange={(e) => setV({ ...v, ad: e.target.value })} required maxLength={120} placeholder="ör. 3×3 Gazebo" autoFocus={!album} />
      </label>
      <label className="block">
        <span className={label}>Açıklama <span className="font-normal text-muted-foreground">(isteğe bağlı, sitede albüm başlığının altında)</span></span>
        <textarea className={cn(input, "h-24 py-2")} value={v.aciklama} onChange={(e) => setV({ ...v, aciklama: e.target.value })} maxLength={2000} placeholder="ör. 3×3 m gazebo çadırlarımızdan örnek uygulamalar: fuar, mağaza önü, etkinlik." />
      </label>
      <label className="flex items-start gap-3 rounded-xl border border-border p-3">
        <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={v.gizli} onChange={(e) => setV({ ...v, gizli: e.target.checked })} />
        <span className="text-sm">
          <span className="flex items-center gap-1.5 font-medium">{v.gizli ? <EyeOff className="size-4" /> : <Eye className="size-4" />} Yalnızca linkle açılsın</span>
          <span className="text-muted-foreground">Sitede listelenmez, Google&apos;da çıkmaz. Müşteriye özel ya da logolu işler için.</span>
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <label className="block">
          <span className={label}>Yönlendirme bağlantısı <span className="font-normal text-muted-foreground">(isteğe bağlı)</span></span>
          <input className={input} value={v.ctaUrl} onChange={(e) => setV({ ...v, ctaUrl: e.target.value })} inputMode="url" placeholder="https://skygorselmarket.com/urun/…" />
        </label>
        <label className="block">
          <span className={label}>Düğme yazısı</span>
          <input className={input} value={v.ctaAd} onChange={(e) => setV({ ...v, ctaAd: e.target.value })} maxLength={60} placeholder="Ürünü incele" />
        </label>
      </div>
      {album && canSlug && (
        <details className="rounded-xl border border-border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Gelişmiş: adres ve konum</summary>
          <label className="mt-3 block">
            <span className={label}>Adres (link sonu)</span>
            <input className={input} value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value })} maxLength={70} />
            <span className="mt-1 block text-xs text-warning">Değiştirirseniz daha önce gönderilen linkler açılmaz.</span>
          </label>
          <label className="mt-3 block">
            <span className={label}>Üst albüm</span>
            <select className={input} value={v.ust ?? ""} onChange={(e) => setV({ ...v, ust: e.target.value ? Number(e.target.value) : null })}>
              <option value="">— En üst —</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.ad}</option>
              ))}
            </select>
          </label>
        </details>
      )}
      <div className="flex items-center justify-between gap-2 pt-1">
        {onDelete ? (
          <Button type="button" variant="ghost" className="text-danger" onClick={onDelete} disabled={pending}>
            <Trash2 /> Sil
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={pending || !v.ad.trim()}>
          <ImageIcon /> {album ? "Kaydet" : "Albümü oluştur"}
        </Button>
      </div>
    </form>
  );
}
