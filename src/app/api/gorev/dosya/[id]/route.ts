import { getMe } from "@/server/auth";
import { readTaskFile } from "@/server/files";
import { fileFor } from "@/server/tasks";

const INLINE = new Set(["image/webp", "image/jpeg", "image/png", "image/gif", "application/pdf"]);

/** Görev eki: yalnızca görevi gören oturuma; görseller ve PDF tarayıcıda açılır, diğerleri indirilir */
export async function GET(request: Request, ctx: RouteContext<"/api/gorev/dosya/[id]">) {
  const me = await getMe();
  if (!me) return new Response("Bulunamadı", { status: 404 });
  const f = await fileFor(me, Number((await ctx.params).id) || 0);
  const data = f && (await readTaskFile(f.dosya));
  if (!f || !data) return new Response("Bulunamadı", { status: 404 });
  const inline = INLINE.has(f.tur) && new URL(request.url).searchParams.get("indir") !== "1";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": INLINE.has(f.tur) ? f.tur : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.ad)}`,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
