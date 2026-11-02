import "server-only";
import { GRAPH, type WaConfig } from "./config";

const MAX_IMAGE = 5_000_000;

type Sent = { ok: true; wamid: string } | { ok: false; hata: string };

/** Mesaj gönderir (metin, görsel, video), Meta'nın mesaj kimliğini (wamid) döner */
async function send(cfg: WaConfig, to: string, payload: Record<string, unknown>): Promise<Sent> {
  try {
    const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, ...payload }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
    const wamid = j.messages?.[0]?.id;
    if (!res.ok || !wamid) return { ok: false, hata: `WhatsApp gönderimi başarısız${j.error?.code ? ` (${j.error.code})` : ""}: ${j.error?.message ?? res.status}` };
    return { ok: true, wamid };
  } catch {
    return { ok: false, hata: "WhatsApp'a bağlanılamadı." };
  }
}

export const sendText = (cfg: WaConfig, to: string, body: string) => send(cfg, to, { type: "text", text: { preview_url: false, body } });

/** Görsel ya da video: Meta dosyayı herkese açık adresten (link) kendisi indirir */
export const sendMedia = (cfg: WaConfig, to: string, tur: "image" | "video", link: string, caption?: string) =>
  send(cfg, to, { type: tur, [tur]: { link, ...(caption ? { caption: caption.slice(0, 1024) } : {}) } });

/** Asistan çalışmaya başlarken: müşterinin mesajı okundu işaretlenir ve "yazıyor" gösterilir (hata önemsizdir) */
export async function markReadTyping(cfg: WaConfig, wamid: string) {
  await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: wamid, typing_indicator: { type: "text" } }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
}

/** Token yalnızca Meta'nın medya sunucusuna gönderilir */
const metaHost = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)(fbsbx\.com|facebook\.com|whatsapp\.net)$/.test(u.hostname);
  } catch {
    return false;
  }
};

/** Gelen medyayı indirir: önce GET /{media_id} ile geçici adres, sonra aynı token ile dosya */
export async function downloadMedia(cfg: WaConfig, mediaId: string): Promise<{ mime: string; data: Buffer } | null> {
  const auth = { Authorization: `Bearer ${cfg.token}` };
  const meta = (await fetch(`${GRAPH}/${encodeURIComponent(mediaId)}`, { headers: auth, signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? r.json() : null))) as {
    url?: string;
    mime_type?: string;
    file_size?: number;
  } | null;
  if (!meta?.url || !metaHost(meta.url) || (meta.file_size ?? 0) > MAX_IMAGE) return null;
  const res = await fetch(meta.url, { headers: auth, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return null;
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > MAX_IMAGE) return null;
  return { mime: (meta.mime_type ?? res.headers.get("content-type") ?? "").split(";")[0].trim(), data };
}
