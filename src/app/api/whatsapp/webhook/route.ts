import { after, NextResponse } from "next/server";
import { scheduleChat } from "@/server/whatsapp/asistan";
import { signatureValid, waConfig } from "@/server/whatsapp/config";
import { fetchMedia, notifyIncoming, saveWebhook, type WebhookBody } from "@/server/whatsapp/store";

/**
 * WhatsApp Cloud API webhook'u (Meta panelinde: https://panel.skygorselmarket.com/api/whatsapp/webhook).
 * Ortam değişkenleri tanımlı değilse 503: özellik kapalı.
 */
const off = () => new NextResponse("WhatsApp kapalı", { status: 503 });

/** Kurulum doğrulaması: hub.verify_token eşleşirse hub.challenge düz metin döner */
export async function GET(request: Request) {
  const cfg = waConfig();
  if (!cfg) return off();
  const q = new URL(request.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === cfg.verifyToken) {
    return new NextResponse(q.get("hub.challenge") ?? "", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/** Mesaj, echo ve durum bildirimleri: imza doğrulanır, kaydedilir, hemen 200 döner; görseller ve asistan sonra çalışır */
export async function POST(request: Request) {
  const cfg = waConfig();
  if (!cfg) return off();
  const raw = Buffer.from(await request.arrayBuffer());
  if (!signatureValid(cfg.appSecret, raw, request.headers.get("x-hub-signature-256"))) return new NextResponse("Unauthorized", { status: 401 });
  let body: WebhookBody;
  try {
    body = JSON.parse(raw.toString("utf8")) as WebhookBody;
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }
  try {
    const { media, chats } = await saveWebhook(cfg, body);
    // Cevaptan sonra: görseller indirilir; yeni mesaj gelen sohbetler birleştirme süresinden sonra asistana verilir
    if (media.length) after(() => fetchMedia(cfg, media));
    if (chats.length) after(() => Promise.all(chats.map((id) => scheduleChat(id).catch((e) => console.error("whatsapp asistan", e)))));
    // Ekipteki sohbete müşteri yazdıysa ilgilenene uygulama bildirimi
    if (chats.length) after(() => notifyIncoming(chats).catch((e) => console.error("whatsapp bildirim", e)));
  } catch (e) {
    // Kayıt başarısızsa 500: Meta bildirimi bir süre sonra yeniden gönderir (wamid tekil olduğu için çift kayıt olmaz)
    console.error("whatsapp webhook", e);
    return new NextResponse("Error", { status: 500 });
  }
  return new NextResponse("OK", { status: 200 });
}
