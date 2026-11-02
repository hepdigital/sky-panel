import type { NextRequest } from "next/server";
import { getSeller } from "@/server/auth";
import { WA_TYPES, readWhatsappMedia } from "@/server/files";
import { waEnabled } from "@/server/whatsapp/config";

/** WhatsApp'tan gelen görseller: yalnız oturumu açık yönetici ve satışçıya, önbelleğe alınmadan (kişisel veri) */
export async function GET(_req: NextRequest, ctx: RouteContext<"/panel/whatsapp/medya/[ad]">) {
  if (!waEnabled() || !(await getSeller())) return new Response("Bulunamadı", { status: 404 });
  const { ad } = await ctx.params;
  const data = await readWhatsappMedia(ad);
  if (!data) return new Response("Bulunamadı", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": WA_TYPES[ad.split(".").pop()!], "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
