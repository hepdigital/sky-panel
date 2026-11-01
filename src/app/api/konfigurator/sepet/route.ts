import { signCart } from "@/server/konfigurator";

/**
 * Site konfigüratörü: tasarımı doğrular, fiyatlar ve imzalı sepet bileti döner. Giriş gerekmez (konfigüratör sitelere
 * gömülür); bilet yalnızca ortak anahtarı bilen site tarafından doğrulanır, fiyat tarayıcıdan değiştirilemez.
 */
export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > 900_000) return Response.json({ ok: false, hata: "İstek çok büyük." }, { status: 413 });
  try {
    const body = JSON.parse(text) as { marka?: string; g?: unknown; adet?: unknown; ekler?: unknown; gorsel?: unknown };
    const { token, payload } = await signCart({ marka: String(body.marka ?? ""), g: body.g, adet: body.adet, ekler: body.ekler, gorsel: body.gorsel });
    return Response.json({ ok: true, token, fiyat: payload.fiyat, adet: payload.adet });
  } catch (e) {
    return Response.json({ ok: false, hata: e instanceof Error ? e.message : "Tasarım sepete eklenemedi." }, { status: 400 });
  }
}
