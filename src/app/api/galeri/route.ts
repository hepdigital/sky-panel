import { connection } from "next/server";
import { publicAlbum } from "@/server/gallery";

/** Sitenin galeri sayfası (WordPress eklentisi sky-galeri) için albüm: ?yol=gazebo/3x3 (boşsa kök) */
export async function GET(req: Request) {
  await connection();
  const yol = new URL(req.url).searchParams.get("yol") ?? "";
  if (yol.length > 400 || !/^[a-z0-9/-]*$/.test(yol)) return Response.json({ ok: false }, { status: 404 });
  const data = await publicAlbum(yol);
  if (!data) return Response.json({ ok: false }, { status: 404 });
  return Response.json({ ok: true, ...data }, { headers: { "Cache-Control": "public, max-age=60" } });
}
