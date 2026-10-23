"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Search } from "lucide-react";
import { musteriAra, teklifKaydet } from "@/app/panel/teklifler/actions";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { quoteData, type Catalog, type QuoteState } from "@/lib/terminal/calc";
import { downloadPdf } from "@/lib/terminal/pdf";
import { cn } from "@/lib/utils";

export type QuoteCustomer = {
  id: number | null;
  firma: string;
  yetkili: string;
  telefon: string;
  eposta: string;
  /** Kayıtlı müşterinin iskonto grubu */
  grup?: { ad: string; liste: "perakende" | "toptan"; oran: number } | null;
  /** Müşterinin son teklifindeki kanal (kayıtta hazır gelir) */
  kanalId?: number | null;
};
type Hit = Awaited<ReturnType<typeof musteriAra>>[number];

const input = "h-11 w-full rounded-xl border border-input bg-card px-4 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";
const label = "mb-1.5 block text-xs font-semibold text-muted-foreground";

/**
 * Teklifi kaydedip PDF'ini indirir. Numarayı sunucu verir; kayıt başarısızsa PDF üretilmez.
 * Müşteri adına yazarken kayıtlı müşteriler önerilir; seçilmezse yeni müşteri olarak kaydedilir.
 */
export function SaveSheet({
  open,
  onClose,
  q,
  catalog,
  channels,
  user,
  customer,
  onPickCustomer,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  q: QuoteState;
  catalog: Catalog;
  channels: { id: number; ad: string }[];
  user: string;
  customer: QuoteCustomer | null;
  /** Kayıtlı müşteri seçilince terminale bildirilir (iskonto grubu fiyatlara uygulanır) */
  onPickCustomer: (c: QuoteCustomer) => void;
  onSaved: (c: QuoteCustomer | null) => void;
}) {
  const [c, setC] = useState<QuoteCustomer>({ id: null, firma: "", yetkili: "", telefon: "", eposta: "" });
  const [hits, setHits] = useState<Hit[]>([]);
  const [gun, setGun] = useState(7);
  const [kanalId, setKanalId] = useState<number | null>(null);
  const [not, setNot] = useState("");
  const [hazirlayan, setHazirlayan] = useState(user);
  const [gorsel, setGorsel] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: number; no: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Pencere her açıldığında sepetteki müşteri ve kullanıcı ile başlar
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- yalnızca açılışta form başlangıç değerleri */
    setC(customer ?? { id: null, firma: "", yetkili: "", telefon: "", eposta: "" });
    setKanalId(customer?.kanalId && channels.some((k) => k.id === customer.kanalId) ? customer.kanalId : null);
    setHazirlayan(user);
    setErr(null);
    setDone(null);
    setHits([]);
    /* eslint-enable react-hooks/set-state-in-effect */
    // Yalnızca açılışta: kayıt sonrası müşteri güncellenince form (ve "kaydedildi" ekranı) başa sarılmasın
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const search = (v: string) => {
    clearTimeout(timer.current);
    if (v.trim().length < 2) return setHits([]);
    timer.current = setTimeout(() => musteriAra(v).then(setHits).catch(() => setHits([])), 200);
  };

  async function save() {
    if (!kanalId) return setErr("Müşterinin geldiği kanalı seçin.");
    if (!c.firma.trim() && !confirm("Müşteri adı boş. Müşterisiz kaydedilsin mi?")) return;
    setBusy(true);
    setErr(null);
    const data = quoteData(q, { musteri: c.firma, yetkili: c.yetkili, telefon: c.telefon, eposta: c.eposta, gun, hazirlayan, not, gorsel }, catalog);
    const musteri = c.firma.trim() ? c : null;
    const r = await teklifKaydet({ veri: data, durum: q, musteri, gun, kanalId }).catch(() => ({ ok: false as const, hata: "Sunucuya ulaşılamadı." }));
    if (!r.ok) {
      setBusy(false);
      return setErr(r.hata);
    }
    onSaved(musteri ? { ...musteri, id: r.musteriId } : null);
    setDone({ id: r.id, no: r.no });
    try {
      await downloadPdf({ ...data, no: r.no, dosyaAdi: r.dosyaAdi });
    } catch (e) {
      setErr(`${r.no} kaydedildi ama PDF oluşturulamadı (${e instanceof Error ? e.message : e}). Teklif sayfasından indirebilirsiniz.`);
    }
    setBusy(false);
  }

  return (
    <Sheet open={open} onClose={onClose} title={done ? "Teklif kaydedildi" : "Teklifi kaydet"} className="md:max-w-xl">
      {done ? (
        <div className="text-center">
          <CheckCircle2 className="mx-auto size-12 text-success" />
          <p className="mt-2 text-lg font-bold">{done.no}</p>
          <p className="text-sm text-muted-foreground">PDF indirildi.</p>
          {err && <p className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-xs font-medium text-warning">{err}</p>}
          <div className="mt-5 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Yeni teklif
            </Button>
            <Link href={`/panel/teklifler/${done.id}`} className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">
              Teklifi aç
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <span className={label}>Müşteri / firma</span>
            <label className="flex h-11 items-center gap-2.5 rounded-xl border border-input bg-card px-4 text-sm focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
              <Search className="size-4 text-muted-foreground" />
              <input
                value={c.firma}
                onChange={(e) => {
                  setC({ ...c, firma: e.target.value, id: null });
                  search(e.target.value);
                }}
                onBlur={() => setTimeout(() => setHits([]), 150)}
                placeholder="Yazmaya başlayın — kayıtlı müşteriler listelenir"
                className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
              />
              {c.id && <span className="shrink-0 text-[11px] font-semibold text-success">Kayıtlı{c.grup ? ` · ${c.grup.ad}` : ""}</span>}
            </label>
            {hits.length > 0 && (
              <ul className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-pop">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        const picked = { id: h.id, firma: h.firma, yetkili: h.yetkili ?? "", telefon: h.telefon ?? "", eposta: h.eposta ?? "", grup: h.grup, kanalId: h.kanalId };
                        setC(picked);
                        if (h.kanalId && channels.some((k) => k.id === h.kanalId)) setKanalId(h.kanalId);
                        onPickCustomer(picked);
                        setHits([]);
                      }}
                      className="w-full rounded-lg p-2 text-left hover:bg-muted/70"
                    >
                      <span className="block text-sm font-semibold">{h.firma}</span>
                      <span className="block text-[11px] text-muted-foreground">{[h.yetkili, h.telefon].filter(Boolean).join(" · ") || "—"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["yetkili", "Yetkili"],
                ["telefon", "Telefon"],
                ["eposta", "E-posta"],
              ] as const
            ).map(([k, l]) => (
              <label key={k}>
                <span className={label}>{l}</span>
                <input value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} className={input} placeholder="opsiyonel" />
              </label>
            ))}
          </div>
          <label className="block">
            <span className={label}>Kanal · müşteri nereden geldi?</span>
            <select
              value={kanalId ?? ""}
              onChange={(e) => {
                setKanalId(Number(e.target.value) || null);
                setErr(null);
              }}
              className={cn(input, "appearance-auto", !kanalId && "text-muted-foreground")}
            >
              <option value="">Seçin…</option>
              {channels.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ad}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label>
              <span className={label}>Hazırlayan</span>
              <input value={hazirlayan} onChange={(e) => setHazirlayan(e.target.value)} className={input} />
            </label>
            <div>
              <span className={label}>Geçerlilik</span>
              <div className="inline-flex h-11 items-center rounded-full bg-muted p-1">
                {[7, 15, 30].map((d) => (
                  <button key={d} type="button" onClick={() => setGun(d)} className={cn("h-9 rounded-full px-3.5 text-xs font-semibold", gun === d ? "bg-card shadow-card" : "text-muted-foreground")}>
                    {d} gün
                  </button>
                ))}
              </div>
            </div>
          </div>
          <label className="block">
            <span className={label}>Teklif notu</span>
            <textarea
              rows={3}
              value={not}
              onChange={(e) => setNot(e.target.value)}
              placeholder="Teslim süresi, nakliye, montaj… Her satır ayrı madde olur."
              className="w-full resize-none rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            />
          </label>
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={gorsel} onChange={(e) => setGorsel(e.target.checked)} className="size-4 accent-[var(--primary)]" />
            Ürün ve duvar görsellerini PDF&apos;e ekle
          </label>
          {err && <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{err}</p>}
          <Button size="lg" className="w-full" disabled={busy} onClick={save}>
            {busy ? "Kaydediliyor…" : "Kaydet ve PDF indir"}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
