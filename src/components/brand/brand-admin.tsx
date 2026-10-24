"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  FileDown,
  ImagePlus,
  Plus,
} from "lucide-react";
import {
  markaKaydet,
  markaLogoYukle,
  markaSatiscilari,
} from "@/app/panel/markalar/actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toWebp } from "@/lib/image";
import type { BrandCard, PdfData } from "@/lib/terminal/calc";
import { downloadPdf } from "@/lib/terminal/pdf";
import { cn } from "@/lib/utils";

export type Brand = {
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
  renk2: string;
  sablon: "klasik" | "modern";
  teklifOnEki: string;
  notlar: string | null;
  aktif: boolean;
  eksik: string[];
  teklif: number;
};
type Text =
  | "ad"
  | "unvan"
  | "adres"
  | "telefon"
  | "eposta"
  | "web"
  | "vergi"
  | "ticSicil"
  | "mersis"
  | "banka"
  | "hesapAdi"
  | "musteriNo"
  | "iban"
  | "renk"
  | "renk2"
  | "teklifOnEki"
  | "notlar";
type Form = Record<Text, string> & {
  id: number | null;
  aktif: boolean;
  logo: string | null;
  sablon: "klasik" | "modern";
};
export type Seller = {
  id: number;
  adSoyad: string;
  aktif: boolean;
  secili: boolean;
};

const input =
  "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";
const label = "mb-1 block text-xs font-semibold text-muted-foreground";

const toForm = (b: Brand | null): Form => ({
  id: b?.id ?? null,
  ad: b?.ad ?? "",
  unvan: b?.unvan ?? "",
  adres: b?.adres ?? "",
  telefon: b?.telefon ?? "",
  eposta: b?.eposta ?? "",
  web: b?.web ?? "",
  vergi: b?.vergi ?? "",
  ticSicil: b?.ticSicil ?? "",
  mersis: b?.mersis ?? "",
  banka: b?.banka ?? "",
  hesapAdi: b?.hesapAdi ?? "",
  musteriNo: b?.musteriNo ?? "",
  iban: b?.iban ?? "",
  logo: b?.logo ?? null,
  renk: b?.renk ?? "#0e8478",
  renk2: b?.renk2 ?? "#111a26",
  sablon: b?.sablon ?? "klasik",
  teklifOnEki: b?.teklifOnEki ?? "",
  notlar: b?.notlar ?? "",
  aktif: b?.aktif ?? true,
});

/** Formdaki bilgilerle markanın teklif kimliği (örnek PDF için) */
const cardOf = (f: Form): BrandCard => ({
  id: f.id ?? 0,
  kod: "",
  ad: f.ad || "Marka",
  renk: f.renk,
  renk2: f.renk2,
  sablon: f.sablon,
  logo: f.logo,
  onEk: f.teklifOnEki || "XX",
  unvan: f.unvan,
  adres: f.adres,
  telefon: f.telefon,
  eposta: f.eposta,
  web: f.web,
  vergi: f.vergi,
  ticSicil: f.ticSicil,
  mersis: f.mersis,
  banka: {
    banka: f.banka,
    hesapAdi: f.hesapAdi,
    musteriNo: f.musteriNo,
    iban: f.iban,
  },
  notlar: f.notlar
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean),
});

