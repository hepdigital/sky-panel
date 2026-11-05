import type { NextRequest } from "next/server";
import { connection } from "next/server";
import { getSettings, renderImage } from "@/server/gallery";

/**
 * Galeri görseli (filigranlı): /galeri-gorsel/<sürüm>/<k|b>/<ad>.webp. Sürüm adreste olduğundan uzun süre önbelleğe
 * alınır; filigran değişip sürüm artınca eski adres güncel sürüme yönlenir.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/galeri-gorsel/[...yol]">) {
  await connection();
  const { yol } = await ctx.params;
  const m = yol.length === 3 && /^\d+$/.test(yol[0]) ? yol[2].match(/^([a-z0-9]+)\.webp$/) : null;
  if (!m) return new Response("Bulunamadı", { status: 404 });
  const out = await renderImage(Number(yol[0]), yol[1], m[1]);
  if (out === "eski") {
    const s = await getSettings();
    return Response.redirect(new URL(`/galeri-gorsel/${s.surum}/${yol[1]}/${yol[2]}`, req.nextUrl.origin), 301);
  }
  if (!out) return new Response("Bulunamadı", { status: 404 });
  return new Response(new Uint8Array(out), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable", "Access-Control-Allow-Origin": "*" },
  });
}
