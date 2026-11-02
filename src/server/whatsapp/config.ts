import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/** Graph API sürümü (şartname §5.5) */
export const GRAPH = "https://graph.facebook.com/v26.0";

/** Serbest metin gönderilebilen süre: müşterinin son mesajından sonra */
export const WINDOW_MS = 24 * 3600_000;

export type WaConfig = { token: string; phoneNumberId: string; appSecret: string; verifyToken: string };

/**
 * Ayarlar yalnızca sunucu ortam değişkenlerinden okunur. Biri eksikse özellik tamamen kapalıdır:
 * webhook 503 döner, menü ve gelen kutusu görünmez.
 */
export function waConfig(): WaConfig | null {
  const token = process.env.WHATSAPP_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  return token && phoneNumberId && appSecret && verifyToken ? { token, phoneNumberId, appSecret, verifyToken } : null;
}

export const waEnabled = () => waConfig() !== null;

/** X-Hub-Signature-256: "sha256=" + HMAC-SHA256(app secret, ham gövde), sabit zamanlı karşılaştırma */
export function signatureValid(appSecret: string, rawBody: Buffer, header: string | null) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"), "utf8");
  const got = Buffer.from(header.slice(7), "utf8");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Pencere açık mı: müşterinin son mesajından bu yana 24 saat geçmemiş olmalı */
export const windowOpen = (sonMusteriMesaji: Date | null, now = Date.now()) => !!sonMusteriMesaji && now - sonMusteriMesaji.getTime() < WINDOW_MS;
