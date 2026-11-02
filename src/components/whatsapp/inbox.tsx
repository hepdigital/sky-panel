"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bot, Clock, Lock, MessageCircle, Package, Send, Settings2, UserCheck, X } from "lucide-react";
import { waAsistanaBirak, waDevral, waGonder, waKapat } from "@/app/panel/whatsapp/actions";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { aiPara } from "@/lib/para";
import { cn, formatTRY } from "@/lib/utils";
import { MessageBubble, timeText, type Bubble } from "./bubbles";

type Durum = "asistan" | "ekip" | "kapali";
type Kaynak = "reklam" | "site" | "dogrudan";

export type ChatRow = {
  id: number;
  telefon: string;
  ad: string | null;
  durum: Durum;
  kaynak: Kaynak;
  okunmamis: number;
  sonMesaj: string;
  sonMusteriMesaji: string | null;
  ilgilenen: string | null;
  son: string | null;
};

export type ChatDetail = {
  id: number;
  telefon: string;
  ad: string | null;
  durum: Durum;
  kaynak: Kaynak;
  reklamId: string | null;
  ctwaClid: string | null;
  urunKodu: string | null;
  ozet: string | null;
  aiMaliyet: { usd: number; cagri: number } | null;
  ilgilenen: string | null;
  pencereAcik: boolean;
  sonMusteriMesaji: string | null;
  olusturma: string;
  musteri: { id: number; firma: string; yetkili: string | null; il: string | null; siparisler: { id: number; no: string; durum: string; dahil: number; tarih: string }[] } | null;
  talep: { ad: string | null; il: string | null; urun: string | null; adet: number | null; renk: string | null; not: string | null; aranmaZamani: string | null; durum: string } | null;
  mesajlar: Bubble[];
};

/** Asistan çalışmıyorsa "asistan" durumundaki sohbet kimseye atanmamış demektir */
const durumOf = (d: Durum, asistan: boolean): { label: string; tone: BadgeTone } =>
  d === "asistan" ? { label: asistan ? "Asistanda" : "Atanmadı", tone: "warning" } : d === "ekip" ? { label: "Ekipte", tone: "info" } : { label: "Kapalı", tone: "neutral" };
const KAYNAK: Record<Kaynak, string> = { reklam: "Reklam", site: "Site", dogrudan: "Doğrudan" };
const SIPARIS: Record<string, string> = { alindi: "Alındı", uretimde: "Üretimde", hazir: "Hazır", kargoda: "Kargoda", teslim: "Teslim edildi", iptal: "İptal" };
const TALEP: Record<string, string> = { yeni: "Yeni", arandi: "Arandı", teklif: "Teklif verildi", kazanildi: "Satışa döndü", kaybedildi: "Olumsuz" };
const filtreler = (asistan: boolean): { key: Durum | null; label: string }[] => [
  { key: null, label: "Açık" },
  { key: "asistan", label: asistan ? "Asistanda" : "Atanmadı" },
  { key: "ekip", label: "Ekipte" },
  { key: "kapali", label: "Kapalı" },
];
const WINDOW_MS = 24 * 3600_000;
const MAX_TEXT = 4096;

/** 905321234567 → +90 532 123 45 67 */
const phoneText = (t: string) => (/^90\d{10}$/.test(t) ? `+90 ${t.slice(2, 5)} ${t.slice(5, 8)} ${t.slice(8, 10)} ${t.slice(10)}` : `+${t}`);
function windowLeft(son: string | null) {
  if (!son) return null;
  const ms = new Date(son).getTime() + WINDOW_MS - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return h ? `${h} sa ${m} dk` : `${m} dk`;
}