/** Örnek teklif: gazebo (bileşenleri ve görselleriyle) + bir ürün + bir ek kalem */
function sampleQuote(card: BrandCard): PdfData {
  const kalemler = [
    {
      ad: "Gazebo çadır 3 × 3 m",
      alt: "SQ3 iskelet · 690D Impertex tavan · 4 duvar · Renk: Beyaz\nÖn: Çift Fermuarlı Kapı · Arka: Düz Tam Duvar",
      adet: 2,
      birim: 12450,
      isk: "",
      tutar: 24900,
      img: "r:3x3",
      gorseller: [] as string[],
      parcalar: [
        {
          ad: "SQ3 iskelet (Hafif seri)",
          fiyat: 3800,
          img: "f:SQ3" as string | null,
        },
        { ad: "Tavan kumaşı · 690D Impertex", fiyat: 3250, img: null },
        {
          ad: "Çift Fermuarlı Kapı · 200 × 300 cm",
          fiyat: 1950,
          img: "w:cift-fermuar",
        },
        {
          ad: "Düz Tam Duvar × 3 · 200 × 300 cm",
          fiyat: 3450,
          img: "w:duz-tam",
        },
      ],
    },
    {
      ad: "Roll-Up",
      alt: "85 × 200 cm",
      adet: 3,
      birim: 1750,
      isk: "",
      tutar: 5250,
      img: "p:rollup" as string | null,
      parcalar: [],
    },
    {
      ad: "Nakliye bedeli",
      alt: "Kapıya teslim",
      adet: 1,
      birim: 1500,
      isk: "",
      tutar: 1500,
      img: null,
      parcalar: [],
    },
  ];
  const ara = kalemler.reduce((a, k) => a + k.tutar, 0);
  return {
    no: `${card.onEk}-2026-ÖRNEK`,
    tarih: new Date().toLocaleDateString("tr-TR"),
    gecerlilik: "7 gün (örnek)",
    hazirlayan: "Örnek Satışçı",
    musteri: "Örnek Müşteri A.Ş.",
    yetkili: "Ayşe Yılmaz",
    iletisim: "0532 000 00 00 · ornek@firma.com",
    modeAd: "Perakende",
    toptan: false,
    vatOn: false,
    gorsel: true,
    kalemler,
    araListe: ara,
    satirIsk: 0,
    genelIsk: 0,
    genelIskEtiket: "",
    araToplam: ara,
    kdv: ara * 0.2,
    genelToplam: ara * 1.2,
    uyarilar: [],
    notlar: card.notlar.length ? card.notlar : ["Örnek not."],
    dosyaAdi: `Ornek-teklif-${card.onEk}.pdf`,
    firma: card,
  } as unknown as PdfData;
}

/* ───────── Liste ───────── */

