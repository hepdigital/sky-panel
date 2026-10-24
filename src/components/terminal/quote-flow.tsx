"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, CircleCheck, CircleX, Copy, Eye, Mail, MessageCircle, PackageCheck, Send } from "lucide-react";
import Link from "next/link";
import { siparisOlustur } from "@/app/panel/siparisler/actions";
import { asamaDegistir, epostaGonder, gonderildi } from "@/app/panel/teklifler/[id]/actions";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PdfData } from "@/lib/terminal/calc";
import { pdfBase64 } from "@/lib/terminal/pdf";
import { formatDate } from "@/lib/utils";

export type Asama = "taslak" | "gonderildi" | "onaylandi" | "reddedildi" | "siparis";
export type QuoteFlowInfo = {
  asama: Asama;
  link: string | null;
  gonderim: string | null;
  ilkGorulme: string | null;
  sonGorulme: string | null;
  gorulmeSayisi: number;
  gecerlilik: string | null;
  yanitTarihi: string | null;
  yanitAd: string | null;
  yanitNot: string | null;
  telefon: string | null;
  eposta: string | null;
  mailReady: boolean;
  /** Teklif siparişe dönüştüyse siparişin kimliği */
  siparisId: number | null;
};

export const ASAMA: Record<Asama, { label: string; tone: BadgeTone }> = {
  taslak: { label: "Taslak", tone: "neutral" },
  gonderildi: { label: "Gönderildi", tone: "info" },
  onaylandi: { label: "Onaylandı", tone: "success" },
  reddedildi: { label: "Reddedildi", tone: "danger" },
  siparis: { label: "Siparişe dönüştü", tone: "success" },
};

const when = (iso: string) => formatDate(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** WhatsApp numarası: 0532… / 532… / +90 532… → 90532… */
function waNumber(tel: string | null) {
  const d = (tel ?? "").replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("5")) return `90${d}`;
  if (d.length === 11 && d.startsWith("0")) return `9${d}`;
  return d.length >= 11 ? d : "";
}

