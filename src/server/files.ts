import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomToken } from "./auth";

/**
 * Panelden yüklenen dosyalar (ürün görselleri) uygulama klasörünün dışında da tutulabilir: UPLOAD_DIR.
 * Yayın (deploy) uygulama klasörünü yenilese de dosyalar kaybolmasın diye sunucuda kalıcı bir klasör verilmelidir.
 */
const root = () => path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "yuklemeler"));

/** webp görseli kaydeder, site adresini döner: /dosya/urun/<ad>.webp */
export async function saveWebp(folder: "urun" | "marka" | "konfigurator", data: Buffer) {
  // RIFF....WEBP imzası
  if (data.length < 12 || data.toString("ascii", 0, 4) !== "RIFF" || data.toString("ascii", 8, 12) !== "WEBP") throw new Error("Görsel webp değil.");
  if (data.length > 2_000_000) throw new Error("Görsel çok büyük.");
  const dir = path.join(/* turbopackIgnore: true */ root(), folder);
  await mkdir(dir, { recursive: true });
  const name = `${randomToken(12).toLowerCase().replace(/[^a-z0-9]/g, "")}${Date.now().toString(36)}.webp`;
  await writeFile(path.join(/* turbopackIgnore: true */ dir, name), data);
  return `/dosya/${folder}/${name}`;
}

/** Yalnızca bilinen klasörlerdeki webp dosyaları okunur (klasör dışına çıkılamaz) */
export async function readUpload(parts: string[]) {
  if (parts.length !== 2 || !["urun", "marka", "konfigurator"].includes(parts[0]) || !/^[a-z0-9]+\.webp$/.test(parts[1])) return null;
  return readFile(path.join(/* turbopackIgnore: true */ root(), parts[0], parts[1])).catch(() => null);
}

/** WhatsApp'tan gelen görseller: UPLOAD_DIR/whatsapp/<ad>. Herkese açık /dosya adresinden sunulmaz (kişisel veri), panelde oturumla okunur. */
const WA_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const WA_TYPES: Record<string, string> = Object.fromEntries(Object.entries(WA_EXT).map(([t, e]) => [e, t]));

export async function saveWhatsappMedia(mime: string, data: Buffer) {
  const ext = WA_EXT[mime];
  if (!ext) throw new Error("Desteklenmeyen görsel türü.");
  const dir = path.join(/* turbopackIgnore: true */ root(), "whatsapp");
  await mkdir(dir, { recursive: true });
  const name = `${randomToken(12).toLowerCase().replace(/[^a-z0-9]/g, "")}${Date.now().toString(36)}.${ext}`;
  await writeFile(path.join(/* turbopackIgnore: true */ dir, name), data);
  return `whatsapp/${name}`;
}

export async function readWhatsappMedia(name: string) {
  if (!/^[a-z0-9]+\.(jpg|png|webp)$/.test(name)) return null;
  return readFile(path.join(/* turbopackIgnore: true */ root(), "whatsapp", name)).catch(() => null);
}
