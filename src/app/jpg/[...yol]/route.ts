import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { readUpload } from "@/server/files";

/**
 * Pazaryerleri için JPEG görsel: paneldeki webp görsel 1200 × 1200 beyaz zemine ortalanır.
 * /jpg/dosya/urun/<ad>.jpg → yüklenen görsel · /jpg/terminal/img/<ad>.jpg → terminal ürün görseli
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/jpg/[...yol]">) {
  const { yol } = await ctx.params;
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
