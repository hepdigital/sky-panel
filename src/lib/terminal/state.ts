import { FRAMES, newIsk, sideFrom, type CartGazebo, type QuoteState } from "./calc";

// Teklif durumu (sepet): boş durum ve kayıttan gelen durumun doğrulanması. Terminal (tarayıcı) ve teklif kaydı (sunucu) ortak kullanır.

export const emptyQuote = (): QuoteState => ({ mode: 1, vat: 0, cart: [], prod: {}, prodIsk: {}, isk: newIsk() });
let seq = 0;
export const newId = () => `g${Date.now().toString(36)}${seq++}`;

/** Kayıttan gelen teklif durumu doğrulanır (PHP terminalinin kayıtlarıyla da uyumlu) */
export function parseState(raw: unknown): QuoteState | null {
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
    markaId: typeof d.markaId === "number" ? d.markaId : undefined,
    iskGrup: typeof d.iskGrup === "string" ? d.iskGrup : undefined,
    extra: Array.isArray(d.extra)
      ? d.extra
          .filter((x) => x && typeof x.ad === "string" && Number.isFinite(x.birim))
          .map((x) => ({ id: x.id || newId(), ad: x.ad, aciklama: x.aciklama ?? "", adet: Math.max(1, Math.min(999, x.adet || 1)), birim: x.birim, isk: x.isk ?? newIsk() }))
      : undefined,
  };
}
