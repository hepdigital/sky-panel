import { after, NextResponse } from "next/server";
import { syncYurticiIfStale } from "@/server/shipping";
import { syncStale } from "@/server/sites";
import { runTaskSchedule } from "@/server/tasks";

/**
 * Zamanlayıcı (Hostinger cron) için: aktif sitelerin siparişlerini çeker; Yurtiçi gönderileri saatte bir (kargo bildirimleri);
 * tekrarlayan görevleri üretir ve son günü gelen görevleri hatırlatır.
 * Adres: /api/senkron?anahtar=<SENKRON_ANAHTARI>  (anahtar sunucudaki .env'de)
 */
export async function GET(request: Request) {
  const key = process.env.SENKRON_ANAHTARI;
  if (!key || new URL(request.url).searchParams.get("anahtar") !== key) return NextResponse.json({ ok: false }, { status: 401 });
  await syncStale(0);
  after(() => syncYurticiIfStale().catch((e) => console.error("syncYurtici", e)));
  after(() => runTaskSchedule().catch((e) => console.error("runTaskSchedule", e)));
  return NextResponse.json({ ok: true });
}
