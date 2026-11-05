import { connection } from "next/server";
import { saveGalleryLead } from "@/server/gallery";
import { clientIp, corsHeaders } from "../cors";

/**
 * Galeriden fiyat talebi: { yol, ad, telefon, mesaj, site (bot tuzağı) }. Panelde Talepler'e düşer. Ön uçuşa (preflight)
 * gerek kalmasın diye gövde düz metin JSON gönderilir.
 */
export async function POST(req: Request) {
  await connection();
  const headers = await corsHeaders(req);
  const text = await req.text();
  if (text.length > 5000) return Response.json({ ok: false, hata: "İstek çok büyük." }, { status: 413, headers });
  try {
    const b = JSON.parse(text) as { yol?: unknown; ad?: unknown; telefon?: unknown; mesaj?: unknown; site?: unknown };
    // Bot tuzağı: görünmeyen alan doldurulmuşsa kaydedilmiş gibi yanıt verilir
    if (b.site) return Response.json({ ok: true }, { headers });
    await saveGalleryLead({ yol: b.yol, ad: b.ad, telefon: b.telefon, mesaj: b.mesaj, ip: clientIp(req) });
    return Response.json({ ok: true }, { headers });
  } catch (e) {
    return Response.json({ ok: false, hata: e instanceof Error ? e.message : "Talep alınamadı." }, { status: 400, headers });
  }
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: await corsHeaders(req) });
}
