import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getMe } from "@/server/auth";
import { publicKey, subscribe, unsubscribe } from "@/server/push";
import { COOKIE } from "@/server/session-cookie";

/**
 * Uygulama bildirim aboneliği (panel ve service worker kullanır).
 * GET: abone olurken gereken genel anahtar · POST { abonelik, eski? }: cihazı oturumdaki kullanıcıya bağlar · DELETE { endpoint }
 */
export async function GET() {
  if (!(await getMe())) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, anahtar: await publicKey() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const me = await getMe();
  if (!me) return NextResponse.json({ ok: false }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { abonelik?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; eski?: string | null } | null;
  const token = (await cookies()).get(COOKIE)?.value ?? null;
  const ok = !!body?.abonelik && (await subscribe(me, token, body.abonelik, request.headers.get("user-agent") ?? "", body.eski));
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}

export async function DELETE(request: Request) {
  const me = await getMe();
  if (!me) return NextResponse.json({ ok: false }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  if (body?.endpoint) await unsubscribe(me, body.endpoint);
  return NextResponse.json({ ok: true });
}
