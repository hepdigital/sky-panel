"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileDown } from "lucide-react";
import { useRole } from "@/components/admin/role-context";
import { Button } from "@/components/ui/button";
import { FRAMES, OPT_SUFFIX, TL, cfgKey, emptySides, hesap, newIsk, sideFrom, splitKey, type CartGazebo, type Catalog, type Gazebo, type QuoteState } from "@/lib/terminal/calc";
import { cn } from "@/lib/utils";
import { READY_GAZEBOS } from "@/modules/gazebo/ready";
import { CatalogCard } from "./catalog-card";
import { CustomerBar } from "./customer-picker";
import type { CaptureViews } from "./gazebo-3d";
import { GazeboCard } from "./gazebo-card";
import { SaveSheet, type QuoteCustomer } from "./save-sheet";
import { Summary } from "./summary";

/** Sepet tarayıcıda saklanır (sayfa kapanıp açılınca durur). Teklif sayfasındaki "Terminalde aç" OPEN_KEY'e yazar. */
const STORE_KEY = "sky-b2b-terminal-v1";
export const OPEN_KEY = "sky-b2b-terminal-ac";

const newDraft = (): Gazebo => ({ size: "3x3", frame: "SQ3", roofFab: 0, sides: emptySides(), color: "#ffffff" });
const emptyQuote = (): QuoteState => ({ mode: 1, vat: 0, cart: [], prod: {}, prodIsk: {}, isk: newIsk() });
let seq = 0;
const newId = () => `g${Date.now().toString(36)}${seq++}`;

/** Kayıttan gelen teklif durumu doğrulanır (PHP terminalinin kayıtlarıyla da uyumlu) */
function parseState(raw: unknown): QuoteState | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<QuoteState> & { cart?: Partial<CartGazebo>[] };
  const base = emptyQuote();
  return {
    mode: d.mode === 0 ? 0 : 1,
    vat: d.vat === 1 ? 1 : 0,
    cart: (d.cart ?? [])
      .filter((c): c is CartGazebo => !!c?.size && Array.isArray(c.sides) && c.sides.length === 4)
      .map((c) => ({
        ...c,
        id: newId(),
        qty: Math.max(1, Math.min(99, c.qty || 1)),
        isk: c.isk ?? newIsk(),
        frame: c.frame && FRAMES[c.frame] ? c.frame : null,
        // Eski kayıtlardaki kenarlar (terminalin 12 duvar ürünü) modüler duvara çevrilir
        sides: c.sides.map(sideFrom),
      })),
    prod: d.prod && typeof d.prod === "object" ? d.prod : base.prod,
    prodIsk: d.prodIsk && typeof d.prodIsk === "object" ? d.prodIsk : base.prodIsk,
    isk: d.isk ?? base.isk,
    iskGrup: typeof d.iskGrup === "string" ? d.iskGrup : undefined,
    extra: Array.isArray(d.extra)
      ? d.extra
          .filter((x) => x && typeof x.ad === "string" && Number.isFinite(x.birim))
          .map((x) => ({ id: x.id || newId(), ad: x.ad, aciklama: x.aciklama ?? "", adet: Math.max(1, Math.min(999, x.adet || 1)), birim: x.birim, isk: x.isk ?? newIsk() }))
      : undefined,
  };
}

/**
 * Müşteri değişince iskonto grubu uygulanır: grubun fiyat listesi (toptan/perakende) ve genel iskontosu.
 * Grupsuz müşteriye geçilince önceki gruptan gelen iskonto kaldırılır; elle girilen iskontoya dokunulmaz.
 */
function withCustomer(q: QuoteState, c: QuoteCustomer | null): QuoteState {
  if (c?.grup) return { ...q, mode: c.grup.liste === "toptan" ? 0 : 1, isk: { tip: "yuzde", d: c.grup.oran }, iskGrup: c.grup.ad };
  return q.iskGrup ? { ...q, isk: newIsk(), iskGrup: undefined } : q;
}

