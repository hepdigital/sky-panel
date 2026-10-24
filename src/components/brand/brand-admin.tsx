"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ImagePlus, Pencil, Plus } from "lucide-react";
import { markaKaydet, markaLogoYukle } from "@/app/panel/markalar/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { toWebp } from "@/lib/image";
import { cn } from "@/lib/utils";

type Brand = {
  id: number;
  kod: string;
  ad: string;
  unvan: string | null;
  adres: string | null;
  telefon: string | null;
  eposta: string | null;
  web: string | null;
  vergi: string | null;
  ticSicil: string | null;
  mersis: string | null;
  banka: string | null;
  hesapAdi: string | null;
  musteriNo: string | null;
  iban: string | null;
  logo: string | null;
  renk: string;
  teklifOnEki: string;
  notlar: string | null;
  aktif: boolean;
  eksik: string[];
};
type Form = { [K in Exclude<keyof Brand, "id" | "kod" | "eksik" | "aktif" | "logo">]: string } & { id: number | null; aktif: boolean; logo: string | null };

const input = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";
const label = "mb-1 block text-xs font-semibold text-muted-foreground";

const toForm = (b: Brand | null): Form => ({
  id: b?.id ?? null, ad: b?.ad ?? "", unvan: b?.unvan ?? "", adres: b?.adres ?? "", telefon: b?.telefon ?? "", eposta: b?.eposta ?? "", web: b?.web ?? "",
  vergi: b?.vergi ?? "", ticSicil: b?.ticSicil ?? "", mersis: b?.mersis ?? "", banka: b?.banka ?? "", hesapAdi: b?.hesapAdi ?? "", musteriNo: b?.musteriNo ?? "",
  iban: b?.iban ?? "", logo: b?.logo ?? null, renk: b?.renk ?? "#0e8478", teklifOnEki: b?.teklifOnEki ?? "", notlar: b?.notlar ?? "", aktif: b?.aktif ?? true,
});

/**
 * Markalar (yönetici): her marka bir şirket kartıdır. Teklif hangi markayla verilirse PDF'in başlığı, firma ve banka bilgisi,
 * numara öneki, müşterinin teklif sayfası ve mesaj metni o markanın olur. Eski teklifler kayıt anındaki bilgiyle kalır.
 */
