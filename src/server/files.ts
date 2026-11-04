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
export async function saveWebp(folder: "urun" | "marka" | "konfigurator" | "gazebo", data: Buffer) {
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
  if (parts.length !== 2 || !["urun", "marka", "konfigurator", "gazebo"].includes(parts[0]) || !/^[a-z0-9]+\.webp$/.test(parts[1])) return null;
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

/**
 * Görev ekleri: UPLOAD_DIR/gorev/<ad>. Herkese açık değil; panelde görevi gören oturumla indirir.
 * Fotoğraflar (jpg/png/webp) en çok 2000 px webp'ye küçültülür; diğer dosyalar olduğu gibi saklanır.
 */
export const TASK_FILE_MAX = 15_000_000;
const TASK_BLOCKED = /\.(exe|bat|cmd|com|msi|scr|ps1|vbs|js|jar|sh|html?|svg|php)$/i;

export async function saveTaskFile(name: string, mime: string, data: Buffer) {
  if (!data.length) throw new Error("Dosya boş.");
  if (data.length > TASK_FILE_MAX) throw new Error(`“${name}” çok büyük (en çok 15 MB).`);
  if (TASK_BLOCKED.test(name)) throw new Error(`“${name}” türündeki dosyalar eklenemez.`);
  let body = data;
  let tur = mime || "application/octet-stream";
  let ext = (name.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? "bin").toLowerCase();
  if (/^image\/(jpeg|png|webp)$/.test(tur)) {
    const sharp = (await import("sharp")).default;
    body = await sharp(data).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    tur = "image/webp";
    ext = "webp";
  }
  const dir = path.join(/* turbopackIgnore: true */ root(), "gorev");
  await mkdir(dir, { recursive: true });
  const file = `${randomToken(12).toLowerCase().replace(/[^a-z0-9]/g, "")}${Date.now().toString(36)}.${ext}`;
  await writeFile(path.join(/* turbopackIgnore: true */ dir, file), body);
  return { dosya: file, tur, boyut: body.length };
}

export async function readTaskFile(file: string) {
  if (!/^[a-z0-9]+\.[a-z0-9]{1,8}$/.test(file)) return null;
  return readFile(path.join(/* turbopackIgnore: true */ root(), "gorev", file)).catch(() => null);
}

export async function removeTaskFile(file: string) {
  if (!/^[a-z0-9]+\.[a-z0-9]{1,8}$/.test(file)) return;
  const { unlink } = await import("node:fs/promises");
  await unlink(path.join(/* turbopackIgnore: true */ root(), "gorev", file)).catch(() => {});
}