/** WhatsApp gelen kutusu: sohbetler, mesajlar, devral/asistana bırak/kapat, panelden cevap ve müşteri kartı */
export function Inbox({
  chats, chat, durum, asistan, butceDoldu, yonetici, maliyet,
}: {
  chats: ChatRow[];
  chat: ChatDetail | null;
  durum: Durum | null;
  asistan: boolean;
  butceDoldu: boolean;
  yonetici: boolean;
  maliyet: { bugun: number; ay: number; ortalama: number; kur: number | null };
}) {
  const router = useRouter();

  // Yeni mesajlar için sayfa açık ve görünürken 20 saniyede bir yenilenir
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 20_000);
    return () => clearInterval(t);
  }, [router]);

  const href = (s: number | null, d: Durum | null = durum) => {
    const q = new URLSearchParams();
    if (d) q.set("durum", d);
    if (s) q.set("s", String(s));
    const qs = q.toString();
    return `/panel/whatsapp${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">WhatsApp</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Müşteri mesajları. Ekibin telefondan yazdıkları da burada görünür.{" "}
            <span className={cn("font-semibold", asistan ? "text-success" : butceDoldu ? "text-danger" : "text-muted-foreground")}>
              {asistan ? "Asistan şu an cevaplıyor." : butceDoldu ? "Günlük AI bütçesi doldu; asistan yarın devam eder." : "Asistan şu an kapalı."}
            </span>
          </p>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            AI maliyeti: Bugün {aiPara(maliyet.bugun, maliyet.kur)} · Bu ay {aiPara(maliyet.ay, maliyet.kur)} · Sohbet başı ort. {aiPara(maliyet.ortalama, maliyet.kur)}
          </p>
          {yonetici && (
            <p className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
              <Link href="/panel/whatsapp/asistan" className="inline-flex items-center gap-1 text-primary hover:underline">
                <Settings2 className="size-3.5" /> Asistan ayarları ve deneme
              </Link>
              <Link href="/panel/whatsapp/urunler" className="inline-flex items-center gap-1 text-primary hover:underline">
                <Package className="size-3.5" /> Ürün kartları
              </Link>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {filtreler(asistan).map((f) => (
            <Link
              key={f.label}
              href={href(chat?.id ?? null, f.key)}
              className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", durum === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted")}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_280px]">
        <Card className={cn("overflow-hidden p-0", chat && "hidden lg:block")}>
          <ul className="max-h-[calc(100dvh-220px)] divide-y divide-border overflow-y-auto">
            {chats.map((c) => (
              <li key={c.id}>
                <Link href={href(c.id)} className={cn("flex gap-3 px-4 py-3 hover:bg-muted/50", chat?.id === c.id && "bg-muted")}>
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                    <MessageCircle className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", c.okunmamis ? "font-bold" : "font-semibold")}>{c.ad || phoneText(c.telefon)}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{timeText(c.sonMesaj)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">{c.son ?? ""}</span>
                      {c.okunmamis > 0 && <span className="rounded-full bg-success px-1.5 text-[10px] font-bold leading-4 text-white">{c.okunmamis}</span>}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      <Badge tone={durumOf(c.durum, asistan).tone}>{durumOf(c.durum, asistan).label}</Badge>
                      {c.kaynak !== "dogrudan" && <Badge dot={false}>{KAYNAK[c.kaynak]}</Badge>}
                      {c.ilgilenen && <Badge dot={false}>{c.ilgilenen}</Badge>}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
            {!chats.length && <li className="p-10 text-center text-sm text-muted-foreground">Sohbet yok.</li>}
          </ul>
        </Card>

        {chat ? (
          <>
            <Conversation key={chat.id} chat={chat} back={href(null)} asistan={asistan} />
            <CustomerCard chat={chat} kur={maliyet.kur} />
          </>
        ) : (
          <Card className="hidden items-center justify-center p-10 text-sm text-muted-foreground lg:flex">Soldan bir sohbet seçin.</Card>
        )}
      </div>
    </div>
  );
}

function Conversation({ chat, back, asistan }: { chat: ChatDetail; back: string; asistan: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const left = windowLeft(chat.sonMusteriMesaji);
  const open = chat.pencereAcik && !!left;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [chat.mesajlar.length]);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; hata: string }>, after?: () => void) =>
    start(async () => {
      setErr(null);
      const r = await fn();
      if (!r.ok) return setErr(r.hata);
      after?.();
      router.refresh();
    });

  const send = () => text.trim() && run(() => waGonder(chat.id, text), () => setText(""));

  return (
    <Card className="flex max-h-[calc(100dvh-220px)] min-h-[60vh] flex-col overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Link href={back} className="lg:hidden" aria-label="Sohbetler">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold">{chat.ad || phoneText(chat.telefon)}</p>
          <p className="text-xs text-muted-foreground">
            {phoneText(chat.telefon)} · {durumOf(chat.durum, asistan).label}
            {chat.ilgilenen ? ` · ${chat.ilgilenen}` : ""}
          </p>
        </div>
        <span className={cn("flex items-center gap-1 text-xs font-semibold", open ? "text-success" : "text-danger")}>
          <Clock className="size-3.5" /> {open ? `Pencere: ${left}` : "Pencere kapalı"}
        </span>
        {chat.durum !== "ekip" && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => waDevral(chat.id))}>
            <UserCheck /> Devral
          </Button>
        )}
        {chat.durum === "ekip" && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => waAsistanaBirak(chat.id))} title="Müşteri yeniden yazınca asistan cevaplar">
            <Bot /> Asistana bırak
          </Button>
        )}
        {chat.durum !== "kapali" && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => waKapat(chat.id))}>
            <X /> Kapat
          </Button>
        )}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto bg-muted/30 px-4 py-4">
        {chat.mesajlar.map((m) => (
          <MessageBubble key={m.id} m={m} />
        ))}
        <div ref={end} />
      </div>

      <div className="border-t border-border p-3">
        {err && <p className="mb-2 text-xs text-danger">{err}</p>}
        {open ? (
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder="Mesaj yazın (Enter gönderir, Shift+Enter yeni satır)"
              className="min-h-11 w-full resize-none rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            />
            <Button disabled={pending || !text.trim()} onClick={send} aria-label="Gönder">
              <Send /> Gönder
            </Button>
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-xl bg-muted px-3.5 py-3 text-xs text-muted-foreground">
            <Lock className="size-4 shrink-0" /> Müşterinin son mesajından bu yana 24 saat geçti. WhatsApp kuralı gereği serbest mesaj gönderilemez; müşteri yeniden yazınca kutu açılır.
          </p>
        )}
      </div>
    </Card>
  );
}

function CustomerCard({ chat, kur }: { chat: ChatDetail; kur: number | null }) {
  const m = chat.musteri;
  return (
    <Card className="hidden h-fit space-y-4 p-4 text-sm xl:block">
      <div>
        <p className="text-xs font-semibold text-muted-foreground">Kişi</p>
        <p className="font-semibold">{chat.ad || "—"}</p>
        <p className="text-muted-foreground">{phoneText(chat.telefon)}</p>
        <p className="mt-1 text-xs text-muted-foreground">İlk mesaj: {timeText(chat.olusturma)}</p>
      </div>
      {chat.ozet && (
        <div className="rounded-xl bg-warning-soft p-3">
          <p className="text-xs font-semibold">Asistanın devretme notu</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-xs">{chat.ozet}</p>
        </div>
      )}
      {chat.talep && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground">
            Talep ·{" "}
            <Link href="/panel/talepler" className="text-primary hover:underline">
              {TALEP[chat.talep.durum] ?? chat.talep.durum}
            </Link>
          </p>
          <dl className="mt-1 space-y-0.5 text-xs">
            {(
              [
                ["Ad", chat.talep.ad],
                ["İl", chat.talep.il],
                ["Ürün", chat.talep.urun],
                ["Adet", chat.talep.adet],
                ["Renk", chat.talep.renk],
                ["Aranma", chat.talep.aranmaZamani],
                ["Not", chat.talep.not],
              ] as const
            )
              .filter(([, v]) => v !== null && v !== "")
              .map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="w-14 shrink-0 text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 whitespace-pre-wrap break-words">{v}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}
      <div>
        <p className="text-xs font-semibold text-muted-foreground">Kaynak</p>
        <p>{KAYNAK[chat.kaynak]}</p>
        {chat.reklamId && <p className="break-all text-xs text-muted-foreground">Reklam: {chat.reklamId}</p>}
        {chat.urunKodu && <p className="break-all text-xs text-muted-foreground">Ürün: {chat.urunKodu}</p>}
      </div>
      {chat.aiMaliyet && chat.aiMaliyet.cagri > 0 && (
        <p className="text-xs">
          <span className="font-semibold text-muted-foreground">AI maliyeti:</span> {aiPara(chat.aiMaliyet.usd, kur)} ({chat.aiMaliyet.cagri} çağrı)
        </p>
      )}
      <div>
        <p className="text-xs font-semibold text-muted-foreground">Müşteri kaydı</p>
        {m ? (
          <>
            <Link href={`/panel/musteriler/${m.id}`} className="font-semibold text-primary hover:underline">
              {m.firma}
            </Link>
            {(m.yetkili || m.il) && <p className="text-xs text-muted-foreground">{[m.yetkili, m.il].filter(Boolean).join(" · ")}</p>}
            {m.siparisler.length > 0 && (
              <ul className="mt-2 space-y-1">
                {m.siparisler.map((o) => (
                  <li key={o.id}>
                    <Link href={`/panel/siparisler/${o.id}`} className="flex justify-between gap-2 text-xs hover:underline">
                      <span>
                        {o.no} · {SIPARIS[o.durum] ?? o.durum}
                      </span>
                      <span className="tabular">{formatTRY(o.dahil, { whole: true })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Bu telefonla eşleşen müşteri yok.</p>
        )}
      </div>
    </Card>
  );
}