export function BrandList({ brands }: { brands: Brand[] }) {
  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">
            Marka Yönetimi
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Teklif hangi markayla verilirse PDF şablonu, numara, müşteri linki
            ve mesajlar o markanın olur.
          </p>
        </div>
        <Link href="/panel/markalar/yeni" className={buttonVariants()}>
          <Plus /> Yeni marka
        </Link>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {brands.map((b) => (
          <Link key={b.id} href={`/panel/markalar/${b.id}`} className="group">
            <Card
              className={cn(
                "overflow-hidden transition-shadow group-hover:shadow-pop",
                !b.aktif && "opacity-70",
              )}
            >
              <div className="flex h-2">
                <span className="flex-1" style={{ background: b.renk }} />
                <span className="w-1/3" style={{ background: b.renk2 }} />
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-12 min-w-0 items-center">
                    {b.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={b.logo}
                        alt={b.ad}
                        className="h-10 w-auto max-w-[220px] object-contain"
                      />
                    ) : (
                      <span className="text-lg font-bold">{b.ad}</span>
                    )}
                  </div>
                  <ChevronRight className="size-5 text-muted-foreground group-hover:text-foreground" />
                </div>
                <p className="mt-3 text-sm font-semibold">{b.ad}</p>
                <p className="text-xs text-muted-foreground">
                  {b.unvan || "Unvan girilmedi"}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone="neutral">{b.teklifOnEki}-2026-…</Badge>
                  <Badge tone="info">
                    Şablon: {b.sablon === "modern" ? "Modern" : "Klasik"}
                  </Badge>
                  <Badge tone="neutral">{b.teklif} teklif</Badge>
                  {!b.aktif && <Badge tone="neutral">Kapalı</Badge>}
                </div>
                {b.eksik.length > 0 && (
                  <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
                    <AlertTriangle className="mt-px size-3.5 shrink-0" /> Eksik
                    şirket bilgisi: {b.eksik.join(", ")}.
                  </p>
                )}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ───────── Marka sayfası ───────── */

const TABS = [
  ["genel", "Genel"],
  ["sirket", "Şirket ve banka"],
  ["teklif", "Teklif ve PDF şablonu"],
  ["satiscilar", "Satışçılar"],
] as const;
type Tab = (typeof TABS)[number][0];

export function BrandEditor({
  brand,
  sellers,
}: {
  brand: Brand | null;
  sellers: Seller[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("genel");
  const [f, setF] = useState<Form>(toForm(brand));
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const field = (k: Text, l: string, ph = "") => (
    <label className="block">
      <span className={label}>{l}</span>
      <input
        value={f[k]}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
        className={input}
        placeholder={ph}
      />
    </label>
  );
  const locked = !!brand && brand.teklif > 0;

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
    setMsg(null);
    const r = await markaKaydet(f);
    setBusy(false);
    if (!r.ok) return setErr(r.hata);
    if (!f.id && r.id) return router.push(`/panel/markalar/${r.id}`);
    setMsg("Kaydedildi.");
    router.refresh();
  }

  async function samplePdf() {
    setPdfBusy(true);
    await downloadPdf(sampleQuote(cardOf(f))).catch((e) =>
      setErr(`Örnek PDF oluşturulamadı: ${e instanceof Error ? e.message : e}`),
    );
    setPdfBusy(false);
  }

  return (
    <div className="mx-auto max-w-[900px]">
      <Link
        href="/panel/markalar"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Marka Yönetimi
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {f.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={f.logo}
              alt=""
              className="h-9 w-auto max-w-[160px] object-contain"
            />
          )}
          <h1 className="text-2xl font-bold tracking-tight">
            {brand ? brand.ad : "Yeni marka"}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={pdfBusy}
            onClick={samplePdf}
            title="Formdaki bilgilerle (kaydetmeden) örnek teklif PDF'i"
          >
            <FileDown /> {pdfBusy ? "Hazırlanıyor…" : "Örnek PDF"}
          </Button>
          {tab !== "satiscilar" && (
            <Button
              disabled={busy || !f.ad.trim() || !f.teklifOnEki.trim()}
              onClick={save}
            >
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          )}
        </div>
      </div>

      {brand && brand.eksik.length > 0 && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
          <AlertTriangle className="mt-px size-3.5 shrink-0" /> Eksik şirket
          bilgisi: {brand.eksik.join(", ")}. Bu bilgiler PDF&apos;te boş kalır.
        </p>
      )}

      <div className="-mx-4 mt-5 flex gap-1 overflow-x-auto border-b border-border px-4 no-scrollbar md:mx-0 md:px-0">
        {TABS.filter(([k]) => k !== "satiscilar" || brand).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "relative h-11 shrink-0 px-3 text-sm font-semibold",
              tab === k
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l}
            {tab === k && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>

      <Card className="mt-4 space-y-4 p-5">
        {tab === "genel" && (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="grid h-24 w-56 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-input bg-white p-2 text-muted-foreground hover:border-primary"
              >
                {f.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={f.logo}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <ImagePlus className="size-6" />
                )}
              </button>
              <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                <p>
                  Logo PDF&apos;in başında ve müşterinin teklif sayfasında
                  görünür. Yatay, şeffaf ya da beyaz zeminli, yüksek
                  çözünürlüklü olmalı.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus /> {f.logo ? "Logoyu değiştir" : "Logo yükle"}
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
            {field("ad", "Marka adı", "ör. GazeboTente")}
            <div className="grid gap-3 sm:grid-cols-2">
              <Color
                label="Ana renk (düğmeler, vurgu, tablo başlığı)"
                value={f.renk}
                onChange={(renk) => setF({ ...f, renk })}
              />
              <Color
                label="İkinci renk (modern şablonda üst ve alt şerit)"
                value={f.renk2}
                onChange={(renk2) => setF({ ...f, renk2 })}
              />
            </div>
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={f.aktif}
                onChange={(e) => setF({ ...f, aktif: e.target.checked })}
                className="size-4 accent-[var(--primary)]"
              />
              Aktif (kapalı marka yeni tekliflerde seçilemez)
            </label>
          </>
        )}

        {tab === "sirket" && (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Şirket bilgileri
            </p>
            {field("unvan", "Ticari unvan", "ör. … Tic. Ltd. Şti.")}
            {field("adres", "Adres")}
            <div className="grid gap-3 sm:grid-cols-3">
              {field("telefon", "Telefon")}
              {field("eposta", "E-posta")}
              {field("web", "Web")}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {field(
                "vergi",
                "Vergi dairesi ve no",
                "ör. Akyazı V.D. 123 456 78",
              )}
              {field("ticSicil", "Ticaret sicil no")}
              {field("mersis", "Mersis no")}
            </div>
            <p className="pt-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Ödeme bilgileri (PDF&apos;in altı)
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {field("banka", "Banka ve şube", "ör. Vakıfbank · Akyazı Şubesi")}
              {field("musteriNo", "Müşteri no")}
            </div>
            {field("iban", "IBAN", "TR00 0000 0000 0000 0000 0000 00")}
            {field("hesapAdi", "Hesap adı")}
          </>
        )}

        {tab === "teklif" && (
          <>
            <div>
              <span className={label}>PDF şablonu</span>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["klasik", "modern"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setF({ ...f, sablon: t })}
                    className={cn(
                      "flex items-start gap-3 rounded-2xl border p-3 text-left transition-colors",
                      f.sablon === t
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border hover:border-primary/50",
                    )}
                  >
                    <TemplateThumb kind={t} renk={f.renk} renk2={f.renk2} />
                    <span className="min-w-0">
                      <p className="text-sm font-semibold">
                        {t === "klasik" ? "Klasik" : "Modern"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t === "klasik"
                          ? "Beyaz başlık, sağ üstte firma künyesi, koyu tablo başlığı."
                          : "Koyu şerit başlık, büyük “TEKLİF”, renkli tablo, künye altta koyu şeritte."}
                      </p>
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Değişikliği “Örnek PDF” ile kaydetmeden deneyebilirsiniz.
              </p>
            </div>
            <label className="block max-w-xs">
              <span className={label}>Teklif numarası öneki</span>
              <input
                value={f.teklifOnEki}
                disabled={locked}
                onChange={(e) =>
                  setF({ ...f, teklifOnEki: e.target.value.toUpperCase() })
                }
                maxLength={10}
                className={`${input} uppercase disabled:opacity-60`}
                placeholder="GT"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                {(f.teklifOnEki || "XX").toUpperCase()}-2026-1001
                {locked
                  ? " · bu markayla teklif verildiği için önek değiştirilemez"
                  : ""}
              </span>
            </label>
            <label className="block">
              <span className={label}>
                PDF&apos;e her teklifte basılan notlar (her satır bir madde)
              </span>
              <textarea
                rows={4}
                value={f.notlar}
                onChange={(e) => setF({ ...f, notlar: e.target.value })}
                className={`${input} h-auto resize-y py-2`}
              />
            </label>
          </>
        )}

        {tab === "satiscilar" && brand && (
          <Sellers markaId={brand.id} sellers={sellers} />
        )}

        {err && (
          <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
            {err}
          </p>
        )}
        {msg && tab !== "satiscilar" && (
          <p className="rounded-xl bg-success-soft px-3 py-2 text-xs font-medium text-success">
            {msg}
          </p>
        )}
      </Card>
    </div>
  );
}

function Color({
  label: l,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className={label}>{l}</span>
      <span className="flex h-10 items-center gap-2 rounded-xl border border-input bg-card px-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-7 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <span className="font-mono text-xs">{value}</span>
      </span>
    </label>
  );
}

/** Şablonun küçük önizlemesi (renklerle) */
function TemplateThumb({
  kind,
  renk,
  renk2,
}: {
  kind: "klasik" | "modern";
  renk: string;
  renk2: string;
}) {
  const bar = "h-1.5 rounded-full bg-black/10";
  return (
    <div className="aspect-[1/1.35] w-28 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-border [&_*]:shrink-0">
      {kind === "klasik" ? (
        <div className="flex h-full flex-col gap-1.5 p-2">
          <div className="flex items-start justify-between">
            <span className="h-3 w-10 rounded bg-black/15" />
            <span className="flex w-12 flex-col items-end gap-1">
              <span className={`${bar} w-full`} />
              <span className={`${bar} w-3/4`} />
            </span>
          </div>
          <span className="h-0.5 w-full" style={{ background: renk }} />
          <span className="h-2 w-12 rounded bg-black/70" />
          <div className="grid grid-cols-2 gap-2">
            <span className="h-5 rounded bg-black/5" />
            <span className="h-5 rounded bg-black/5" />
          </div>
          <span className="h-3 w-full rounded-sm bg-[#111a26]" />
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2.5 w-full rounded-sm border border-black/10"
            />
          ))}
          <span
            className="ml-auto h-4 w-1/2 rounded"
            style={{ background: renk }}
          />
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <div
            className="flex items-center justify-between px-2 py-2"
            style={{ background: renk2 }}
          >
            <span className="h-4 w-10 rounded bg-white" />
            <span className="flex flex-col items-end gap-1">
              <span className="h-2 w-8 rounded bg-white" />
              <span className="h-1 w-6 rounded" style={{ background: renk }} />
            </span>
          </div>
          <span className="h-0.5 w-full" style={{ background: renk }} />
          <div className="flex flex-1 flex-col gap-1.5 p-2">
            <div className="grid grid-cols-2 gap-2">
              <span
                className="flex flex-col gap-1 border-l-2 pl-1.5"
                style={{ borderColor: renk }}
              >
                <span className={`${bar} w-full`} />
                <span className={`${bar} w-2/3`} />
              </span>
              <span
                className="flex flex-col gap-1 border-l-2 pl-1.5"
                style={{ borderColor: renk }}
              >
                <span className={`${bar} w-full`} />
                <span className={`${bar} w-2/3`} />
              </span>
            </div>
            <span
              className="h-3 w-full rounded-sm"
              style={{ background: renk }}
            />
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2.5 w-full rounded-sm"
                style={{ background: i % 2 ? `${renk}14` : "transparent" }}
              />
            ))}
            <span
              className="ml-auto h-4 w-1/2 rounded"
              style={{ background: renk2, borderLeft: `4px solid ${renk}` }}
            />
          </div>
          <span className="h-3 w-full" style={{ background: renk2 }} />
        </div>
      )}
    </div>
  );
}

