import { Bot, Check, CheckCheck, Clock, Coins, Wrench } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

export type Bubble = {
  id: number;
  yon: "gelen" | "asistan" | "ekip";
  tur: string;
  metin: string | null;
  medyaYol: string | null;
  durum?: string | null;
  tarih: string;
  yazan?: string | null;
};

const TUR: Record<string, string> = { image: "Görsel", video: "Video", audio: "Sesli mesaj", document: "Belge", sticker: "Çıkartma", location: "Konum", contacts: "Kişi", reaction: "Tepki", unsupported: "Desteklenmeyen mesaj" };

export const timeText = (iso: string) => formatDate(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Görsel adresi yalnızca bilinen kalıplardan kurulur: müşterinin görseli oturumlu adresten (whatsapp/<ad>),
 * asistanın gönderdiği ürün görseli ve kartela panelin herkese açık /jpg dönüştürücüsünden.
 */
export function mediaUrl(yol: string | null) {
  const ad = yol?.match(/^whatsapp\/([a-z0-9]+\.(?:jpg|png|webp))$/)?.[1];
  if (ad) return `/panel/whatsapp/medya/${ad}`;
  if (yol && /^\/jpg\/(dosya\/urun\/[a-z0-9]+\.jpg|kartela\/renkler\.jpg\?v=[a-f0-9]+)$/.test(yol)) return yol;
  return null;
}

/** Asistanın araç çağrısı: katlanmış kısa satır (açınca giriş ve sonuç) */
function ToolLine({ m }: { m: Bubble }) {
  const name = m.metin?.match(/^([a-z_]+)\(/)?.[1];
  return (
    <details className="mx-auto w-full max-w-[85%] rounded-lg border border-dashed border-border bg-card/60 px-3 py-1.5 text-[11px] text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-1.5">
        <Wrench className="size-3 shrink-0" />
        <span className="truncate">{name ? `Asistan: ${name}` : (m.metin ?? "")}</span>
        <span className="ml-auto shrink-0">{timeText(m.tarih)}</span>
      </summary>
      {name && <p className="mt-1.5 whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed">{m.metin}</p>}
    </details>
  );
}

function StatusIcon({ durum }: { durum: string | null | undefined }) {
  if (durum === "failed") return <span className="font-semibold text-danger">gönderilemedi</span>;
  if (durum === "read") return <CheckCheck className="size-3.5 text-info" />;
  if (durum === "delivered") return <CheckCheck className="size-3.5" />;
  if (durum === "sent") return <Check className="size-3.5" />;
  return <Clock className="size-3" />;
}

/** Tek mesaj balonu. Metin yalnızca React metni olarak basılır (müşteri girdisi HTML olarak yorumlanmaz). */
export function MessageBubble({ m, status = true }: { m: Bubble; status?: boolean }) {
  if (m.tur === "arac") return <ToolLine m={m} />;
  // Deneme alanı: turun token ve maliyeti
  if (m.tur === "maliyet")
    return (
      <p className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
        <Coins className="size-3 shrink-0" /> {m.metin}
      </p>
    );
  const out = m.yon !== "gelen";
  const img = m.tur === "image" ? mediaUrl(m.medyaYol) : null;
  const video = m.tur === "video" && m.medyaYol && /^https:\/\//.test(m.medyaYol) ? m.medyaYol : null;
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
          m.yon === "gelen" && "rounded-bl-md bg-card",
          m.yon === "ekip" && "rounded-br-md bg-success-soft",
          m.yon === "asistan" && "rounded-br-md bg-info-soft",
        )}
      >
        {out && (
          <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            {m.yon === "asistan" ? (
              <>
                <Bot className="size-3" /> Asistan
              </>
            ) : m.yazan ? (
              m.yazan
            ) : (
              "Ekip (telefon)"
            )}
          </p>
        )}
        {img ? (
          <a href={img} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt={m.yon === "gelen" ? "Müşterinin gönderdiği görsel" : "Gönderilen görsel"} className="mb-1 max-h-72 rounded-lg" />
          </a>
        ) : video ? (
          <a href={video} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary underline">
            [Video]
          </a>
        ) : (
          m.tur !== "text" && <p className="text-xs italic text-muted-foreground">[{TUR[m.tur] ?? m.tur}{m.tur === "image" && m.yon === "gelen" ? " · indiriliyor ya da indirilemedi" : ""}]</p>
        )}
        {m.metin && <p className="whitespace-pre-wrap break-words">{m.metin}</p>}
        <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
          {timeText(m.tarih)}
          {out && status && <StatusIcon durum={m.durum} />}
        </p>
      </div>
    </div>
  );
}