/** Teklifin durumu ve gönderimi: WhatsApp (link), e-posta (link + PDF), link kopyalama, elle onay/red */
export function QuoteFlow({ id, no, veri, flow, satisci }: { id: number; no: string; veri: PdfData; flow: QuoteFlowInfo; satisci: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [to, setTo] = useState(flow.eposta ?? "");
  const st = ASAMA[flow.asama];
  const ad = veri.yetkili || veri.musteri;
  const text = `Merhaba${ad ? ` ${ad}` : ""}, ${no} numaralı fiyat teklifimizi aşağıdaki bağlantıdan inceleyebilir, PDF olarak indirebilir ve onaylayabilirsiniz:\n${flow.link}\n\n${satisci} · ${veri.firma?.ad ?? "SKY Görsel Çözümler"}`;
  const run = (fn: () => Promise<{ ok: true } | { ok: false; hata: string }>, okText: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.hata });
      router.refresh();
    });

  return (
    <Card className="mt-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold">Durum</h2>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
        {flow.asama !== "siparis" && (
          <div className="flex flex-wrap gap-2">
            {flow.asama !== "onaylandi" && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => asamaDegistir(id, "onaylandi"), "Teklif onaylandı olarak işaretlendi.")}>
                <CircleCheck /> Onaylandı
              </Button>
            )}
            {flow.asama !== "reddedildi" && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => asamaDegistir(id, "reddedildi"), "Teklif reddedildi olarak işaretlendi.")}>
                <CircleX /> Reddedildi
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Onaylanan teklif → sipariş */}
      {flow.asama === "onaylandi" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-success-soft px-4 py-3">
          <p className="text-sm font-medium text-success">Teklif onaylandı. Kalemler ve tutarlar aynen siparişe aktarılır.</p>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await siparisOlustur(id);
                if (r.ok && r.id) router.push(`/panel/siparisler/${r.id}`);
                else setMsg({ ok: false, text: r.ok ? "Sipariş oluşturulamadı." : r.hata });
              })
            }
          >
            <PackageCheck /> Siparişe dönüştür
          </Button>
        </div>
      )}
      {flow.siparisId && (
        <Link href={`/panel/siparisler/${flow.siparisId}`} className={`${buttonVariants({ variant: "soft", size: "sm" })} mt-3`}>
          Siparişe git <ArrowRight />
        </Link>
      )}

      {/* Zaman çizelgesi */}
      <ul className="mt-3 space-y-1.5 text-sm">
        <Step done={!!flow.gonderim} text={flow.gonderim ? `Müşteriye gönderildi · ${when(flow.gonderim)}` : "Henüz gönderilmedi"} icon={Send} />
        <Step
          done={!!flow.ilkGorulme}
          text={flow.ilkGorulme ? `Müşteri görüntüledi · ${flow.gorulmeSayisi} kez, son ${when(flow.sonGorulme!)}` : "Müşteri henüz görüntülemedi"}
          icon={Eye}
        />
        {flow.yanitTarihi && (
          <Step
            done
            icon={flow.asama === "onaylandi" || flow.asama === "siparis" ? CircleCheck : MessageCircle}
            text={`${flow.asama === "onaylandi" || flow.asama === "siparis" ? "Müşteri kabul etti" : "Müşteri yanıt verdi"}${flow.yanitAd ? ` (${flow.yanitAd})` : ""} · ${when(flow.yanitTarihi)}${flow.yanitNot ? ` — “${flow.yanitNot}”` : ""}`}
          />
        )}
        {flow.gecerlilik && <li className="pl-7 text-xs text-muted-foreground">Geçerlilik: {formatDate(flow.gecerlilik, { day: "numeric", month: "long", year: "numeric" })}</li>}
      </ul>

      {/* Gönderim */}
      {flow.link && flow.asama !== "siparis" && (
        <div className="mt-4 grid gap-3 border-t border-border pt-4 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Müşteriye link gönder</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  window.open(`https://wa.me/${waNumber(flow.telefon)}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
                  run(() => gonderildi(id), "WhatsApp açıldı; teklif gönderildi olarak işaretlendi.");
                }}
              >
                <MessageCircle /> WhatsApp ile gönder
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard?.writeText(flow.link!).catch(() => {});
                  run(() => gonderildi(id), "Link kopyalandı.");
                }}
              >
                <Copy /> Linki kopyala
              </Button>
            </div>
            <p className="break-all text-[11px] text-muted-foreground">{flow.link}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">E-posta ile gönder (link + PDF eki)</p>
            <div className="flex gap-2">
              <input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="musteri@firma.com"
                className="h-9 min-w-0 flex-1 rounded-full border border-input bg-card px-3.5 text-sm outline-none focus:border-primary"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={pending || !to}
                title={flow.mailReady ? undefined : "SMTP ayarları yapılınca çalışır"}
                onClick={() =>
                  run(async () => epostaGonder(id, to, await pdfBase64(veri).catch(() => null)), "E-posta gönderildi.")
                }
              >
                <Mail /> Gönder
              </Button>
            </div>
            {!flow.mailReady && <p className="text-[11px] text-warning">E-posta ayarları (SMTP) henüz yapılmadı; ayarlanınca bu düğme çalışır.</p>}
          </div>
        </div>
      )}

      {msg && <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-medium ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{msg.text}</p>}
    </Card>
  );
}

function Step({ done, text, icon: Icon }: { done: boolean; text: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <li className={`flex items-start gap-2 ${done ? "" : "text-muted-foreground"}`}>
      <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${done ? "bg-success-soft text-success" : "bg-muted"}`}>
        {done ? <Check className="size-3" /> : <Icon className="size-3" />}
      </span>
      {text}
    </li>
  );
}