export function BrandAdmin({ brands }: { brands: Brand[] }) {
  const [edit, setEdit] = useState<Brand | "yeni" | null>(null);
  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Markalar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Teklif hangi markayla verilirse PDF, numara, müşteri linki ve mesajlar o markanın şirket bilgileriyle çıkar.</p>
        </div>
        <Button onClick={() => setEdit("yeni")}>
          <Plus /> Yeni marka
        </Button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {brands.map((b) => (
          <Card key={b.id} className={cn("overflow-hidden", !b.aktif && "opacity-70")}>
            <div className="h-1.5" style={{ background: b.renk }} />
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-12 min-w-0 items-center">
                  {b.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.logo} alt={b.ad} className="h-10 w-auto max-w-[220px] object-contain" />
                  ) : (
                    <span className="text-lg font-bold">{b.ad}</span>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => setEdit(b)}>
                  <Pencil /> Düzenle
                </Button>
              </div>
              <p className="mt-3 text-sm font-semibold">{b.ad}</p>
              <p className="text-xs text-muted-foreground">{b.unvan || "Unvan girilmedi"}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="neutral">Teklif no: {b.teklifOnEki}-2026-…</Badge>
                {!b.aktif && <Badge tone="neutral">Kapalı</Badge>}
              </div>
              {b.eksik.length > 0 && (
                <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
                  <AlertTriangle className="mt-px size-3.5 shrink-0" /> Eksik şirket bilgisi: {b.eksik.join(", ")}. Bu bilgiler PDF&apos;te boş kalır.
                </p>
              )}
            </div>
          </Card>
        ))}
      </div>

      <BrandSheet key={edit === "yeni" ? "yeni" : (edit?.id ?? "kapali")} brand={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function BrandSheet({ brand, onClose }: { brand: Brand | "yeni" | null; onClose: () => void }) {
  const router = useRouter();
  const b = brand && brand !== "yeni" ? brand : null;
  const [f, setF] = useState<Form>(toForm(b));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const field = (k: keyof Form, l: string, ph = "") => (
    <label className="block">
      <span className={label}>{l}</span>
      <input value={String(f[k] ?? "")} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={input} placeholder={ph} />
    </label>
  );

  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const r = await markaLogoYukle(await toWebp(file, 1200));
      if (r.ok) setF((x) => ({ ...x, logo: r.yol }));
      else setErr(r.hata);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Logo okunamadı.");
    }
    setBusy(false);
  }

  async function save() {
    setBusy(true);
    setErr(null);
    const r = await markaKaydet(f);
    setBusy(false);
    if (!r.ok) return setErr(r.hata);
    router.refresh();
    onClose();
  }

  return (
    <Sheet open={!!brand} onClose={onClose} title={b ? `${b.ad} · şirket kartı` : "Yeni marka"} className="md:max-w-2xl">
      <div className="space-y-4">
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="grid h-20 w-48 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-input bg-white p-2 text-muted-foreground hover:border-primary"
            >
              {f.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.logo} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <ImagePlus className="size-6" />
              )}
            </button>
            <div className="text-xs text-muted-foreground">
              <p>Logo: PDF&apos;in başında ve müşterinin teklif sayfasında görünür. Yatay, şeffaf ya da beyaz zeminli olmalı.</p>
              <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => fileRef.current?.click()}>
                <ImagePlus /> {f.logo ? "Değiştir" : "Logo seç"}
              </Button>
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
          <div className="grid gap-3 sm:grid-cols-[1fr_120px_140px]">
            {field("ad", "Marka adı", "ör. GazeboTente")}
            <label className="block">
              <span className={label}>Teklif öneki</span>
              <input value={f.teklifOnEki} onChange={(e) => setF({ ...f, teklifOnEki: e.target.value.toUpperCase() })} maxLength={10} className={`${input} uppercase`} placeholder="GT" />
            </label>
            <label className="block">
              <span className={label}>Renk</span>
              <span className="flex h-10 items-center gap-2 rounded-xl border border-input bg-card px-2">
                <input type="color" value={f.renk} onChange={(e) => setF({ ...f, renk: e.target.value })} className="size-7 cursor-pointer rounded border-0 bg-transparent p-0" />
                <span className="font-mono text-xs">{f.renk}</span>
              </span>
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Numara: {(f.teklifOnEki || "XX").toUpperCase()}-2026-1001. Önek, markayla ilk teklif verildikten sonra değiştirilemez.
          </p>
        </section>

        <section className="space-y-3 rounded-xl bg-muted/40 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Şirket bilgileri (PDF başlığı ve alt bilgi)</p>
          {field("unvan", "Ticari unvan", "ör. … Tic. Ltd. Şti.")}
          {field("adres", "Adres")}
          <div className="grid gap-3 sm:grid-cols-3">
            {field("telefon", "Telefon")}
            {field("eposta", "E-posta")}
            {field("web", "Web")}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {field("vergi", "Vergi dairesi ve no", "ör. Akyazı V.D. 123 456 78")}
            {field("ticSicil", "Ticaret sicil no")}
            {field("mersis", "Mersis no")}
          </div>
        </section>

        <section className="space-y-3 rounded-xl bg-muted/40 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Ödeme bilgileri (PDF&apos;in altı)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("banka", "Banka ve şube", "ör. Vakıfbank · Akyazı Şubesi")}
            {field("musteriNo", "Müşteri no")}
          </div>
          {field("iban", "IBAN", "TR00 0000 0000 0000 0000 0000 00")}
          {field("hesapAdi", "Hesap adı")}
        </section>

        <label className="block">
          <span className={label}>PDF&apos;e her teklifte basılan notlar (her satır bir madde)</span>
          <textarea rows={3} value={f.notlar} onChange={(e) => setF({ ...f, notlar: e.target.value })} className={`${input} h-auto resize-y py-2`} />
        </label>
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" checked={f.aktif} onChange={(e) => setF({ ...f, aktif: e.target.checked })} className="size-4 accent-[var(--primary)]" />
          Aktif (kapalı marka yeni tekliflerde seçilemez)
        </label>
        {err && <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{err}</p>}
        <Button size="lg" className="w-full" disabled={busy || !f.ad.trim() || !f.teklifOnEki.trim()} onClick={save}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>
    </Sheet>
  );
}
