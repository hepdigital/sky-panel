// QR kod: tarayıcıda ve sunucuda aynı çalışır (teklif PDF'i, ödeme linki, etiket vb. için ortak).
import QRCode from "qrcode";

export type QrOptions = { /** piksel genişliği */ size?: number; /** koyu renk (#rrggbb) */ color?: string; /** kenar boşluğu (modül) */ margin?: number };

/** Metni (çoğunlukla bir adres) PNG data: URL olarak QR koda çevirir */
export function qrDataUrl(text: string, { size = 480, color = "#111a26", margin = 1 }: QrOptions = {}) {
  return QRCode.toDataURL(text, { width: size, margin, errorCorrectionLevel: "M", color: { dark: color, light: "#ffffff" } });
}

/** Metni SVG olarak QR koda çevirir (sayfaya gömmek için) */
export function qrSvg(text: string, { color = "#111a26", margin = 1 }: Omit<QrOptions, "size"> = {}) {
  return QRCode.toString(text, { type: "svg", margin, errorCorrectionLevel: "M", color: { dark: color, light: "#ffffff" } });
}
