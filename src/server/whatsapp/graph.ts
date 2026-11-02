import "server-only";
import { GRAPH, type WaConfig } from "./config";

const MAX_IMAGE = 5_000_000;

/** Metin mesajı gönderir, Meta'nın mesaj kimliğini (wamid) döner */
export async function sendText(cfg: WaConfig, to: string, body: string): Promise<{ ok: true; wamid: string } | { ok: false; hata: string }> {
  try {
    const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body } }),
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
