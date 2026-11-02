"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, CreditCard, ExternalLink, MessageCircle, XCircle } from "lucide-react";
import { odemeLinkiIptal, odemeLinkiOlustur, taksitTablosu } from "@/app/panel/odeme-linkleri/actions";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatDate, formatTRY } from "@/lib/utils";

type Site = { id: number; ad: string; marka: string };
type LinkRow = {
  id: number; no: string; musteri: string; telefon: string; aciklama: string | null; tutar: number; komisyon: number; toplam: number;
  link: string; site: string | null; satisci: string | null; siparisId: number | null; durum: "bekliyor" | "odendi" | "iptal"; olusturma: string;
};

const DURUM: Record<LinkRow["durum"], { label: string; tone: BadgeTone }> = {
  bekliyor: { label: "Ödeme bekleniyor", tone: "warning" },
  odendi: { label: "Ödendi", tone: "success" },
  iptal: { label: "İptal", tone: "neutral" },
};

const inputCls = "h-11 w-full rounded-xl border border-input bg-card px-3.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";

/** WhatsApp'ta gönderilecek hazır mesaj (numara 90 ile) */
const whatsapp = (telefon: string, musteri: string, toplam: number, link: string) =>
  `https://wa.me/90${telefon.replace(/\D/g, "").replace(/^0/, "")}?text=${encodeURIComponent(
    `Merhaba ${musteri}, ${formatTRY(toplam)} tutarındaki ödemenizi kredi kartına taksitle aşağıdaki linkten yapabilirsiniz:\n${link}`,
  )}`;

