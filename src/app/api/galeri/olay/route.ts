import { connection } from "next/server";
import { countEvent } from "@/server/gallery";
import { corsHeaders } from "../cors";

/** Galeri sayaçları (sendBeacon, düz metin JSON): { yol, tur: "goruntu" | "whatsapp" } */
export async function POST(req: Request) {
  await connection();
  const headers = await corsHeaders(req);
  try {
    const text = await req.text();
    if (text.length < 500) {
      const b = JSON.parse(text) as { yol?: unknown; tur?: unknown };
      const yol = String(b.yol ?? "");
      if (/^[a-z0-9/-]{1,400}$/.test(yol)) await countEvent(yol, String(b.tur ?? ""));
    }
  } catch {}
  return new Response(null, { status: 204, headers });
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: await corsHeaders(req) });
}
