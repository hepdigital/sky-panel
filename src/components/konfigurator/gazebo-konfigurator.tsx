"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Check, ChevronLeft, ChevronRight, CreditCard, Loader2, Minus, PhoneCall, Plus, Rotate3d, X } from "lucide-react";
import { FRAME_MAT, FRAME_NAME, SIDE_NAMES, fitWall, framesOf, type KonfEk } from "@/lib/konfigurator";
import { FABRICS, SIZES, SZ, cfgKey, gzRows, gzTotal, imgSrc, plan, slotPrice, slots, val, type Gazebo } from "@/lib/terminal/calc";
import { priceTable, setPriceTable, type PriceTable } from "@/lib/terminal/price-table";
import { cn } from "@/lib/utils";
import { viewerInput } from "@/modules/gazebo/viewer-map";
import { PRINT_SIDES, WALL_KINDS, hasDoor, hasWindow, kindAvailable, kindImage, printSide, wallPrice, type Wall } from "@/modules/gazebo/walls";
import type { Capture } from "@/modules/gazebo3d/mastertent/viewer";
import { ViewerBoundary } from "@/modules/gazebo3d/mastertent/viewer-boundary";

// Sitelere gömülen gazebo konfigüratörü: panelin modüler gazebo motoru (calc.ts, walls.ts) ve markanın fiyat tablosu,
// sitenin görünümüyle. Teklif ekranından sadeleştirilmiş: tavan ve duvarlar aynı kumaştan ve aynı renkte, kenarlar bölünmez,
// fiyat perakende ve KDV dahil gösterilir; fiyatı olmayan seçenek (ör. fiyatı girilmemiş tam PVC) hiç gösterilmez.

