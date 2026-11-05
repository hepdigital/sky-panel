import { connection } from "next/server";
import { publicMap } from "@/server/gallery";

/** Sitenin site haritası için galeri albümleri (gizliler ve boşlar hariç) */
export async function GET() {
  await connection();
  return Response.json({ ok: true, albumler: await publicMap() }, { headers: { "Cache-Control": "public, max-age=300" } });
}
