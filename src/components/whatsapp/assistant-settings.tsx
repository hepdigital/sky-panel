"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bot, GraduationCap, ImagePlus, Package, Plus, RotateCcw, Save, Send, Trash2, X } from "lucide-react";
import { waAyarKaydet, waDeneme, waDenemeSifirla } from "@/app/panel/whatsapp/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toWebp } from "@/lib/image";
import { cn } from "@/lib/utils";
import { MessageBubble, type Bubble } from "./bubbles";

type Ayar = {
  aktif: boolean;
  calisma_modu: "7/24" | "mesai_disi" | "saat_araliklari";
  saat_araliklari: { gunler: number[]; bas: string; bit: string }[];
  model: string;
  effort: string;
  birlestirme_saniye: number;
  ekipten_geri_donus_saat: number | null;
  ton_ve_kurallar: string;
  karsilama: string;
  iban_gonderebilir: boolean;
  sesli_mesaj: "sor" | "devret";
  bildirim_eposta: string;
  usd_try_kuru: number | null;
  gunluk_butce_usd: number;
  sohbet_gunluk_tur: number;
  odeme_linki: "kapali" | "ekip_onayli" | "otomatik";
};

type Deneme = { durum: "asistan" | "ekip" | "kapali"; ozet: string | null; urunKodu: string | null; mesajlar: Bubble[] };

const inputCls = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";
const areaCls = "w-full rounded-xl border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";
const GUNLER = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const MODELLER = [
  { key: "claude-haiku-5-5", label: "Claude Haiku 5.5 (en ucuz)" },
  { key: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { key: "claude-opus-5-5", label: "Claude Opus 5.5 (en iyi kalite)" },
];
const modelAd = (k: string) => MODELLER.find((m) => m.key === k)?.label.replace(/ \(.*\)$/, "") ?? k;
const EFORLAR = [
  { key: "low", label: "Düşük (hızlı, ucuz)" },
  { key: "medium", label: "Orta (önerilen)" },
  { key: "high", label: "Yüksek" },
];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** Asistan ayarları (§4) ve deneme alanı (§7.2): WhatsApp'a bağlanmadan müşteri gibi yazıp cevabı görme */
export function AssistantSettings({
  ayar, calisiyor, butceDoldu, anahtar, deneme, denemeB,
}: {
  ayar: Ayar;
  calisiyor: boolean;
  butceDoldu: boolean;
  anahtar: boolean;
  deneme: Deneme;
  denemeB: Deneme | null;
}) {
  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <Link href="/panel/whatsapp" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Gelen kutusu
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-[28px]">WhatsApp asistanı</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {calisiyor ? (
              <span className="font-semibold text-success">Asistan şu an müşterilere cevap veriyor.</span>
            ) : !anahtar ? (
              <span className="font-semibold text-danger">Claude anahtarı (ANTHROPIC_API_KEY) sunucuda tanımlı değil; asistan çalışmaz.</span>
            ) : ayar.aktif && butceDoldu ? (
              <span className="font-semibold text-danger">Günlük AI bütçesi doldu; asistan yarın devam eder (deneme alanı çalışır).</span>
            ) : !ayar.aktif ? (
              "Asistan kapalı. Deneme alanında deneyip hazır olunca açın."
            ) : (
              "Asistan açık ama şu an çalışma saatleri dışında."
            )}
          </p>
        </div>
        <span className="flex flex-wrap gap-4">
          <Link href="/panel/whatsapp/urunler" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            <Package className="size-4" /> Ürün kartları
          </Link>
          <Link href="/panel/whatsapp/ornekler" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            <GraduationCap className="size-4" /> Öğrenilen cevaplar
          </Link>
        </span>
      </div>
      <div className="mt-5 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SettingsForm ayar={ayar} />
        <Playground deneme={deneme} denemeB={denemeB} anahtar={anahtar} varsayilanModel={ayar.model} />
      </div>
    </div>
  );
}

