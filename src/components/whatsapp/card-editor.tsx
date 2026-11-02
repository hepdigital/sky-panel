"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ImagePlus, Plus, Save, Trash2 } from "lucide-react";
import { waKartGorselYukle, waKartKaydet } from "@/app/panel/whatsapp/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toWebp } from "@/lib/image";
import { cn } from "@/lib/utils";

type Medya = { id: string; tur: "image" | "video"; yol: string; aciklama: string };
type Kart = {
  kod: string; ad: string; siteId: number | null; disUrunId: number | null; url: string | null; anahtarKelimeler: string; asistanCevaplar: boolean;
  bilgi: string; sss: { soru: string; cevap: string }[]; itirazlar: { itiraz: string; cevap: string }[]; medya: Medya[]; yasaklar: string; aktif: boolean;
};

const inputCls = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";
const areaCls = "w-full rounded-xl border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";

const BOS: Kart = { kod: "", ad: "", siteId: null, disUrunId: null, url: "", anahtarKelimeler: "", asistanCevaplar: false, bilgi: "", sss: [], itirazlar: [], medya: [], yasaklar: "", aktif: true };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** Asistanın ürün kartları: kapsamdaki ürünler baştan sona cevaplanır, diğerleri tanınıp ekibe devredilir */
export function CardEditor({ cards, sites }: { cards: Kart[]; sites: { id: number; ad: string }[] }) {
  const [sel, setSel] = useState<string | null>(cards[0]?.kod ?? null);
  const current = sel === "" ? BOS : (cards.find((c) => c.kod === sel) ?? null);
  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="pt-1">
        <Link href="/panel/whatsapp/asistan" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Asistan ayarları
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-[28px]">Ürün kartları</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Asistan &quot;cevaplasın&quot; açık kartları baştan sona satar; diğerlerini tanıyıp bilgileri toplar ve ekibe devreder. Fiyat kartta tutulmaz, bağlı site ürününden canlı okunur.
        </p>
      </div>
      <div className="mt-5 grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-border">
            {cards.map((c) => (
              <li key={c.kod}>
                <button type="button" onClick={() => setSel(c.kod)} className={cn("w-full px-4 py-3 text-left hover:bg-muted/50", sel === c.kod && "bg-muted")}>
                  <span className="block truncate text-sm font-semibold">{c.ad}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {c.asistanCevaplar ? <Badge tone="success">Asistan cevaplar</Badge> : <Badge dot={false}>Ekibe devreder</Badge>}
                    {!c.aktif && <Badge tone="neutral">Pasif</Badge>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-border p-3">
            <Button size="sm" variant="outline" className="w-full" onClick={() => setSel("")}>
              <Plus /> Yeni kart
            </Button>
          </div>
        </Card>
        {current ? <Editor key={sel} kart={current} yeni={sel === ""} sites={sites} onSaved={(kod) => setSel(kod)} /> : <Card className="p-10 text-center text-sm text-muted-foreground">Soldan bir kart seçin.</Card>}
      </div>
    </div>
  );
}

function Editor({ kart, yeni, sites, onSaved }: { kart: Kart; yeni: boolean; sites: { id: number; ad: string }[]; onSaved: (kod: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [k, setK] = useState<Kart>(kart);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Kart>(key: K, v: Kart[K]) => setK((x) => ({ ...x, [key]: v }));

  const save = () =>
    start(async () => {
      const r = await waKartKaydet(k, yeni ? null : kart.kod);
      setMsg(r.ok ? { ok: true, text: "Kaydedildi." } : { ok: false, text: r.hata });
      if (r.ok) {
        onSaved(k.kod.trim().toLowerCase());
        router.refresh();
      }
    });

  const upload = (file: File) =>
    start(async () => {
      try {
        const r = await waKartGorselYukle(await toWebp(file, 1600));
        if (!r.ok) return setMsg({ ok: false, text: r.hata });
        set("medya", [...k.medya, { id: `gorsel${k.medya.length + 1}`, tur: "image", yol: r.yol, aciklama: "" }]);
      } catch {
        setMsg({ ok: false, text: "Görsel okunamadı." });
      }
    });

  return (
    <Card className="space-y-5 p-4 md:p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Kod" hint="Küçük harf, rakam ve tire (ör. kis-bahcesi-3x3)">
          <input value={k.kod} onChange={(e) => set("kod", e.target.value)} className={inputCls} maxLength={60} />
        </Field>
        <Field label="Ürün adı">
          <input value={k.ad} onChange={(e) => set("ad", e.target.value)} className={inputCls} maxLength={160} />
        </Field>
        <Field label="Canlı fiyatın okunacağı site">
          <select value={k.siteId ?? ""} onChange={(e) => set("siteId", Number(e.target.value) || null)} className={inputCls}>
            <option value="">Yok (asistan fiyat söylemez)</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.ad}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sitedeki ürün numarası" hint="WooCommerce ürün kimliği (ör. 20659)">
          <input type="number" value={k.disUrunId ?? ""} onChange={(e) => set("disUrunId", Number(e.target.value) || null)} className={inputCls} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Ürün linki">
            <input value={k.url ?? ""} onChange={(e) => set("url", e.target.value)} className={inputCls} placeholder="https://skygorselmarket.com/…" />
          </Field>
        </div>
      </div>

      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="size-4 accent-primary" checked={k.asistanCevaplar} onChange={(e) => set("asistanCevaplar", e.target.checked)} /> Asistan cevaplasın (kapsamda)
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="size-4 accent-primary" checked={k.aktif} onChange={(e) => set("aktif", e.target.checked)} /> Aktif
        </label>
      </div>

      <Field label="Anahtar kelimeler" hint="Virgülle ayırın: müşterinin bu ürün için kullanabileceği ifadeler">
        <textarea rows={2} value={k.anahtarKelimeler} onChange={(e) => set("anahtarKelimeler", e.target.value)} className={areaCls} />
      </Field>
      <Field label="Ürün bilgisi" hint="Özellikler, set içeriği, kurulum, teslim, garanti, uyarılar (madde madde)">
        <textarea rows={10} value={k.bilgi} onChange={(e) => set("bilgi", e.target.value)} className={areaCls} />
      </Field>

      <Pairs title="Sık sorulan sorular" a="Soru" b="Cevap" rows={k.sss.map((x) => [x.soru, x.cevap])} onChange={(rows) => set("sss", rows.map(([soru, cevap]) => ({ soru, cevap })))} />
      <Pairs title="İtirazlar" a="İtiraz (ör. Pahalı)" b="Cevap" rows={k.itirazlar.map((x) => [x.itiraz, x.cevap])} onChange={(rows) => set("itirazlar", rows.map(([itiraz, cevap]) => ({ itiraz, cevap })))} />

      <div>
        <p className="text-xs font-semibold text-muted-foreground">Gönderilebilecek medya</p>
        <p className="text-[11px] text-muted-foreground">Görsel: buradan yükleyin (WhatsApp&apos;a JPEG olarak gider). Video: herkese açık https …mp4 adresi. Asistan yalnızca bu listedekileri gönderir.</p>
        <div className="mt-2 space-y-2">
          {k.medya.map((m, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-border p-2 sm:grid-cols-[100px_100px_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <input value={m.id} onChange={(e) => set("medya", k.medya.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))} className={cn(inputCls, "h-9")} placeholder="kimlik" />
              <select value={m.tur} onChange={(e) => set("medya", k.medya.map((x, j) => (j === i ? { ...x, tur: e.target.value === "video" ? "video" : "image" } : x)))} className={cn(inputCls, "h-9")}>
                <option value="image">Görsel</option>
                <option value="video">Video</option>
              </select>
              <input value={m.yol} onChange={(e) => set("medya", k.medya.map((x, j) => (j === i ? { ...x, yol: e.target.value } : x)))} className={cn(inputCls, "h-9")} placeholder="/dosya/urun/… ya da https://…mp4" />
              <input value={m.aciklama} onChange={(e) => set("medya", k.medya.map((x, j) => (j === i ? { ...x, aciklama: e.target.value } : x)))} className={cn(inputCls, "h-9")} placeholder="açıklama (mesajla birlikte gider)" />
              <button type="button" aria-label="Medyayı sil" onClick={() => set("medya", k.medya.filter((_, j) => j !== i))} className="px-2 text-muted-foreground hover:text-danger">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button size="sm" variant="outline" disabled={pending} onClick={() => fileRef.current?.click()}>
              <ImagePlus /> Görsel yükle
            </Button>
            <Button size="sm" variant="outline" onClick={() => set("medya", [...k.medya, { id: `video${k.medya.length + 1}`, tur: "video", yol: "", aciklama: "" }])}>
              <Plus /> Video ekle
            </Button>
          </div>
        </div>
      </div>

      <Field label="Bu ürüne özel yasaklar" hint="Asistanın asla söylememesi gerekenler">
        <textarea rows={3} value={k.yasaklar} onChange={(e) => set("yasaklar", e.target.value)} className={areaCls} />
      </Field>

      <div className="flex items-center gap-3">
        <Button disabled={pending} onClick={save}>
          <Save /> Kaydet
        </Button>
        {msg && <span className={cn("text-sm", msg.ok ? "text-success" : "text-danger")}>{msg.text}</span>}
      </div>
    </Card>
  );
}

function Pairs({ title, a, b, rows, onChange }: { title: string; a: string; b: string; rows: [string, string][]; onChange: (rows: [string, string][]) => void }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      <div className="mt-2 space-y-2">
        {rows.map(([x, y], i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-border p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
            <textarea rows={2} value={x} onChange={(e) => onChange(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} className={areaCls} placeholder={a} />
            <textarea rows={2} value={y} onChange={(e) => onChange(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} className={areaCls} placeholder={b} />
            <button type="button" aria-label="Satırı sil" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="px-2 text-muted-foreground hover:text-danger">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => onChange([...rows, ["", ""]])}>
          <Plus /> Satır ekle
        </Button>
      </div>
    </div>
  );
}