export function PaymentLinks({
  sites,
  rows,
  komisyonOrani,
  initial,
}: {
  sites: Site[];
  rows: LinkRow[];
  komisyonOrani: number;
  initial: { musteri: string; telefon: string; eposta: string; adres: string; il: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [siteId, setSiteId] = useState(sites[0]?.id ?? 0);
  const [tutar, setTutar] = useState("");
  const [komisyon, setKomisyon] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<{ link: string; no: string; toplam: number; musteri: string; telefon: string } | null>(null);
  const amount = Number(tutar.replace(/\./g, "").replace(",", ".")) || 0;
  const total = Math.round(amount * (1 + (komisyon ? komisyonOrani : 0) / 100) * 100) / 100;

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="pt-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Ödeme linkleri</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tutarı girin, müşteriye link gönderin: sitedeki kart formunda taksit seçerek öder, ödeme sipariş olarak düşer.</p>
      </div>

      <div className="mt-5 grid items-start gap-4 lg:grid-cols-[400px_1fr]">
        <Card className="p-4 md:p-5">
          {made ? (
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-success">
                <Check className="size-4" /> Link hazır · sipariş {made.no}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {made.musteri} · {formatTRY(made.toplam)}
              </p>
              <LinkActions link={made.link} telefon={made.telefon} musteri={made.musteri} toplam={made.toplam} big />
              <Button variant="outline" className="mt-4 w-full" onClick={() => setMade(null)}>
                Yeni link
              </Button>
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setErr(null);
                start(async () => {
                  const r = await odemeLinkiOlustur({
                    siteId,
                    musteri: String(f.get("musteri") ?? ""),
                    telefon: String(f.get("telefon") ?? ""),
                    eposta: String(f.get("eposta") ?? ""),
                    adres: String(f.get("adres") ?? ""),
                    il: String(f.get("il") ?? ""),
                    aciklama: String(f.get("aciklama") ?? ""),
                    tutar: amount,
                    komisyon,
                  });
                  if (!r.ok) return setErr(r.hata);
                  setMade({ link: r.link, no: r.no, toplam: r.toplam, musteri: String(f.get("musteri")), telefon: String(f.get("telefon")) });
                  setTutar("");
                  setKomisyon(false);
                  router.refresh();
                });
              }}
            >
              {sites.length > 1 && (
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">Site</span>
                  <select value={siteId} onChange={(e) => setSiteId(Number(e.target.value))} className={inputCls}>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.ad} ({s.marka})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">Müşteri adı soyadı / firma</span>
                <input name="musteri" required defaultValue={initial.musteri} className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">Telefon</span>
                <input name="telefon" required inputMode="tel" placeholder="0532 123 45 67" defaultValue={initial.telefon} className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">E-posta (isteğe bağlı, makbuz için)</span>
                <input name="eposta" type="email" defaultValue={initial.eposta} className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">Adres (iyzico ödeme ekranı ister)</span>
                <textarea name="adres" required minLength={5} rows={2} placeholder="Mahalle, sokak, no, ilçe" defaultValue={initial.adres} className={cn(inputCls, "h-auto resize-none py-2.5")} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">İl</span>
                <input name="il" required defaultValue={initial.il} className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">Açıklama (müşteri görür)</span>
                <input name="aciklama" maxLength={200} placeholder="ör. 3x6 gazebo + 2 duvar" className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">Tutar (KDV dahil, ₺)</span>
                <input value={tutar} onChange={(e) => setTutar(e.target.value)} required inputMode="decimal" placeholder="0" className={cn(inputCls, "tabular text-base font-bold")} />
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border px-3.5 py-2.5 text-sm">
                <input type="checkbox" checked={komisyon} onChange={(e) => setKomisyon(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
                <span className="flex-1">Kart komisyonu ekle (%{komisyonOrani})</span>
                {komisyon && amount > 0 && <span className="tabular text-xs text-muted-foreground">+{formatTRY(total - amount)}</span>}
              </label>
              <div className="flex items-baseline justify-between rounded-xl bg-muted/60 px-3.5 py-3">
                <span className="text-sm font-semibold">Müşterinin ödeyeceği</span>
                <span className="tabular text-lg font-bold">{formatTRY(total)}</span>
              </div>
              <InstallmentTable siteId={siteId} tutar={total} />
              <p className="text-xs text-muted-foreground">Taksit farkı ödeme ekranında iyzico tarafından müşteriye ayrıca yansıtılır.</p>
              {err && <p className="text-sm text-danger">{err}</p>}
              <Button type="submit" size="lg" className="w-full" disabled={pending || !sites.length || amount <= 0}>
                <CreditCard /> {pending ? "Oluşturuluyor…" : "Ödeme linki oluştur"}
              </Button>
              {!sites.length && <p className="text-xs text-danger">Markanıza bağlı bir WooCommerce sitesi yok.</p>}
            </form>
          )}
        </Card>

        <Card className="overflow-hidden">
          <p className="border-b border-border px-4 py-3 text-sm font-bold md:px-5">Son linkler</p>
          {!rows.length ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">Henüz link oluşturulmadı.</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <Row key={r.id} r={r} />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ r }: { r: LinkRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const d = DURUM[r.durum];
  return (
    <li className="px-4 py-3 md:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{r.musteri}</p>
          <p className="truncate text-xs text-muted-foreground">
            {r.telefon} · sipariş {r.no}
            {r.site ? ` · ${r.site}` : ""} · {r.satisci ?? "—"} · {formatDate(r.olusturma, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </p>
          {r.aciklama && <p className="mt-0.5 truncate text-xs">{r.aciklama}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular text-sm font-bold">{formatTRY(r.toplam)}</p>
          {r.komisyon > 0 && <p className="tabular text-[11px] text-muted-foreground">{formatTRY(r.tutar)} + %{r.komisyon}</p>}
          <Badge tone={d.tone}>{d.label}</Badge>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {r.durum === "bekliyor" && (
          <>
            <LinkActions link={r.link} telefon={r.telefon} musteri={r.musteri} toplam={r.toplam} />
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirm("Link iptal edilsin mi? Sitedeki sipariş de iptal edilir.")) return;
                start(async () => {
                  setErr(null);
                  const x = await odemeLinkiIptal(r.id);
                  if (!x.ok) setErr(x.hata);
                  router.refresh();
                });
              }}
              className="inline-flex h-8 items-center gap-1 px-2 text-xs font-semibold text-muted-foreground hover:text-danger disabled:opacity-50"
            >
              <XCircle className="size-3.5" /> İptal
            </button>
          </>
        )}
        {r.siparisId && (
          <Link href={`/panel/siparisler/${r.siparisId}`} className="text-xs font-semibold text-primary hover:underline">
            Siparişi aç
          </Link>
        )}
        {err && <span className="text-xs text-danger">{err}</span>}
      </div>
    </li>
  );
}

function LinkActions({ link, telefon, musteri, toplam, big }: { link: string; telefon: string; musteri: string; toplam: number; big?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", big && "mt-3")}>
      {big && <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className={cn(inputCls, "mb-1.5 h-10 text-xs")} />}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          navigator.clipboard.writeText(link).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? <Check /> : <Copy />} {copied ? "Kopyalandı" : "Linki kopyala"}
      </Button>
      <a href={whatsapp(telefon, musteri, toplam, link)} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#25D366] px-3 text-xs font-semibold text-white hover:opacity-90">
        <MessageCircle className="size-4" /> WhatsApp ile gönder
      </a>
      <a href={link} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ExternalLink className="size-3.5" /> Aç
      </a>
    </div>
  );
}

type Tablo = { tutar: number; aileler: { aile: string; banka: string; taksitler: { n: number; aylik: number; toplam: number }[] }[] };

/** Aynı taksit tutarlarına sahip kart aileleri tek sütunda (çoğu zaman hepsi aynıdır) */
function groupFamilies(t: Tablo) {
  const groups: { aileler: string[]; taksitler: Tablo["aileler"][number]["taksitler"] }[] = [];
  for (const a of t.aileler) {
    const key = JSON.stringify(a.taksitler);
    const g = groups.find((x) => JSON.stringify(x.taksitler) === key);
    if (g) g.aileler.push(a.aile);
    else groups.push({ aileler: [a.aile], taksitler: a.taksitler });
  }
  return groups;
}

const taksitText = (tutar: number, taksitler: { n: number; aylik: number; toplam: number }[]) =>
  [
    `Kredi kartına taksit seçenekleri (${formatTRY(tutar)}):`,
    ...taksitler.map((x) => (x.n === 1 ? `Peşin: ${formatTRY(x.toplam)}` : `${x.n} taksit: ${x.n} × ${formatTRY(x.aylik)} = ${formatTRY(x.toplam)}`)),
  ].join("\n");

/** Girilen tutarın iyzico taksit tablosu: satışçı müşteriye ön bilgi verir (tutar yazıldıkça yenilenir) */
export function InstallmentTable({ siteId, tutar }: { siteId: number; tutar: number }) {
  const [state, setState] = useState<{ key: string; tablo?: Tablo; hata?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const key = `${siteId}:${tutar.toFixed(2)}`;
  useEffect(() => {
    if (!siteId || tutar < 1) return;
    let live = true;
    const t = setTimeout(() => {
      taksitTablosu(siteId, tutar).then((r) => live && setState(r.ok ? { key, tablo: r.tablo } : { key, hata: r.hata }));
    }, 600);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key, siteId, tutar]);
  if (tutar < 1) return null;
  const cur = state?.key === key ? state : null;
  if (!cur) return <p className="text-xs text-muted-foreground">Taksit seçenekleri hesaplanıyor…</p>;
  if (cur.hata || !cur.tablo) return <p className="text-xs text-muted-foreground">{cur.hata ?? "Taksit bilgisi alınamadı."}</p>;
  const groups = groupFamilies(cur.tablo);
  const counts = [...new Set(groups.flatMap((g) => g.taksitler.map((x) => x.n)))].sort((a, b) => a - b);
  return (
    <div className="rounded-xl border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-bold">Taksit seçenekleri</span>
        <button
          type="button"
          onClick={() =>
            navigator.clipboard.writeText(taksitText(tutar, groups[0]?.taksitler ?? [])).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Kopyalandı" : "Müşteriye metin olarak kopyala"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          {groups.length > 1 && (
            <thead>
              <tr className="text-muted-foreground">
                <th />
                {groups.map((g) => (
                  <th key={g.aileler.join()} className="px-3 py-1.5 text-right font-semibold">
                    {g.aileler.join(", ")}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="divide-y divide-border">
            {counts.map((n) => (
              <tr key={n}>
                <td className="px-3 py-1.5 font-semibold whitespace-nowrap">{n === 1 ? "Peşin" : `${n} taksit`}</td>
                {groups.map((g) => {
                  const x = g.taksitler.find((y) => y.n === n);
                  return (
                    <td key={g.aileler.join()} className="tabular px-3 py-1.5 text-right whitespace-nowrap">
                      {x ? (
                        <>
                          {n > 1 && <span className="text-muted-foreground">{n} × {formatTRY(x.aylik)} = </span>}
                          <span className="font-semibold">{formatTRY(x.toplam)}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {groups.length === 1 && <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">Tüm kartlarda aynı: {groups[0].aileler.join(", ")}</p>}
    </div>
  );
}
