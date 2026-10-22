import type { NextRequest } from "next/server";
import { readUpload } from "@/server/files";

/** Panelden yüklenen görseller (ürün görselleri). Dosya adları rastgeledir ve değişmez: uzun süre önbelleğe alınır. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/dosya/[...yol]">) {
  const { yol } = await ctx.params;
  const data = await readUpload(yol);
  if (!data) return new Response("Bulunamadı", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