const Viewer = dynamic(() => import("@/modules/gazebo3d/mastertent/viewer"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-[#777]">3D model yükleniyor…</div>,
});

/** skygorselmarket.com renkleri (Woodmart tema ayarları): lacivert ana renk, turuncu satın alma düğmeleri */
const NAVY = "#024B90";
const ORANGE = "#F15A24";

const MODE = 1 as const; // perakende
const VAT = 1.2;
const tl = (n: number) => `${Math.round(n * VAT).toLocaleString("tr-TR")} ₺`;

const STEPS = ["Ölçü", "Baskı", "Kumaş", "İskelet", "Duvarlar", "Özet"] as const;
/** Duvarlar adımı (kamera kenara döner, zeminde kenar adı vurgulanır) */
const WALL_STEP = 4;
/** Sepet bileti siteye gönderildikten sonra sitenin ödemeye yönlendirmesi beklenir; olmazsa uyarı */
const PARENT_WAIT = 10_000;

type Color = { hex: string; ad: string };

/**
 * marka: fiyat tablosu ve sepet bileti bu markanındır. gomulu: sitenin sayfasında (iframe) açıldı; başlığı site gösterir.
 * Ödemeye geç: tasarım ve ek ürünler sunucuda fiyatlanıp imzalanır, bilet siteye (üst pencere) iletilir; site doğrulayıp
 * sepete ekler ve ödeme sayfasına geçer. ekler: son adımda önerilen ürünler (panelin teklif ürünleri, markanın fiyatı).
 */
export function GazeboKonfigurator({
  marka,
  gomulu,
  table,
  colors,
  ekler,
  start,
}: {
  marka: string;
  gomulu: boolean;
  table: PriceTable;
  colors: Color[];
  ekler: KonfEk[];
  /**
   * Siteden gelen ön seçim (kategori banner'ı): ölçü ve baskı seçili gelir, ilk seçilmemiş adımdan başlanır.
   * tasarim: sunucuda doğrulanmış hazır tasarım (WhatsApp asistanının linki); özet adımından açılır.
   */
  start?: { olcu?: string; baskili?: boolean; tasarim?: { g: Gazebo; ekler: Record<string, number>; adet: number } };
}) {
  // Hesaplar etkin fiyat tablosunu okur: markanın tablosu her çizimde etkin
  setPriceTable(table);
  const { FRAMES, ROOF } = table;

  const olcu0 = start?.olcu && framesOf(start.olcu).length ? start.olcu : null;
  // Baskılı kumaşı olmayan ölçüde baskı ön seçimi yok sayılır
  const baski0 = start?.baskili === undefined || (start.baskili && val(ROOF[olcu0 ?? "3x3"]?.[2] ?? null, MODE) === null) ? null : start.baskili;
  const hazir = start?.tasarim;
  const [step, setStep] = useState(hazir ? STEPS.length - 1 : olcu0 ? (baski0 === null ? 1 : 2) : 0);
  const [side, setSide] = useState(0);
  const [qty, setQty] = useState(hazir?.adet ?? 1);
  /** Ek ürün adetleri (kod → adet) */
  const [ek, setEk] = useState<Record<string, number>>(hazir?.ekler ?? {});
  const [busy, setBusy] = useState(false);
  /** Ödemeye geç: önce telefon penceresi (isteğe bağlı) */
  const [ask, setAsk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const capture = useRef<Capture | null>(null);
  const waiting = useRef<number | null>(null);
  useEffect(() => () => void (waiting.current && window.clearTimeout(waiting.current)), []);
  const [g, setG] = useState<Gazebo>(() => hazir?.g ?? ({
    size: olcu0 ?? "3x3",
    frame: framesOf(olcu0 ?? "3x3")[0] ?? null,
    roofFab: baski0 ? 2 : 0,
    color: colors.find((c) => c.hex === "#ffffff")?.hex ?? colors[0]?.hex ?? "#ffffff",
    sides: [0, 1, 2, 3].map(() => ({ walls: [{ kind: "yok", f: 0 } as Wall] })),
  }) as Gazebo);
  const fab = g.roofFab ?? 0;
  const pl = plan(g.size);
  const total = gzTotal(g, MODE);
  // Ölçüye uymayan ek ürün (ör. başka ölçünün çantası) seçimden düşer
  const extras = ekler.filter((e) => !e.olculer || e.olculer.includes(g.size));
  const chosen = Object.fromEntries(extras.filter((e) => (ek[e.kod] ?? 0) > 0).map((e) => [e.kod, ek[e.kod]]));
  const grand = total * qty + extras.reduce((t, e) => t + e.fiyat * (chosen[e.kod] ?? 0), 0);

  /** Duvarları ölçüye ve kumaşa göre satılabilir en yakın bileşime çeker */
  const fit = (next: Gazebo): Gazebo => {
    const p = plan(next.size);
    const f = next.roofFab ?? 0;
    return { ...next, sides: next.sides.map((s, i) => ({ walls: [fitWall(p[i].grup, { ...s.walls[0], f })] })) };
  };
  const update = (patch: Partial<Gazebo>) => setG((x) => fit({ ...x, ...patch }));

  const setSize = (size: string) => {
    const frames = framesOf(size);
    update({ size, frame: g.frame && frames.includes(g.frame) ? g.frame : (frames[0] ?? null) });
  };
  const setWall = (i: number, w: Wall) => setG((x) => ({ ...x, sides: x.sides.map((s, j) => (j === i ? { walls: [fitWall(pl[i].grup, { ...w, f: fab })] } : s)) }));

  async function addToCart() {
    setBusy(true);
    setErr(null);
    let gorsel: string | null = null;
    try {
      const url = capture.current?.().url;
      if (url?.startsWith("data:image/webp")) gorsel = url;
    } catch {
      // görüntü alınamazsa sepete görselsiz eklenir
    }
    const r = (await fetch("/api/konfigurator/sepet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marka, g, adet: qty, ekler: chosen, gorsel }) })
      .then((x) => x.json())
      .catch(() => ({ ok: false, hata: "Bağlantı kurulamadı, lütfen tekrar deneyin." }))) as { ok: boolean; token?: string; hata?: string };
    if (!r.ok || !r.token) {
      setBusy(false);
      return setErr(r.hata ?? "Ödemeye geçilemedi.");
    }
    if (window.parent === window) {
      setBusy(false);
      return setErr("Ödemeye geçiş, konfigüratör sitenin sayfasında açıldığında çalışır.");
    }
    let origin = "*";
    try {
      origin = new URL(document.referrer).origin;
    } catch {
      // referrer yoksa bilet herkese açık gönderilir: imzalı olduğu için yalnızca anahtarı bilen site kullanabilir
    }
    window.parent.postMessage({ tip: "sky-konfigurator:sepet", token: r.token }, origin);
    // Site ödemeye yönlendirir; yönlendirmezse kullanıcı beklemede kalmasın
    waiting.current = window.setTimeout(() => {
      setBusy(false);
      setErr("Site yanıt vermedi. Sayfayı yenileyip tekrar deneyin.");
    }, PARENT_WAIT);
  }

  const go = (n: number) => {
    setStep(Math.max(0, Math.min(STEPS.length - 1, n)));
    setErr(null);
    if (typeof window !== "undefined" && window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-dvh bg-[#f5f6f8] pb-28 text-[#242424] lg:pb-10" style={{ fontFamily: "var(--font-poppins), Arial, sans-serif" }}>
      <div className="mx-auto max-w-[1240px] px-4 pt-4 lg:px-6 lg:pt-8">
        {!gomulu && (
          <header className="mb-4 lg:mb-6">
            <h1 className="text-[22px] font-semibold tracking-tight lg:text-[28px]">Gazebo Çadırınızı Tasarlayın</h1>
            <p className="mt-1 text-[13px] text-[#777] lg:text-sm">Ölçüyü, iskeleti, kumaşı ve duvarları seçin; fiyat her adımda güncellenir.</p>
          </header>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-6">
          {/* 3D: mobilde üstte yapışkan, masaüstünde solda */}
          <div className="sticky top-0 z-20 -mx-4 bg-[#f5f6f8] px-4 pb-2 pt-2 lg:top-6 lg:mx-0 lg:self-start lg:p-0">
            <Preview g={g} focus={step === WALL_STEP ? GROUND_SIDES[side] : null} onCapture={(c) => (capture.current = c)} />
          </div>

          <div className="min-w-0">
            <Stepper step={step} onGo={go} />
            <section className="mt-3 rounded-[8px] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] ring-1 ring-black/5 lg:p-6">
              <h2 className="text-[17px] font-semibold">
                <span style={{ color: NAVY }}>{step + 1}.</span> {STEP_TITLE[step]}
              </h2>
              <p className="mt-0.5 text-[13px] text-[#777]">{STEP_HINT[step]}</p>
              <div className="mt-4">
                {step === 0 && <SizeStep g={g} framesOf={framesOf} onPick={setSize} />}
                {step === 1 && <PrintStep g={g} onPick={(baskili) => update({ roofFab: baskili ? 2 : fab === 2 ? 0 : fab })} />}
                {step === 2 &&
                  (fab === 2 ? (
                    <div className="space-y-3">
                      <OptionCard active onClick={() => undefined} title="Dijital baskılı Oxford" hint="Su itici · tavan ve duvarlar aynı kumaştan" price={`tavan ${tl(val(ROOF[g.size]?.[2] ?? null, MODE) ?? 0)}`} />
                      <p className="rounded-[8px] px-3 py-2.5 text-[13px]" style={{ background: "#fff4ef", color: "#9a3412" }}>
                        Baskılı gazebolarda renk seçimi yoktur: renkler tasarımınızdan gelir. Tasarımınızı siparişten sonra iletirsiniz, baskıdan önce onayınıza sunulur.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <ColorPicker title="Tavan rengi" colors={colors} value={g.color ?? "#ffffff"} onPick={(hex) => update({ color: hex })} />
                      <div>
                        <p className="mb-2 text-[13px] font-semibold">Kumaş</p>
                        <div className="grid gap-2.5">
                          {FABRICS.map((f, i) => {
                            const p = val(ROOF[g.size]?.[i] ?? null, MODE);
                            if (i === 2 || p === null) return null;
                            return <OptionCard key={f.n} active={fab === i} onClick={() => update({ roofFab: i })} title={f.n} hint={f.d} price={`tavan ${tl(p)}`} />;
                          })}
                        </div>
                        <p className="mt-2.5 rounded-[8px] bg-[#f5f6f8] px-3 py-2.5 text-[12px] text-[#555]">Tavan ve duvarlar aynı kumaştan dikilir; duvar rengini duvarları seçerken belirlersiniz.</p>
                      </div>
                    </div>
                  ))}
                {step === 3 && (
                  <div className="grid gap-2.5">
                    {framesOf(g.size).map((id) => (
                      <OptionCard
                        key={id}
                        active={g.frame === id}
                        onClick={() => update({ frame: id })}
                        img={imgSrc(`f:${id}`)}
                        title={FRAME_NAME[id] ?? FRAMES[id].desc}
                        hint={`${FRAMES[id].desc} · ${FRAME_MAT[id] ?? ""}`}
                        price={tl(val(FRAMES[id].p[g.size], MODE)!)}
                      />
                    ))}
                  </div>
                )}
                {step === WALL_STEP && (
                  <div className="space-y-5">
                    <WallsStep g={g} side={side} setSide={setSide} onWall={setWall} />
                    {fab !== 2 && g.sides.some((x) => x.walls[0].kind !== "yok") && (
                      <div>
                        <ColorPicker
                          title="Duvar rengi"
                          colors={colors}
                          value={g.wallColor ?? g.color ?? "#ffffff"}
                          same={!g.wallColor}
                          onSame={() => update({ wallColor: undefined })}
                          onPick={(hex) => update({ wallColor: hex === g.color ? undefined : hex })}
                        />
                        <p className="mt-2 text-[11px] text-[#777]">Dört duvar aynı renktedir; tavandan farklı seçerek renk kombinleyebilirsiniz.</p>
                      </div>
                    )}
                  </div>
                )}
                {step === 5 && (
                  <div className="space-y-6">
                    <Summary g={g} colors={colors} qty={qty} setQty={setQty} />
                    <Extras list={extras} ek={chosen} setEk={(kod, n) => setEk((x) => ({ ...x, [kod]: n }))} />
                  </div>
                )}
              </div>
              {err && (
                <p className="mt-4 rounded-[8px] px-3 py-2.5 text-[13px]" style={{ background: "#fdecec", color: "#b42318" }}>
                  {err}
                </p>
              )}
              <div className="mt-6 hidden border-t border-[#eef0f3] pt-4 lg:block">
                <NavBar step={step} total={grand} qty={qty} busy={busy} onBack={() => go(step - 1)} onNext={() => (step === STEPS.length - 1 ? setAsk(true) : go(step + 1))} />
              </div>
            </section>
          </div>
        </div>
      </div>

      {ask && (
        <PhoneModal
          marka={marka}
          g={g}
          qty={qty}
          ekler={chosen}
          capture={() => capture.current}
          onClose={() => setAsk(false)}
          onDone={() => {
            setAsk(false);
            void addToCart();
          }}
        />
      )}

      {/* Alt çubuk: mobilde ekrana sabit (masaüstünde adım kartının altında) */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/10 bg-white/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden">
        <NavBar step={step} total={grand} qty={qty} busy={busy} onBack={() => go(step - 1)} onNext={() => (step === STEPS.length - 1 ? setAsk(true) : go(step + 1))} />
      </div>
    </div>
  );
}

const STEP_TITLE = ["Çadır ölçüsü", "Baskısız mı, baskılı mı?", "Tavan rengi ve kumaş", "İskelet", "Duvarlar", "Özet ve ek ürünler"];
const STEP_HINT = [
  "Kurulacak alanın ölçüsünü seçin.",
  "Tek renk kumaş mı, logonuzun basıldığı kumaş mı?",
  "Tavan ve duvarlar aynı kumaştan dikilir.",
  "Kullanım sıklığına göre iskelet serisini seçin.",
  "Kenarı seçip duvar tipini belirleyin; duvar istemediğiniz kenar boş kalır. Duvar rengi altta.",
  "Seçimlerinizi kontrol edin, isterseniz sabitleme ve taşıma ürünleri ekleyip ödemeye geçin.",
];

/** Kenarda gösterilecek duvar tipleri: fiyatı olanlar */
const kindsFor = (grup: string, f: number) =>
  WALL_KINDS.filter((k) => k.kind === "yok" || (kindAvailable(grup, k.kind, f, MODE) && wallPrice(grup, fitWall(grup, { kind: k.kind, f }), MODE) !== null));

/* ───────────── parçalar ───────────── */

/** Kenar sırası (Ön, Arka, Sol, Sağ) → 3D'deki kenar */
const GROUND_SIDES = ["on", "arka", "sol", "sag"] as const;
/** Zemindeki logo (sitenin logosu, panelden servis edilir) */
const GROUND_LOGO = "/konfigurator/sky-logo.png";

function Preview({ g, focus, onCapture }: { g: Gazebo; focus: (typeof GROUND_SIDES)[number] | null; onCapture: (c: Capture | null) => void }) {
  const key = cfgKey(g);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const input = useMemo(() => viewerInput(g), [key]);
  return (
    <div className="relative h-[32vh] min-h-[220px] overflow-hidden rounded-[8px] bg-white ring-1 ring-black/5 lg:h-[min(72vh,600px)]">
      <ViewerBoundary
        fallback={
          <div className="relative size-full">
            <Image src={imgSrc(`r:${g.size}`)} alt="" fill sizes="600px" className="object-contain p-6" />
          </div>
        }
      >
        <Viewer {...input} curtainsOpen printTheme="sky" registerCapture={onCapture} groundMarks={{ logo: GROUND_LOGO, active: focus, accent: ORANGE }} focusSide={focus} />
      </ViewerBoundary>
      <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-[#555] shadow-sm ring-1 ring-black/5">
        <Rotate3d className="size-3.5" /> Sürükleyerek çevirin
      </span>
      <span className="pointer-events-none absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white" style={{ background: NAVY }}>
        {SZ[g.size]} m
      </span>
    </div>
  );
}

function Stepper({ step, onGo }: { step: number; onGo: (n: number) => void }) {
  return (
    <>
      {/* Mobil: adım n / 5 ve ilerleme çubuğu */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-semibold">
            Adım {step + 1}/{STEPS.length} · {STEPS[step]}
          </span>
          {step < STEPS.length - 1 && <span className="text-[#777]">Sonraki: {STEPS[step + 1]}</span>}
        </div>
        <div className="mt-2 grid grid-cols-6 gap-1">
          {STEPS.map((s, i) => (
            <button key={s} type="button" onClick={() => onGo(i)} aria-label={s} className="h-1.5 rounded-full" style={{ background: i <= step ? NAVY : "#dfe3e8" }} />
          ))}
        </div>
      </div>
      {/* Masaüstü: numaralı adımlar */}
      <ol className="hidden items-center gap-1 lg:flex">
        {STEPS.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-1", i < STEPS.length - 1 && "flex-1")}>
            <button
              type="button"
              onClick={() => onGo(i)}
              className={cn("flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full py-1 pl-1 text-[12px] font-medium", i === step ? "pr-2.5" : "pr-1 xl:pr-2.5", i === step ? "bg-white shadow-sm ring-1 ring-black/5" : "text-[#777] hover:text-[#242424]")}
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white" style={{ background: i <= step ? NAVY : "#c9ced6" }}>
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              {/* Dar masaüstünde yalnızca etkin adımın adı */}
              <span className={cn(i !== step && "hidden xl:inline")}>{s}</span>
            </button>
            {i < STEPS.length - 1 && <span className="h-px min-w-1.5 flex-1 bg-[#dfe3e8]" />}
          </li>
        ))}
      </ol>
    </>
  );
}

function NavBar({ step, total, qty, busy, onBack, onNext }: { step: number; total: number; qty: number; busy: boolean; onBack: () => void; onNext: () => void }) {
  const last = step === STEPS.length - 1;
  return (
    <div className="flex items-center gap-2.5">
      <div className="mr-auto min-w-0">
        <p className="text-[11px] text-[#777]">{qty > 1 ? `${qty} adet · ` : ""}KDV dahil</p>
        <p className="text-[19px] font-semibold leading-tight tracking-tight lg:text-[22px]" style={{ color: NAVY }}>
          {tl(total)}
        </p>
      </div>
      {step > 0 && (
        <button type="button" onClick={onBack} className="grid h-11 w-11 shrink-0 place-items-center rounded-[8px] border border-[#dfe3e8] bg-white text-[#333] hover:bg-[#f5f6f8] sm:w-auto sm:px-4" aria-label="Geri">
          <span className="flex items-center gap-1 text-[14px] font-medium">
            <ChevronLeft className="size-4" /> <span className="hidden sm:inline">Geri</span>
          </span>
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={busy}
        className="flex h-11 shrink-0 items-center gap-1.5 rounded-[8px] px-5 text-[14px] font-semibold text-white hover:brightness-95 disabled:opacity-70"
        style={{ background: ORANGE }}
      >
        {last ? (
          <>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />} {busy ? "Yönlendiriliyor…" : "Ödemeye geç"}
          </>
        ) : (
          <>
            Devam <ChevronRight className="size-4" />
          </>
        )}
      </button>
    </div>
  );
}

function OptionCard({ active, onClick, img, title, hint, price }: { active: boolean; onClick: () => void; img?: string; title: string; hint: string; price: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("flex items-center gap-3 rounded-[8px] border-2 bg-white p-3 text-left transition-colors", active ? "" : "border-[#e6e9ee] hover:border-[#c9ced6]")}
      style={active ? { borderColor: NAVY, background: "#f3f7fb" } : undefined}
    >
      {img && (
        <span className="relative size-12 shrink-0 overflow-hidden rounded-[6px] bg-white ring-1 ring-black/5">
          <Image src={img} alt="" fill sizes="48px" className="object-contain" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">{title}</span>
        <span className="block text-[12px] text-[#777]">{hint}</span>
      </span>
      <span className="shrink-0 text-right text-[13px] font-semibold" style={{ color: NAVY }}>
        {price}
      </span>
      <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2", active ? "text-white" : "border-[#c9ced6]")} style={active ? { background: NAVY, borderColor: NAVY } : undefined}>
        {active && <Check className="size-3" strokeWidth={3} />}
      </span>
    </button>
  );
}

/** Baskısız (tek renk) ya da baskılı (dijital baskı) gazebo: yan yana görselli iki kart */
function PrintStep({ g, onPick }: { g: Gazebo; onPick: (baskili: boolean) => void }) {
  const roof = priceTable().ROOF[g.size] ?? [];
  const from = (i: number) => val(roof[i] ?? null, MODE);
  const plain = [from(0), from(1)].filter((x): x is number => x !== null);
  const cards = [
    { baskili: false, img: "/konfigurator/tip-baskisiz.webp", title: "Baskısız gazebo", hint: "Tek renk kumaş. Tavan ve duvar rengini paletimizden seçersiniz; tavan ve duvarlar farklı renk olabilir.", price: plain.length ? Math.min(...plain) : null },
    { baskili: true, img: "/konfigurator/tip-baskili.webp", title: "Baskılı gazebo", hint: "Logonuz ve tasarımınız tavana ve duvarlara dijital baskıyla basılır. Tasarım baskıdan önce onayınıza sunulur.", price: from(2) },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {cards.map((c) => {
        if (c.price === null) return null;
        const active = (g.roofFab === 2) === c.baskili;
        return (
          <button
            key={c.title}
            type="button"
            onClick={() => onPick(c.baskili)}
            aria-pressed={active}
            className={cn("flex flex-col overflow-hidden rounded-[8px] border-2 bg-white text-left transition-colors", active ? "" : "border-[#e6e9ee] hover:border-[#c9ced6]")}
            style={active ? { borderColor: NAVY, background: "#f3f7fb" } : undefined}
          >
            <span className="relative aspect-[4/3] w-full bg-white">
              <Image src={c.img} alt={c.title} fill sizes="(min-width: 1024px) 260px, 50vw" className="object-contain" />
              {active && (
                <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full text-white" style={{ background: NAVY }}>
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              )}
            </span>
            <span className="flex flex-1 flex-col p-2.5 sm:p-3">
              <span className="text-[14px] font-semibold">{c.title}</span>
              <span className="mt-1 text-[11px] leading-snug text-[#666] sm:text-[12px]">{c.hint}</span>
              <span className="mt-auto pt-2 text-[12px] font-semibold" style={{ color: NAVY }}>
                tavan {tl(c.price)}&apos;den
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SizeStep({ g, framesOf, onPick }: { g: Gazebo; framesOf: (s: string) => string[]; onPick: (s: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {SIZES.map((s) => {
        const frames = framesOf(s);
        if (!frames.length) return null;
        // Başlangıç fiyatı: en uygun iskelet + 690D tavan
        const from = Math.min(...frames.map((id) => val(priceTable().FRAMES[id]?.p[s] ?? null, MODE) ?? Infinity)) + (val(priceTable().ROOF[s]?.[0] ?? null, MODE) ?? 0);
        const active = g.size === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            aria-pressed={active}
            className={cn("flex flex-col items-center rounded-[8px] border-2 bg-white p-2 pb-2.5 transition-colors", active ? "" : "border-[#e6e9ee] hover:border-[#c9ced6]")}
            style={active ? { borderColor: NAVY, background: "#f3f7fb" } : undefined}
          >
            <span className="relative aspect-[4/3] w-full">
              <Image src={`/konfigurator/olcu-${s}.webp`} alt={`${SZ[s]} m gazebo`} fill sizes="200px" className="rounded-[6px] object-cover" />
            </span>
            <span className="mt-1 text-[15px] font-semibold">{SZ[s]} m</span>
            <span className="text-[11px] text-[#777]">{Number.isFinite(from) ? `${tl(from)}'den` : ""}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Renk paleti; same/onSame verilirse başta "Tavanla aynı" seçeneği (duvar rengi) */
function ColorPicker({
  title, colors, value, onPick, same, onSame,
}: { title: string; colors: Color[]; value: string; onPick: (hex: string) => void; same?: boolean; onSame?: () => void }) {
  const name = colors.find((c) => c.hex === value)?.ad ?? "";
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold">
          {title} <span className="font-normal text-[#777]">· {same ? `Tavanla aynı (${name})` : name}</span>
        </p>
        {onSame && (
          <button
            type="button"
            onClick={onSame}
            aria-pressed={same}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium", same ? "text-white" : "border-[#dfe3e8] bg-white text-[#333]")}
            style={same ? { background: NAVY, borderColor: NAVY } : undefined}
          >
            {same && <Check className="size-3.5" strokeWidth={3} />} Tavanla aynı
          </button>
        )}
      </div>
      <div className="mt-2.5 grid grid-cols-6 gap-2.5 sm:grid-cols-9">
        {colors.map((c) => (
          <button
            key={c.hex}
            type="button"
            title={c.ad}
            aria-label={c.ad}
            aria-pressed={value === c.hex}
            onClick={() => onPick(c.hex)}
            className="relative aspect-square w-full rounded-full ring-1 ring-black/15 transition-transform hover:scale-105"
            style={{ background: c.hex, boxShadow: value === c.hex && !same ? `0 0 0 2px #fff, 0 0 0 4px ${NAVY}` : undefined }}
          >
            {value === c.hex && !same && <Check className="absolute inset-0 m-auto size-4" style={{ color: isLight(c.hex) ? "#242424" : "#fff" }} strokeWidth={3} />}
          </button>
        ))}
      </div>
    </div>
  );
}
const isLight = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 160;
};

/* ───────────── duvarlar ───────────── */

function WallsStep({ g, side, setSide, onWall }: { g: Gazebo; side: number; setSide: (i: number) => void; onWall: (i: number, w: Wall) => void }) {
  const f = g.roofFab ?? 0;
  const pl = plan(g.size);
  const cur = g.sides.map((s) => s.walls[0]);
  const w = cur[side];
  const grup = pl[side].grup;
  const sidePrice = (i: number) => (cur[i].kind === "yok" ? null : slotPrice(slots(g).find((s) => s.side === i)!, MODE));

  return (
    <div className="space-y-3">
      {/* Kenar sekmeleri: kaydırırken üstte (mobilde 3D'nin altında) sabit */}
      <div className="sticky top-[calc(max(32vh,220px)+16px)] z-10 -mx-4 bg-white px-4 py-2 lg:top-4 lg:mx-0 lg:px-0">
        <div className="grid grid-cols-4 gap-1.5">
          {pl.map((p, i) => {
            const active = side === i;
            const kind = WALL_KINDS.find((k) => k.kind === cur[i].kind);
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => setSide(i)}
                aria-pressed={active}
                className={cn("relative min-w-0 rounded-[8px] border-2 px-1.5 py-2 text-center", active ? "text-white" : "border-[#e6e9ee] bg-white hover:border-[#c9ced6]")}
                style={active ? { background: NAVY, borderColor: NAVY } : undefined}
              >
                <span className="block text-[13px] font-semibold leading-tight">{SIDE_NAMES[i]}</span>
                <span className={cn("block truncate text-[10px] leading-tight", active ? "text-white/80" : "text-[#777]")}>{cur[i].kind === "yok" ? "Duvar yok" : kind?.short}</span>
                <span className={cn("block text-[10px] font-semibold leading-tight", active ? "text-white" : "")} style={active ? undefined : { color: NAVY }}>
                  {sidePrice(i) !== null ? tl(sidePrice(i)!) : "—"}
                </span>
                {/* Seçili kenar: aşağıdaki duvar seçeneklerini gösteren ok */}
                {active && <span aria-hidden className="absolute -bottom-[9px] left-1/2 size-3.5 -translate-x-1/2 rotate-45 rounded-[2px]" style={{ background: NAVY }} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-[8px] bg-[#f5f6f8] p-3 lg:p-4">
        <p className="mb-2.5 text-[13px] font-semibold">
          {SIDE_NAMES[side]} duvar <span className="font-normal text-[#777]">· {pl[side].h} × {pl[side].cm} cm</span>
        </p>
        {w.kind !== "yok" && printSide(w) && (
          <div className="mb-3 rounded-[8px] bg-white p-2.5 ring-1 ring-[#e6e9ee]">
            <p className="mb-1.5 text-[12px] font-semibold">Baskı yüzü</p>
            <div className="flex flex-wrap gap-2">
              {PRINT_SIDES.map((ps) => (
                <Toggle key={ps.y} on={printSide(w) === ps.y} label={ps.short} onClick={() => onWall(side, { ...w, y: ps.y })} />
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-[#777]">
              {printSide(w) === "cift"
                ? "Duvar iki kez basılıp sırt sırta dikilir; içeriden ve dışarıdan baskı görünür."
                : "Baskı tek yüzdedir; diğer yüz beyaz kumaştır. İki yüzde de baskı için çift taraflıyı seçin."}
            </p>
          </div>
        )}
        {hasWindow(w.kind) && w.p && (
          <div className="mb-3 rounded-[8px] bg-white p-2.5 ring-1 ring-[#e6e9ee]">
            <p className="mb-1.5 text-[12px] font-semibold">Pencere</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["pvc", "Şeffaf PVC"],
                  ["sineklik", "Sineklik"],
                  ["perde", "Perde (kapatılabilir)"],
                ] as const
              ).map(([key, label]) => (
                <Toggle key={key} on={w.p![key]} label={label} onClick={() => onWall(side, { ...w, p: { ...w.p!, [key]: !w.p![key] } })} />
              ))}
            </div>
          </div>
        )}
        {hasDoor(w.kind) && (
          <div className="mb-3 rounded-[8px] bg-white p-2.5 ring-1 ring-[#e6e9ee]">
            <p className="mb-1.5 text-[12px] font-semibold">Kapı</p>
            <Toggle on={!!w.k?.sineklik} label="Sineklikli kapı" onClick={() => onWall(side, { ...w, k: { sineklik: !w.k?.sineklik } })} />
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {kindsFor(grup, f).map((k) => {
            const active = w.kind === k.kind;
            const cand = k.kind === "yok" ? null : fitWall(grup, active ? w : { kind: k.kind, f, y: w.y });
            const img = kindImage(k.kind);
            return (
              <button
                key={k.kind}
                type="button"
                onClick={() => onWall(side, active ? w : { kind: k.kind, f, y: w.y, ...(hasDoor(k.kind) ? { k: { sineklik: false } } : {}) })}
                className={cn("flex flex-col items-center rounded-[8px] border-2 bg-white p-2 text-center", active ? "" : "border-transparent hover:border-[#c9ced6]")}
                style={active ? { borderColor: NAVY } : undefined}
              >
                <span className="relative grid aspect-square w-full max-w-[72px] place-items-center">
                  {img ? <Image src={imgSrc(img)} alt="" fill sizes="72px" className="object-contain" /> : <span className="text-[22px] text-[#c9ced6]">∅</span>}
                </span>
                <span className="mt-1 text-[11px] font-medium leading-tight">{k.short}</span>
                <span className="text-[10px] text-[#777]">{cand ? tl(wallPrice(grup, cand, MODE)!) : "ücretsiz"}</span>
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium", on ? "text-white" : "border-[#dfe3e8] bg-white text-[#333]")}
      style={on ? { background: NAVY, borderColor: NAVY } : undefined}
    >
      {on ? <Check className="size-3.5" strokeWidth={3} /> : <Plus className="size-3.5" />} {label}
    </button>
  );
}

/* ───────────── özet ───────────── */

function Summary({ g, colors, qty, setQty }: { g: Gazebo; colors: Color[]; qty: number; setQty: (n: number) => void }) {
  const rows = gzRows(g, MODE);
  const fab = g.roofFab ?? 0;
  return (
    <div>
      <ul className="divide-y divide-[#eef0f3] rounded-[8px] ring-1 ring-[#e6e9ee]">
        {rows.map((r) => (
          <li key={r.c} className="flex items-center gap-3 px-3 py-2.5">
            <span className="relative size-10 shrink-0 overflow-hidden rounded-[6px] bg-[#f5f6f8]">{r.img && <Image src={imgSrc(r.img)} alt="" fill sizes="40px" className="object-contain" />}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold">{r.img?.startsWith("f:") ? (FRAME_NAME[r.img.slice(2)] ?? r.t) : r.t}</span>
              <span className="block truncate text-[11px] text-[#777]">{r.s}</span>
            </span>
            <span className="shrink-0 text-[13px] font-semibold">{tl(r.v)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
        <dt className="text-[#777]">Kumaş</dt>
        <dd className="text-right font-medium">{fab === 2 ? "Dijital baskılı" : FABRICS[fab].n}</dd>
        {fab !== 2 && (
          <>
            <dt className="text-[#777]">{g.wallColor ? "Tavan / duvar rengi" : "Renk"}</dt>
            <dd className="text-right font-medium">
              {colors.find((c) => c.hex === g.color)?.ad ?? "Beyaz"}
              {g.wallColor ? ` / ${colors.find((c) => c.hex === g.wallColor)?.ad ?? ""}` : ""}
            </dd>
          </>
        )}
        <dt className="text-[#777]">Duvar yüksekliği</dt>
        <dd className="text-right font-medium">{plan(g.size)[0].h} cm</dd>
      </dl>
      <div className="mt-4 flex items-center justify-between rounded-[8px] bg-[#f5f6f8] px-3 py-2.5">
        <span className="text-[13px] font-semibold">Çadır adedi</span>
        <Stepper2 value={qty} min={1} max={99} onChange={setQty} />
      </div>
    </div>
  );
}

function Stepper2({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center rounded-[8px] bg-white ring-1 ring-[#dfe3e8]">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="grid size-10 place-items-center" aria-label="Azalt">
        <Minus className="size-4" />
      </button>
      <span className="w-8 text-center text-[14px] font-semibold">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="grid size-10 place-items-center" aria-label="Artır">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

/* ───────────── ek ürünler ───────────── */

/** Panelin teklif ürünlerinden sabitleme ve taşıma ürünleri; gruplar paneldeki kategori sırasıyla */
function Extras({ list, ek, setEk }: { list: KonfEk[]; ek: Record<string, number>; setEk: (kod: string, n: number) => void }) {
  if (!list.length) return null;
  const groups = [...new Set(list.map((e) => e.grup))];
  return (
    <div className="space-y-5">
      {groups.map((grup) => (
        <div key={grup}>
          <h3 className="text-[15px] font-semibold">{grup}</h3>
          {/sabit/i.test(grup) && <p className="mt-0.5 text-[12px] text-[#777]">Rüzgârlı havada çadırın kalkmaması için her ayağa bir ağırlık önerilir.</p>}
          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
            {list
              .filter((e) => e.grup === grup)
              .map((e) => {
                const n = ek[e.kod] ?? 0;
                return (
                  <div key={e.kod} className={cn("flex gap-3 rounded-[8px] border-2 bg-white p-2.5", n ? "" : "border-[#e6e9ee]")} style={n ? { borderColor: NAVY, background: "#f3f7fb" } : undefined}>
                    <span className="relative size-[72px] shrink-0 overflow-hidden rounded-[6px] bg-white ring-1 ring-black/5">
                      {e.gorsel && <Image src={e.gorsel} alt="" fill sizes="72px" className="object-contain p-1" unoptimized={e.gorsel.startsWith("/dosya/") || /^https?:/.test(e.gorsel)} />}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="text-[13px] font-semibold leading-tight">{e.ad}</p>
                      {e.aciklama && <p className="mt-0.5 text-[11px] text-[#777]">{e.aciklama.toLocaleLowerCase("tr-TR") === "adet" ? "Adet fiyatı" : e.aciklama}</p>}
                      {e.uyari && <p className="mt-0.5 text-[11px]" style={{ color: "#9a3412" }}>{e.uyari}</p>}
                      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
                        <span className="whitespace-nowrap text-[13px] font-semibold" style={{ color: NAVY }}>
                          {tl(e.fiyat)}
                        </span>
                        {n ? (
                          <Stepper2 value={n} min={0} max={999} onChange={(v) => setEk(e.kod, v)} />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEk(e.kod, 1)}
                            className="inline-flex h-9 items-center gap-1 rounded-[8px] border px-3 text-[13px] font-semibold"
                            style={{ borderColor: NAVY, color: NAVY }}
                          >
                            <Plus className="size-4" /> Ekle
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────────── ödemeye geç: telefon ───────────── */

/**
 * Ödemeye geçerken açılan pencere: telefon bırakılırsa tasarım ve fiyatıyla panelde Talepler'e düşer (ödeme
 * tamamlanmazsa satış ekibi arar). Zorunlu değildir: "Numara vermeden devam et" ile de ödemeye geçilir.
 */
function PhoneModal({
  marka, g, qty, ekler, capture, onClose, onDone,
}: { marka: string; g: Gazebo; qty: number; ekler: Record<string, number>; capture: () => Capture | null; onClose: () => void; onDone: () => void }) {
  const [tel, setTel] = useState("");
  const [trap, setTrap] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (tel.replace(/\D/g, "").length < 10) return setErr("Telefon numaranızı yazın (ör. 0532 123 45 67).");
    setBusy(true);
    setErr(null);
    let gorsel: string | null = null;
    try {
      const url = capture()?.().url;
      if (url?.startsWith("data:image/webp")) gorsel = url;
    } catch {
      // görselsiz kaydedilir
    }
    const r = (await fetch("/api/konfigurator/kayit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marka, g, adet: qty, ekler, gorsel, telefon: tel, site: trap }),
    })
      .then((x) => x.json())
      .catch(() => ({ ok: true }))) as { ok: boolean; hata?: string };
    // Numara hatalıysa düzeltilsin; kayıt başka bir nedenle alınamazsa ödeme engellenmez
    if (!r.ok && /telefon/i.test(r.hata ?? "")) {
      setBusy(false);
      return setErr(r.hata!);
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-labelledby="konf-tel-baslik"
        className="relative w-full max-w-[440px] rounded-t-[12px] bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-xl sm:rounded-[12px] sm:p-6"
      >
        <button type="button" onClick={onClose} className="absolute right-3 top-3 grid size-9 place-items-center rounded-full text-[#777] hover:bg-[#f5f6f8]" aria-label="Kapat">
          <X className="size-5" />
        </button>
        <span className="grid size-11 place-items-center rounded-full text-white" style={{ background: ORANGE }}>
          <PhoneCall className="size-5" />
        </span>
        <h3 id="konf-tel-baslik" className="mt-3 text-[18px] font-semibold">
          Gazebonuzu kaydedin
        </h3>
        <p className="mt-1 text-[13px] text-[#555]">Gazebonuzu kaydetmek için telefon numaranızı yazın.</p>
        <input
          ref={input}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={tel}
          onChange={(e) => setTel(e.target.value)}
          placeholder="05xx xxx xx xx"
          aria-label="Telefon"
          className="mt-4 h-12 w-full rounded-[8px] border border-[#dfe3e8] bg-white px-3 text-[16px] outline-none focus:border-[#024B90]"
        />
        {/* Bot tuzağı: kullanıcı görmez */}
        <input value={trap} onChange={(e) => setTrap(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden className="hidden" name="site" />
        {err && <p className="mt-2 text-[12px]" style={{ color: "#b42318" }}>{err}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 flex h-12 w-full items-center justify-center gap-1.5 rounded-[8px] text-[15px] font-semibold text-white hover:brightness-95 disabled:opacity-70"
          style={{ background: ORANGE }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />} Kaydet ve ödemeye geç
        </button>
        <button type="button" onClick={onDone} disabled={busy} className="mt-2 h-10 w-full text-[13px] font-medium text-[#777] hover:text-[#242424]">
          Numara vermeden devam et
        </button>
      </form>
    </div>
  );
}
