import { after, NextResponse } from "next/server";
import { runPending } from "@/server/whatsapp/asistan";

/**
 * Asistanın yedek işleyicisi (Hostinger cron, dakikada bir): süreç kapandığı için cevaplanmamış kalan sohbetleri işler.
 * Adres: /api/whatsapp/isle?anahtar=<SENKRON_ANAHTARI>. Cevap hemen döner, işleme arkada sürer.
 */
export async function GET(request: Request) {
  const key = process.env.SENKRON_ANAHTARI;
  if (!key || new URL(request.url).searchParams.get("anahtar") !== key) return NextResponse.json({ ok: false }, { status: 401 });
  after(() => runPending().catch((e) => console.error("whatsapp isle", e)));
  return NextResponse.json({ ok: true });
}