/** catalog: veritabanındaki ürünler (Ürünler ekranı); initialCustomer: müşteri sayfasından "Teklif oluştur" ile gelindiyse */
export function Terminal({ catalog, initialCustomer, channels }: { catalog: Catalog; initialCustomer: QuoteCustomer | null; channels: { id: number; ad: string }[] }) {
  const { user } = useRole();
  const [q, setQ] = useState<QuoteState>(emptyQuote);
  const [draft, setDraft] = useState<Gazebo>(newDraft);
  const [gq, setGq] = useState(1);
  const [editing, setEditing] = useState<string | null>(null);
  const [customer, setCustomer] = useState<QuoteCustomer | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  /** Üst menüde seçili ürün grubu: "gazebo" (modüler), "hazir" (hazır gazebolar) ya da katalog grubu */
  const [tab, setTab] = useState("gazebo");
  // 3D görüntüleyiciden iki açıdan görüntü alma (teklife eklenen gazebonun PDF görselleri)
  const captureRef = useRef<CaptureViews | null>(null);
  const onCaptureReady = useCallback((fn: CaptureViews | null) => {
    captureRef.current = fn;
  }, []);

  // İlk açılış: "Terminalde aç" ile gelen teklif ya da kayıtlı sepet
  useEffect(() => {
    try {
      const opened = localStorage.getItem(OPEN_KEY);
      const raw = opened ?? localStorage.getItem(STORE_KEY);
      if (opened) localStorage.removeItem(OPEN_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      const state = parseState(saved?.q ?? saved);
      /* eslint-disable react-hooks/set-state-in-effect -- yalnızca ilk yüklemede tarayıcı kaydı okunur */
      if (initialCustomer) {
        // Müşteri sayfasından "Teklif oluştur": sepet korunur, müşteri ve iskonto grubu bu müşteri olur
        setQ(withCustomer(state ?? emptyQuote(), initialCustomer));
        setCustomer(initialCustomer);
      } else {
        if (state) setQ(state);
        if (saved?.customer) setCustomer(saved.customer);
        else if (saved?.musteri?.firma) setCustomer({ id: saved.musteri.id ?? null, firma: saved.musteri.firma, yetkili: saved.musteri.yetkili ?? "", telefon: saved.musteri.telefon ?? "", eposta: saved.musteri.eposta ?? "" });
      }
    } catch {}
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // yalnızca ilk açılışta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ q, customer }));
    } catch {}
  }, [q, customer, loaded]);

  const money = (n: number) => TL(q.vat ? n * 1.2 : n);
  const twin = !editing && q.cart.some((c) => cfgKey(c) === cfgKey(draft));
  const H = hesap(q, catalog);
  const pickCustomer = (c: QuoteCustomer | null) => {
    setCustomer(c);
    setQ((prev) => withCustomer(prev, c));
  };

  function addDraft() {
    let views: string[] | undefined;
    try {
      views = captureRef.current?.();
    } catch {}
    if (editing) {
      setQ({ ...q, cart: q.cart.map((c) => (c.id === editing ? { ...c, ...structuredClone(draft), qty: gq, views } : c)) });
      setEditing(null);
    } else if (twin) {
      setQ({ ...q, cart: q.cart.map((c) => (cfgKey(c) === cfgKey(draft) ? { ...c, qty: Math.min(99, c.qty + gq) } : c)) });
    } else {
      setQ({ ...q, cart: [...q.cart, { ...structuredClone(draft), id: newId(), qty: gq, isk: newIsk(), views }] });
    }
    setGq(1);
  }
  function editRow(id: string) {
    const c = q.cart.find((x) => x.id === id);
    if (!c) return;
    setDraft({ size: c.size, frame: c.frame, roofFab: c.roofFab, sides: structuredClone(c.sides), color: c.color ?? "#ffffff", wallColor: c.wallColor });
    setGq(c.qty);
    setEditing(id);
    setTab("gazebo");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function copyRow(id: string) {
    const c = q.cart.find((x) => x.id === id);
    if (c) setQ({ ...q, cart: [...q.cart, { ...structuredClone(c), id: newId() }] });
  }
  function clear() {
    if (!confirm("Teklifteki tüm gazebolar ve ürünler silinsin mi?")) return;
    setQ({ ...emptyQuote(), mode: q.mode, vat: q.vat });
    setCustomer(null);
    setEditing(null);
  }

  return (
    <div className="mx-auto max-w-[1400px] pb-24 lg:pb-0">
      <Link href="/panel/teklifler" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Teklifler
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Yeni teklif</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gazebo kurun, ürün ekleyin; teklif kaydedilir ve PDF olarak iner.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Segment value={q.mode} onChange={(mode) => setQ({ ...q, mode })} options={[[0, "Toptan"], [1, "Perakende"]]} warn={q.mode === 0} />
          <Segment value={q.vat} onChange={(vat) => setQ({ ...q, vat })} options={[[0, "KDV hariç"], [1, "KDV dahil"]]} />
        </div>
      </div>

      <div className="mt-5">
        <CustomerBar customer={customer} onChange={pickCustomer} />
      </div>

      {/* Ürün menüsü: modüler gazebo, hazır gazebolar ve diğer ürün grupları */}
      <nav className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar md:mx-0 md:px-0" aria-label="Ürünler">
        {[
          { id: "gazebo", label: "Modüler gazebo", count: q.cart.length },
          ...(READY_GAZEBOS.length ? [{ id: "hazir", label: "Hazır gazebolar", count: 0 }] : []),
          ...catalog.map((g) => ({ id: g.id, label: g.nav, count: g.items.filter((it) => !it.hidden && Object.keys(q.prod).some((k) => q.prod[k] > 0 && [it.id, it.id + OPT_SUFFIX].includes(splitKey(k).id))).length })),
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={cn(
              "flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors",
              tab === t.id ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count > 0 && <span className={cn("grid min-w-5 place-items-center rounded-full px-1 text-[11px]", tab === t.id ? "bg-white/20" : "bg-primary-soft text-primary")}>{t.count}</span>}
          </button>
        ))}
      </nav>

      <div className="mt-4 grid items-start gap-5 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-5">
          {tab === "gazebo" && (
            <GazeboCard
              draft={draft}
              setDraft={setDraft}
              qty={gq}
              setQty={setGq}
              mode={q.mode}
              money={money}
              editing={!!editing}
              twin={twin}
              onAdd={addDraft}
              onCaptureReady={onCaptureReady}
              onCancelEdit={() => {
                setEditing(null);
                setDraft(newDraft());
                setGq(1);
              }}
            />
          )}
          {tab === "hazir" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {READY_GAZEBOS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setDraft(structuredClone(r.gazebo));
                    setEditing(null);
                    setTab("gazebo");
                  }}
                  className="rounded-2xl border border-border bg-card p-4 text-left hover:border-primary"
                >
                  <p className="text-sm font-semibold">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.desc}</p>
                </button>
              ))}
            </div>
          )}
          {catalog.filter((g) => g.id === tab).map((g) => (
            <CatalogCard key={g.id} group={g} prod={q.prod} mode={q.mode} money={money} setProd={(id, n) => {
                const prod = { ...q.prod };
                if (n > 0) prod[id] = Math.min(999, n);
                else delete prod[id];
                setQ({ ...q, prod });
              }} />
          ))}
        </div>
        <aside className="lg:sticky lg:top-[92px]">
          <Summary q={q} setQ={setQ} catalog={catalog} money={money} editingId={editing} onEdit={editRow} onCopy={copyRow} onSave={() => setSaving(true)} onClear={clear} />
        </aside>
      </div>

      {/* Mobil sabit çubuk */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-[11px] text-muted-foreground">Genel toplam · KDV dahil</p>
            <p className="tabular text-lg font-bold">{TL(H.net * 1.2)}</p>
          </div>
          <Button size="lg" className="px-5" disabled={!H.rows.length} onClick={() => setSaving(true)}>
            <FileDown /> Kaydet
          </Button>
        </div>
      </div>

      <SaveSheet
        open={saving}
        onClose={() => setSaving(false)}
        q={q}
        catalog={catalog}
        channels={channels}
        user={user.user}
        customer={customer}
        onPickCustomer={pickCustomer}
        onSaved={() => {
          // Kaydedilen teklif Teklifler'de durur; ekran yeni teklif için sıfırlanır (fiyat tipi ve KDV tercihi korunur)
          setQ((prev) => ({ ...emptyQuote(), mode: prev.mode, vat: prev.vat }));
          setCustomer(null);
          setDraft(newDraft());
          setEditing(null);
          setGq(1);
        }}
      />
    </div>
  );
}

function Segment<T extends number>({ value, onChange, options, warn }: { value: T; onChange: (v: T) => void; options: [T, string][]; warn?: boolean }) {
  return (
    <div className={cn("inline-flex rounded-full bg-muted p-1", warn && "ring-2 ring-warning/40")}>
      {options.map(([v, l]) => (
        <button key={l} type="button" onClick={() => onChange(v)} aria-pressed={value === v} className={cn("h-9 rounded-full px-4 text-sm font-semibold transition-colors", value === v ? "bg-card shadow-card" : "text-muted-foreground")}>
          {l}
        </button>
      ))}
    </div>
  );
}
