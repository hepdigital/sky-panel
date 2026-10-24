"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, CreditCard, ExternalLink, FileText, Globe, ListPlus, Mail, MapPin, MessageSquare, Phone, Truck, User } from "lucide-react";
import { siteIslem } from "@/app/panel/siparisler/actions";
import { QuoteItems } from "@/components/terminal/quote-items";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PdfData } from "@/lib/terminal/calc";
import { cn, formatDate } from "@/lib/utils";
import type { SiteAction, SiteOrder, Vocabulary } from "@/server/sites";

type Props = {
  id: number;
  no: string;
  marka: string | null;
  site: { ad: string; tur: "gazebotente" | "woocommerce"; adres: string; sozluk: Vocabulary | null };
  disDurum: string | null;
  odemeYontemi: string | null;
  odemeDurumu: string | null;
  veri: PdfData;
  o: SiteOrder;
};

const when = (iso: string) => formatDate(iso, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const label = "mb-1 block text-xs font-semibold text-muted-foreground";
const input = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";

/** Siteden gelen sipariş: sitenin kendi durumları, ödeme, kargo, müşteri ve kalemler; işlemler siteye yazılır */
export function SiteOrderDetail({ id, no, marka, site, disDurum, odemeYontemi, odemeDurumu, veri, o }: Props) {
  const router = useRouter();
  const v = site.sozluk ?? { durumlar: [], odemeDurumlari: [], odemeYontemleri: [], kargolar: [] };
  const gt = site.tur === "gazebotente";
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bildir, setBildir] = useState(true);
  const [durumMesaj, setDurumMesaj] = useState("");
  const [kargo, setKargo] = useState({ firma: o.kargo.firma ?? "", takipNo: o.kargo.takipNo ?? "" });
  const [not, setNot] = useState({ mesaj: "", gorunur: false });
  const labelOf = (list: { key: string; label: string }[], key: string | null) => list.find((x) => x.key === key)?.label ?? key ?? "—";
  const run = (a: SiteAction, ok: string, after?: () => void) =>
    start(async () => {
      const r = await siteIslem(id, a);
      setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.hata });
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  const m = o.musteri;

  return (
    <div className="mx-auto max-w-[1100px]">
      <Link href="/panel/siparisler" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Siparişler
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight md:text-[28px]">
            {no}
            <Badge tone="info" dot={false}>
              <Globe className="size-3" /> {site.ad}
            </Badge>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {when(o.olusturma)}
            {marka ? ` · ${marka}` : ""} · son güncelleme {when(o.guncelleme)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/panel/gorevler?yeni=1&siparis=${id}`} className={buttonVariants({ variant: "outline" })}>
            <ListPlus /> Görev
          </Link>
          {o.linkler.yonetim && (
            <a href={o.linkler.yonetim} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}>
              <ExternalLink /> Sitede aç
            </a>
          )}
        </div>
      </div>

      {/* Durum ve ödeme */}
      <Card className="mt-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold">Sipariş durumu</h2>
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <input type="checkbox" checked={bildir} onChange={(e) => setBildir(e.target.checked)} className="size-4 accent-[var(--primary)]" />
            Değişiklikte müşteriye {gt ? "e-posta" : "not"} gönder
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {v.durumlar.map((d) => (
            <button
              key={d.key}
              type="button"
              disabled={pending || d.key === disDurum}
              onClick={() => run({ islem: "durum", durum: d.key, mesaj: durumMesaj || undefined, bildir }, `Durum “${d.label}” olarak siteye yazıldı.`, () => setDurumMesaj(""))}
              className={cn(
                "h-9 rounded-full border px-3.5 text-xs font-semibold transition-colors",
                d.key === disDurum ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
        <input value={durumMesaj} onChange={(e) => setDurumMesaj(e.target.value)} placeholder="Durumla birlikte müşteriye gidecek mesaj (isteğe bağlı)" className={cn(input, "mt-3")} />

        <div className="mt-4 grid gap-4 border-t border-border pt-4 md:grid-cols-2">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <CreditCard className="size-3.5" /> Ödeme
            </p>
            <p className="mt-1 text-sm font-semibold">{odemeYontemi || labelOf(v.odemeYontemleri, o.odemeYontemi)}</p>
            {o.odemeDetay && <p className="text-xs text-muted-foreground">{o.odemeDetay}</p>}
            {v.odemeDurumlari.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {v.odemeDurumlari.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    disabled={pending || p.key === odemeDurumu}
                    onClick={() => run({ islem: "odeme", odemeDurumu: p.key, bildir }, `Ödeme durumu “${p.label}” olarak siteye yazıldı.`)}
                    className={cn(
                      "h-8 rounded-full border px-3 text-xs font-semibold",
                      p.key === odemeDurumu ? (p.key === "odendi" ? "border-success bg-success text-white" : "border-primary bg-primary text-primary-foreground") : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">{odemeDurumu === "odendi" ? "Ödendi" : "Ödeme alınmadı"}</p>
            )}
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Truck className="size-3.5" /> Kargo
            </p>
            <div className="mt-1 grid grid-cols-[1fr_1fr] gap-2">
              {v.kargolar.length ? (
                <select value={kargo.firma} onChange={(e) => setKargo({ ...kargo, firma: e.target.value })} className={input}>
                  <option value="">Firma seçin…</option>
                  {v.kargolar.map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={kargo.firma} onChange={(e) => setKargo({ ...kargo, firma: e.target.value })} placeholder="Kargo firması" className={input} />
              )}
              <input value={kargo.takipNo} onChange={(e) => setKargo({ ...kargo, takipNo: e.target.value })} placeholder="Takip no" className={input} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={pending || !kargo.firma} onClick={() => run({ islem: "kargo", kargoFirma: kargo.firma, takipNo: kargo.takipNo, bildir }, "Kargo bilgisi siteye yazıldı.")}>
                Kargoyu kaydet
              </Button>
              {gt && (
                <Button size="sm" disabled={pending || !kargo.firma} onClick={() => run({ islem: "kargo", kargoFirma: kargo.firma, takipNo: kargo.takipNo, kargodaYap: true, bildir }, "Kargoya verildi; siteye yazıldı.")}>
                  <Truck /> Kaydet ve kargoya ver
                </Button>
              )}
            </div>
          </div>
        </div>
        {msg && <p className={cn("mt-3 rounded-xl px-3 py-2 text-xs font-medium", msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>{msg.text}</p>}
      </Card>

      {/* Müşteri */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">Müşteri</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row icon={User} value={m.ad} />
            {m.telefon && (
              <Row
                icon={Phone}
                value={
                  <a href={`tel:${m.telefon.replace(/[^\d+]/g, "")}`} className="hover:underline">
                    {m.telefon}
                  </a>
                }
              />
            )}
            {m.eposta && (
              <Row
                icon={Mail}
                value={
                  <a href={`mailto:${m.eposta}`} className="hover:underline">
                    {m.eposta}
                  </a>
                }
              />
            )}
            <Row icon={MapPin} value={[m.adres, m.ilce, m.il].filter(Boolean).join(", ")} />
          </dl>
          {o.teslimat && (
            <div className="mt-3 border-t border-border pt-3 text-sm">
              <p className={label}>Teslimat adresi</p>
              <p>{o.teslimat.ad}</p>
              <p className="text-muted-foreground">{[o.teslimat.adres, o.teslimat.ilce, o.teslimat.il].filter(Boolean).join(", ")}</p>
            </div>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">Fatura</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row icon={Building2} value={m.faturaTipi === "kurumsal" ? `Kurumsal${m.firma ? ` · ${m.firma}` : ""}` : "Bireysel"} />
            {(m.vergiDairesi || m.vergiNo) && <Row icon={FileText} value={[m.vergiDairesi, m.vergiNo].filter(Boolean).join(" · ")} />}
          </dl>
          {o.musteriNotu && (
            <div className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-sm">
              <p className="text-xs font-semibold text-warning">Müşteri notu</p>
              <p className="whitespace-pre-line">{o.musteriNotu}</p>
            </div>
          )}
          {o.linkler.musteri && (
            <a href={o.linkler.musteri} target="_blank" rel="noopener" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              Müşterinin sipariş sayfası <ExternalLink className="size-3" />
            </a>
          )}
        </Card>
      </div>

      {/* Kalemler */}
      <div className="mt-4">
        <QuoteItems v={veri} />
      </div>
      {o.kalemler.some((k) => k.link) && (
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {o.kalemler
            .filter((k) => k.link)
            .map((k, i) => (
              <a key={i} href={k.link} target="_blank" rel="noopener" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                {k.ad}: yapılandırmayı sitede aç <ExternalLink className="size-3" />
              </a>
            ))}
        </p>
      )}

      {/* Dosyalar */}
      {o.dosyalar.length > 0 && (
        <Card className="mt-4 p-5">
          <h2 className="text-[15px] font-semibold">Dosyalar</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {o.dosyalar.map((f, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <Badge tone={f.tur === "onay" ? "info" : "neutral"}>{f.tur === "onay" ? "Tasarım onayı" : "Müşteri dosyası"}</Badge>
                <span className="font-medium">{f.ad}</span>
                <span className="text-xs text-muted-foreground">
                  {Math.round(f.boyut / 1024)} KB · {when(f.tarih)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Dosyaları indirmek için siparişi sitede açın.</p>
        </Card>
      )}

      {/* Geçmiş + not */}
      <Card className="mt-4 p-5">
        <h2 className="text-[15px] font-semibold">Sipariş geçmişi</h2>
        <ul className="mt-3 space-y-2.5">
          {o.gecmis
            .slice()
            .reverse()
            .map((e, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", e.durum ? "bg-primary" : "bg-border")} />
                <div className="min-w-0">
                  <p>
                    {e.durum && <span className="font-semibold">{labelOf(v.durumlar, e.durum)} · </span>}
                    {e.mesaj}
                    {!e.gorunur && <Badge tone="neutral" className="ml-1.5">iç not</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {e.kim === "customer" ? "Müşteri" : e.kim === "system" ? "Sistem" : e.kimAd || "Yönetim"} · {when(e.tarih)}
                  </p>
                </div>
              </li>
            ))}
          {!o.gecmis.length && <li className="text-sm text-muted-foreground">Kayıt yok.</li>}
        </ul>
        <div className="mt-4 border-t border-border pt-4">
          <p className={label}>
            <MessageSquare className="mr-1 inline size-3.5" /> Siparişe not ekle (siteye yazılır)
          </p>
          <textarea rows={2} value={not.mesaj} onChange={(e) => setNot({ ...not, mesaj: e.target.value })} className={cn(input, "h-auto resize-none py-2")} />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <input type="checkbox" checked={not.gorunur} onChange={(e) => setNot({ ...not, gorunur: e.target.checked })} className="size-4 accent-[var(--primary)]" />
              Müşteri görsün
            </label>
            <Button size="sm" variant="outline" disabled={pending || !not.mesaj.trim()} onClick={() => run({ islem: "not", mesaj: not.mesaj, gorunur: not.gorunur }, "Not siteye eklendi.", () => setNot({ mesaj: "", gorunur: false }))}>
              Notu ekle
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Row({ icon: Icon, value }: { icon: React.ComponentType<{ className?: string }>; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <dd className="min-w-0 break-words">{value || "—"}</dd>
    </div>
  );
}
