"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ClipboardCopy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import type { BrandCard, Catalog, QuoteState } from "@/lib/terminal/calc";
import { copyText, quoteText } from "@/lib/terminal/quote-text";

type Props = { q: QuoteState; catalog: Catalog; brand: BrandCard; disabled?: boolean; compact?: boolean };

/** "Dökümü kopyala": teklifi düz metin olarak panoya alır (WhatsApp/e-posta). Tarayıcı izin vermezse metin pencerede seçili açılır. */
export function CopyQuoteButton({ q, catalog, brand, disabled, compact }: Props) {
  const [done, setDone] = useState(false);
  const [manual, setManual] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1800);
    return () => clearTimeout(t);
  }, [done]);
  useEffect(() => {
    if (manual !== null) requestAnimationFrame(() => area.current?.select());
  }, [manual]);

  async function copy() {
    const text = quoteText(q, catalog, brand);
    if (await copyText(text)) setDone(true);
    else setManual(text);
  }

  return (
    <>
      <Button type="button" variant="outline" size={compact ? "lg" : "md"} className={compact ? "px-3" : "w-full"} disabled={disabled} onClick={copy} aria-label="Dökümü kopyala">
        {done ? <Check /> : <ClipboardCopy />}
        {!compact && (done ? "Kopyalandı" : "Dökümü kopyala")}
      </Button>
      <Sheet open={manual !== null} onClose={() => setManual(null)} title="Teklif dökümü" className="md:max-w-xl">
        <p className="text-sm text-muted-foreground">Tarayıcı otomatik kopyalamaya izin vermedi. Metin seçili; Ctrl+C (Mac&apos;te ⌘C) ile kopyalayın.</p>
        <textarea ref={area} readOnly value={manual ?? ""} rows={16} className="mt-3 w-full rounded-xl border border-input bg-card p-3 font-mono text-xs outline-none focus:border-primary" />
      </Sheet>
    </>
  );
}