/** Bu markayla satış yapabilecek satışçılar */
function Sellers({ markaId, sellers }: { markaId: number; sellers: Seller[] }) {
  const router = useRouter();
  const [sel, setSel] = useState(
    sellers.filter((s) => s.secili).map((s) => s.id),
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!sellers.length)
    return (
      <p className="text-sm text-muted-foreground">
        Henüz satışçı yok. Kullanıcılar ekranından ekleyebilirsiniz.
      </p>
    );
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        İşaretli satışçılar bu markayla teklif verebilir. Yöneticiler her
        markayı kullanır.
      </p>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {sellers.map((s) => (
          <li key={s.id}>
            <label
              className={cn(
                "flex items-center gap-3 px-4 py-3 text-sm",
                !s.aktif && "opacity-60",
              )}
            >
              <input
                type="checkbox"
                checked={sel.includes(s.id)}
                onChange={(e) =>
                  setSel(
                    e.target.checked
                      ? [...sel, s.id]
                      : sel.filter((x) => x !== s.id),
                  )
                }
                className="size-4 accent-[var(--primary)]"
              />
              <span className="font-semibold">{s.adSoyad}</span>
              {!s.aktif && <Badge tone="neutral">Pasif</Badge>}
            </label>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await markaSatiscilari(markaId, sel);
            setBusy(false);
            setMsg(r.ok ? "Satışçılar kaydedildi." : r.hata);
            router.refresh();
          }}
        >
          Satışçıları kaydet
        </Button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