function SettingsForm({ ayar }: { ayar: Ayar }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [a, setA] = useState<Ayar>(ayar);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof Ayar>(k: K, v: Ayar[K]) => setA((x) => ({ ...x, [k]: v }));
  const setRange = (i: number, r: Partial<Ayar["saat_araliklari"][number]>) => set("saat_araliklari", a.saat_araliklari.map((x, j) => (j === i ? { ...x, ...r } : x)));

  const save = () =>
    start(async () => {
      const r = await waAyarKaydet(a);
      setMsg(r.ok ? { ok: true, text: "Kaydedildi." } : { ok: false, text: r.hata });
      if (r.ok) router.refresh();
    });

  return (
    <Card className="space-y-5 p-4 md:p-5">
      <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-4 py-3">
        <span>
          <span className="block text-sm font-bold">Asistan müşterilere cevap versin</span>
          <span className="block text-xs text-muted-foreground">Kapalıyken mesajlar yalnızca gelen kutusuna düşer.</span>
        </span>
        <input type="checkbox" className="size-5 accent-primary" checked={a.aktif} onChange={(e) => set("aktif", e.target.checked)} />
      </label>

      <div>
        <p className="text-xs font-semibold text-muted-foreground">Çalışma zamanı</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {(
            [
              ["7/24", "7/24"],
              ["mesai_disi", "Yalnız mesai dışında"],
              ["saat_araliklari", "Belirli saatlerde"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => set("calisma_modu", k)}
              className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", a.calisma_modu === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted")}
            >
              {l}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {a.calisma_modu === "mesai_disi"
            ? "Aşağıdaki saatler mesai sayılır; asistan bunların dışında cevap verir. Mesai bilgisi asistana da verilir."
            : a.calisma_modu === "saat_araliklari"
              ? "Asistan yalnızca aşağıdaki saatlerde cevap verir."
              : "Asistan her zaman cevap verir. Aşağıdaki saatler kullanılmaz."}{" "}
          Saatler Türkiye saati; bitiş başlangıçtan küçükse gece yarısını geçer (ör. 18:00 – 09:00).
        </p>
        {a.calisma_modu !== "7/24" && (
          <div className="mt-2 space-y-2">
            {a.saat_araliklari.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2">
                <div className="flex flex-wrap gap-1">
                  {GUNLER.map((g, j) => {
                    const on = r.gunler.includes(j + 1);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setRange(i, { gunler: on ? r.gunler.filter((x) => x !== j + 1) : [...r.gunler, j + 1].sort() })}
                        className={cn("rounded-md px-2 py-1 text-[11px] font-semibold", on ? "bg-foreground text-background" : "bg-muted")}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
                <input type="time" value={r.bas} onChange={(e) => setRange(i, { bas: e.target.value })} className={cn(inputCls, "h-8 w-28")} />
                <span className="text-xs">–</span>
                <input type="time" value={r.bit} onChange={(e) => setRange(i, { bit: e.target.value })} className={cn(inputCls, "h-8 w-28")} />
                <button type="button" aria-label="Aralığı sil" onClick={() => set("saat_araliklari", a.saat_araliklari.filter((_, j) => j !== i))} className="ml-auto text-muted-foreground hover:text-danger">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => set("saat_araliklari", [...a.saat_araliklari, { gunler: [1, 2, 3, 4, 5], bas: "09:00", bit: "18:00" }])}>
              <Plus /> Aralık ekle
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Model" hint="Kalite ve maliyet karşılaştırmasını sohbet kayıtlarıyla yapın.">
          <select value={a.model} onChange={(e) => set("model", e.target.value)} className={inputCls}>
            {MODELLER.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Düşünme düzeyi (effort)">
          <select value={a.effort} onChange={(e) => set("effort", e.target.value)} className={inputCls}>
            {EFORLAR.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Birleştirme süresi (saniye)" hint="Art arda yazılan mesajlar bu süre beklenip tek cevapla yanıtlanır.">
          <input type="number" min={0} max={60} value={a.birlestirme_saniye} onChange={(e) => set("birlestirme_saniye", Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="Ekip cevap vermezse asistana dön (saat)" hint="Boş: kapalı. Ekipteki sohbette müşteri bu kadar saat cevapsız kalırsa asistan devralır.">
          <input
            type="number"
            min={1}
            max={23}
            value={a.ekipten_geri_donus_saat ?? ""}
            onChange={(e) => set("ekipten_geri_donus_saat", e.target.value ? Number(e.target.value) : null)}
            className={inputCls}
          />
        </Field>
        <Field label="Sesli mesaj gelince">
          <select value={a.sesli_mesaj} onChange={(e) => set("sesli_mesaj", e.target.value === "devret" ? "devret" : "sor")} className={inputCls}>
            <option value="sor">Yazarak iletmesini rica etsin</option>
            <option value="devret">Ekibe devretsin</option>
          </select>
        </Field>
        <Field label="Devretme bildirimi e-postası" hint="Boş: e-posta gönderilmez (menü rozeti her zaman çalışır).">
          <input type="email" value={a.bildirim_eposta} onChange={(e) => set("bildirim_eposta", e.target.value)} className={inputCls} placeholder="satis@…" />
        </Field>
        <Field label="Günlük AI bütçesi (USD)" hint="Aşılırsa asistan o gün yeni tur başlatmaz; müşteriye bir kez bilgi verilir. Deneme alanı sayılmaz.">
          <input type="number" min={0} step="0.5" value={a.gunluk_butce_usd} onChange={(e) => set("gunluk_butce_usd", Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="Sohbet başına günlük en çok tur" hint="Aşılırsa sohbet ekibe devredilir.">
          <input type="number" min={1} max={500} value={a.sohbet_gunluk_tur} onChange={(e) => set("sohbet_gunluk_tur", Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="Dolar kuru (₺)" hint="Maliyetlerin ₺ gösterimi için elle girilir. Boş: $ gösterilir.">
          <input
            type="number"
            min={0}
            step="0.01"
            value={a.usd_try_kuru ?? ""}
            onChange={(e) => set("usd_try_kuru", e.target.value ? Number(e.target.value) : null)}
            className={inputCls}
          />
        </Field>
      </div>

      <Field
        label="Ödeme linki"
        hint="Asistan, müşteri sipariş özetini onaylayınca sitede ürünlü sipariş ve kart ödeme linki hazırlar (yalnız asistanın sattığı ürünlerde; tutarı sunucu hesaplar, kart komisyonu eklenmez)."
      >
        <select value={a.odeme_linki} onChange={(e) => set("odeme_linki", e.target.value as Ayar["odeme_linki"])} className={inputCls}>
          <option value="kapali">Kapalı</option>
          <option value="ekip_onayli">Ekip onaylı: özet sohbet kartına düşer, ekip tek tıkla gönderir</option>
          <option value="otomatik">Otomatik: link oluşturulup gönderilir, ekibe bildirim gider</option>
        </select>
      </Field>

      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={a.iban_gonderebilir} onChange={(e) => set("iban_gonderebilir", e.target.checked)} />
        <span>
          <span className="block text-sm font-semibold">Havale isteyen müşteriye IBAN gönderebilir</span>
          <span className="block text-xs text-muted-foreground">Kapalıyken havale isteyen müşterinin bilgileri kaydedilip ekibe devredilir. IBAN, ürün kartının sitesinin markasından alınır.</span>
        </span>
      </label>

      <Field label="Karşılama" hint="Asistanın ilk cevabında temel alacağı karşılama (boş bırakılabilir).">
        <textarea rows={2} value={a.karsilama} onChange={(e) => set("karsilama", e.target.value)} className={areaCls} maxLength={1000} />
      </Field>
      <Field label="Ton ve ek kurallar" hint="Serbest metin; sistem istemine eklenir. Örnek: hitap biçimi, kaçınılacak ifadeler.">
        <textarea rows={6} value={a.ton_ve_kurallar} onChange={(e) => set("ton_ve_kurallar", e.target.value)} className={areaCls} maxLength={8000} />
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

function Playground({ deneme, denemeB, anahtar, varsayilanModel }: { deneme: Deneme; denemeB: Deneme | null; anahtar: boolean; varsayilanModel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [kaynak, setKaynak] = useState<"reklam" | "site" | "dogrudan">("reklam");
  const [telefon, setTelefon] = useState("");
  const [modelA, setModelA] = useState(varsayilanModel);
  const [modelB, setModelB] = useState("");
  const yanYana = !!modelB || !!denemeB;
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const send = () =>
    (text.trim() || file) &&
    start(async () => {
      setErr(null);
      let gorsel: string | null = null;
      if (file) {
        try {
          gorsel = await toWebp(file, 1568);
        } catch {
          return setErr("Görsel okunamadı.");
        }
      }
      const r = await waDeneme(text, gorsel, { kaynak, telefon }, modelA, modelB || null);
      if (!r.ok) return setErr(r.hata);
      setText("");
      setFile(null);
      router.refresh();
    });

  const reset = () =>
    start(async () => {
      setErr(null);
      await waDenemeSifirla();
      router.refresh();
    });

  return (
    <Card className="flex max-h-[calc(100dvh-160px)] min-h-[70vh] flex-col overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Bot className="size-5 text-info" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">Deneme alanı</p>
          <p className="text-xs text-muted-foreground">Müşteri gibi yazın. Gerçek asistan ve gerçek bilgiler; WhatsApp&apos;a hiçbir şey gitmez, talep yazılmaz.</p>
        </div>
        {!yanYana && deneme.durum === "ekip" && <Badge tone="info">Ekibe devretti</Badge>}
        {!yanYana && deneme.urunKodu && <Badge dot={false}>{deneme.urunKodu}</Badge>}
        <Button size="sm" variant="outline" disabled={pending} onClick={reset}>
          <RotateCcw /> Sıfırla
        </Button>
      </div>
      <div className="flex flex-wrap gap-3 border-b border-border bg-muted/30 px-4 py-2 text-xs">
        <label className="flex items-center gap-2">
          Kaynak
          <select value={kaynak} onChange={(e) => setKaynak(e.target.value as typeof kaynak)} className="h-8 rounded-lg border border-input bg-card px-2">
            <option value="reklam">Reklamdan</option>
            <option value="site">Siteden</option>
            <option value="dogrudan">Doğrudan</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          Müşteri telefonu
          <input
            value={telefon}
            onChange={(e) => setTelefon(e.target.value)}
            placeholder="boş: kayıtsız müşteri"
            className="h-8 w-44 rounded-lg border border-input bg-card px-2"
            title="Kayıtlı bir müşterinin telefonunu yazarsanız sipariş sorgusu o müşteriyle denenir"
          />
        </label>
        <label className="flex items-center gap-2">
          Model
          <select value={modelA} onChange={(e) => setModelA(e.target.value)} className="h-8 rounded-lg border border-input bg-card px-2">
            {MODELLER.map((m) => (
              <option key={m.key} value={m.key}>
                {modelAd(m.key)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Karşılaştır
          <select value={modelB} onChange={(e) => setModelB(e.target.value)} className="h-8 rounded-lg border border-input bg-card px-2">
            <option value="">Yok</option>
            {MODELLER.map((m) => (
              <option key={m.key} value={m.key}>
                {modelAd(m.key)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={cn("grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]", yanYana && "grid-cols-2 divide-x divide-border")}>
        <Column d={deneme} baslik={yanYana ? modelAd(modelA) : null} pending={pending} bos />
        {yanYana && <Column d={denemeB ?? { durum: "asistan", ozet: null, urunKodu: null, mesajlar: [] }} baslik={modelB ? modelAd(modelB) : "Karşılaştırma"} pending={pending && !!modelB} />}
      </div>

      <div className="border-t border-border p-3">
        {err && <p className="mb-2 text-xs text-danger">{err}</p>}
        {file && (
          <p className="mb-2 flex items-center gap-2 text-xs">
            <ImagePlus className="size-3.5" /> {file.name}
            <button type="button" aria-label="Görseli kaldır" onClick={() => setFile(null)}>
              <X className="size-3.5" />
            </button>
          </p>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button variant="outline" aria-label="Görsel ekle" disabled={pending || !anahtar} onClick={() => fileRef.current?.click()}>
            <ImagePlus />
          </Button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 4096))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            disabled={!anahtar}
            placeholder={anahtar ? "Müşteri mesajı (Enter gönderir)" : "ANTHROPIC_API_KEY tanımlı değil"}
            className="min-h-11 w-full resize-none rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
          <Button disabled={pending || !anahtar || (!text.trim() && !file)} onClick={send} aria-label="Gönder">
            <Send />
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Deneme sütunu: mesajlar, araç ve maliyet satırları, devretme notu */
function Column({ d, baslik, pending, bos = false }: { d: Deneme; baslik: string | null; pending: boolean; bos?: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [d.mesajlar.length, pending]);
  return (
    <div className="min-w-0 space-y-2 overflow-y-auto bg-muted/30 px-4 py-4">
      {baslik && (
        <p className="sticky top-0 z-10 flex flex-wrap items-center gap-1.5 rounded-lg bg-card/90 px-2 py-1 text-xs font-bold backdrop-blur">
          {baslik}
          {d.durum === "ekip" && <Badge tone="info">Ekibe devretti</Badge>}
          {d.urunKodu && <Badge dot={false}>{d.urunKodu}</Badge>}
        </p>
      )}
      {d.mesajlar.map((m) => (
        <MessageBubble key={m.id} m={m} status={false} />
      ))}
      {bos && !d.mesajlar.length && <p className="py-10 text-center text-sm text-muted-foreground">Bir mesaj yazarak başlayın (ör. &quot;Merhaba fiyat nedir&quot;).</p>}
      {pending && <p className="text-center text-xs text-muted-foreground">Asistan yazıyor…</p>}
      {d.ozet && (
        <div className="rounded-xl bg-warning-soft p-3 text-xs">
          <p className="font-semibold">Devretme notu</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{d.ozet}</p>
        </div>
      )}
      <div ref={end} />
    </div>
  );
}
