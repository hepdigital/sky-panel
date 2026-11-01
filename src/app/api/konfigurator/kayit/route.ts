import { saveLead } from "@/server/konfigurator";

/**
 * Site konfigüratörü "Tasarımınızı kaydedin": satın almadan ayrılan ziyaretçinin telefonu tasarımıyla panelde Talepler'e
 * düşer, satış ekibi arar. Giriş gerekmez; tasarım sepetle aynı kontrolden geçer, aynı IP'den sık kayıt sınırlanır.
 */
export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > 900_000) return Response.json({ ok: false, hata: "İstek çok büyük." }, { status: 413 });
  try {
    const body = JSON.parse(text) as { marka?: string; g?: unknown; adet?: unknown; ekler?: unknown; gorsel?: unknown; telefon?: unknown; ad?: unknown; site?: unknown };
    // Bot tuzağı: görünmeyen alan doldurulmuşsa kaydedilmiş gibi yanıt verilir
    if (body.site) return Response.json({ ok: true });
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "?";
    await saveLead({ marka: String(body.marka ?? ""), g: body.g, adet: body.adet, ekler: body.ekler, gorsel: body.gorsel, telefon: body.telefon, ad: body.ad, ip });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, hata: e instanceof Error ? e.message : "Kayıt alınamadı." }, { status: 400 });
  }
}
