// PDF teklif: SKY fiyat terminalinin PDF kodu (public/terminal/pdf/) aynen kullanılır, çıktı birebir aynıdır.
// Betikler yalnızca ilk PDF isteğinde, sırayla yüklenir (sayfa yükünü büyütmez).
import { qrDataUrl } from "@/lib/qr";
import type { PdfData } from "./calc";

/** public/terminal/pdf/ altındaki bir betik değişince artırın: CDN ve tarayıcı eski dosyayı vermesin */
const V = "3";
const SCRIPTS = ["jspdf.umd.min.js", "jspdf.plugin.autotable.min.js", "fonts-tr.js", "images.js", "firma.js", "pdf.js"];

declare global {
  interface Window {
    SKY_PDF?: { save: (q: PdfData) => Promise<void>; build: (q: PdfData) => Promise<{ output: (type: "datauristring") => string }> };
  }
}

let loading: Promise<void> | null = null;

function load(src: string) {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `/terminal/pdf/${src}?v=${V}`;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`${src} yüklenemedi`));
    document.head.appendChild(s);
  });
}

function ready() {
  loading ??= SCRIPTS.reduce((p, src) => p.then(() => load(src)), Promise.resolve()).catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

/** Link verildiyse QR kodunu ekler (QR üretilemezse PDF yine link ile basılır) */
async function withQr(data: PdfData): Promise<PdfData> {
  if (!data.link || data.qr) return data;
  return { ...data, qr: await qrDataUrl(data.link).catch(() => undefined) };
}

export async function downloadPdf(data: PdfData) {
  await ready();
  if (!window.SKY_PDF) throw new Error("PDF modülü yüklenemedi");
  await window.SKY_PDF.save(await withQr(data));
}

/** PDF'i indirmeden base64 olarak üretir (e-posta eki için) */
export async function pdfBase64(data: PdfData) {
  await ready();
  if (!window.SKY_PDF) throw new Error("PDF modülü yüklenemedi");
  const doc = await window.SKY_PDF.build(await withQr(data));
  return doc.output("datauristring").split(",")[1] ?? "";
}
