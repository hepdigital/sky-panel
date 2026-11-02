import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { listColors } from "@/server/colors";
import { readUpload } from "@/server/files";

/**
 * Pazaryerleri için JPEG görsel: paneldeki webp görsel 1200 × 1200 beyaz zemine ortalanır.
 * /jpg/dosya/urun/<ad>.jpg → yüklenen görsel · /jpg/terminal/img/<ad>.jpg → terminal ürün görseli
 * /jpg/kartela/renkler.jpg → stoktaki kumaş renklerinin kartelası (WhatsApp asistanı gönderir)
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/jpg/[...yol]">) {
  const { yol } = await ctx.params;
  if (yol.length === 2 && yol[0] === "kartela" && yol[1] === "renkler.jpg") return colorCard();
  const last = yol.at(-1) ?? "";
  if (!/^[a-zA-Z0-9-]+\.jpg$/.test(last)) return new Response("Bulunamadı", { status: 404 });
  const webp = last.replace(/\.jpg$/, ".webp");
  let data: Buffer | null = null;
  if (yol.length === 3 && yol[0] === "dosya") data = await readUpload([yol[1], webp]);
  else if (yol.length === 3 && yol[0] === "terminal" && yol[1] === "img")
    data = await readFile(path.join(/* turbopackIgnore: true */ process.cwd(), "public", "terminal", "img", webp)).catch(() => null);
  if (!data) return new Response("Bulunamadı", { status: 404 });
  try {
    const { default: sharp } = await import("sharp");
    const jpg = await sharp(data)
      .flatten({ background: "#ffffff" })
      .resize(1200, 1200, { fit: "contain", background: "#ffffff" })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    return new Response(new Uint8Array(jpg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" } });
  } catch (e) {
    // Dönüştürülemezse görsel olduğu gibi verilir (pazaryeri reddederse hatası listelemede görünür)
    console.error("[jpg]", e);
    const why = (e instanceof Error ? e.message : String(e)).replace(/[^ -~]/g, " ").slice(0, 200);
    return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/webp", "Cache-Control": "no-store", "X-Donusum-Hatasi": why } });
  }
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** Stoktaki renkler: numaralı renk kutuları ve adları (numaralar asistanın mesajındaki listeyle aynı sırada) */
async function colorCard() {
  const colors = (await listColors()).filter((c) => c.aktif && /^#[0-9a-fA-F]{6}$/.test(c.hex));
  if (!colors.length) return new Response("Bulunamadı", { status: 404 });
  const cols = 4;
  const cell = 270;
  const sw = 210;
  const rows = Math.ceil(colors.length / cols);
  const w = cols * cell + 60;
  const h = rows * (sw + 90) + 140;
  const items = colors
    .map((c, i) => {
      const x = 30 + (i % cols) * cell + (cell - sw) / 2;
      const y = 110 + Math.floor(i / cols) * (sw + 90);
      return `<rect x="${x}" y="${y}" width="${sw}" height="${sw}" rx="18" fill="${c.hex}" stroke="#d9dde3" stroke-width="2"/>
<text x="${x + sw / 2}" y="${y + sw + 38}" font-size="26" font-weight="700" text-anchor="middle" fill="#111a26">${i + 1}. ${esc(c.ad)}</text>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif">
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="${w / 2}" y="66" font-size="36" font-weight="700" text-anchor="middle" fill="#111a26">Stoktaki renkler</text>${items}</svg>`;
  try {
    const { default: sharp } = await import("sharp");
    const jpg = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
    return new Response(new Uint8Array(jpg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=600" } });
  } catch (e) {
    console.error("[kartela]", e);
    return new Response("Kartela oluşturulamadı", { status: 500 });
  }
}
