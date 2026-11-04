import { after, NextResponse } from "next/server";
import { syncYurticiIfStale } from "@/server/shipping";
import { syncStale } from "@/server/sites";

/**
 * Zamanlayıcı (Hostinger cron) için: aktif sitelerin siparişlerini çeker; Yurtiçi gönderileri saatte bir (kargo bildirimleri).
 * Adres: /api/senkron?anahtar=<SENKRON_ANAHTARI>  (anahtar sunucudaki .env'de)
 */
export async function GET(request: Request) {
  const key = process.env.SENKRON_ANAHTARI;
  if (!key || new URL(request.url).searchParams.get("anahtar") !== key) return NextResponse.json({ ok: false }, { status: 401 });
  await syncStale(0);
  after(() => syncYurticiIfStale().catch((e) => console.error("syncYurtici", e)));
  return NextResponse.json({ ok: true });
}
