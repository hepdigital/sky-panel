import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, SESSION_DAYS, sessionCookie } from "@/server/session-cookie";

/**
 * Yayında yalnızca 1. aşama ekranları açıktır: giriş, panel (teklif, sipariş, müşteri, ürün, kullanıcı) ve müşterinin teklif linki.
 * Örnek veriyle çalışan prototip ekranlar (bayi portalı, ödeme, istasyonlar…) yalnızca geliştirmede görünür.
 */
const PROTOTYPE = [/^\/portal(\/|$)/, /^\/odeme(\/|$)/, /^\/istasyon(\/|$)/, /^\/panel\/siparisler\/yeni(\/|$)/, /^\/panel\/uretim(\/|$)/];

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (process.env.NODE_ENV === "production") {
    if (path === "/") return NextResponse.redirect(new URL("/panel", request.url));
    if (PROTOTYPE.some((r) => r.test(path))) return new NextResponse("Sayfa bulunamadı", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const res = NextResponse.next();
  // Panel açıldıkça oturum çerezinin süresi yenilenir (geçerliliği sunucu ayrıca veritabanından denetler).
  // Yalnızca sayfa açılışında: çıkış gibi işlemler (POST) çerezi kendisi siler, üzerine yazılmamalı.
  const token = request.cookies.get(COOKIE)?.value;
  if (token && request.method === "GET" && path.startsWith("/panel")) res.cookies.set(COOKIE, token, sessionCookie(new Date(Date.now() + SESSION_DAYS * 86_400_000)));
  return res;
}

export const config = {
  matcher: ["/", "/panel/:path*", "/portal/:path*", "/odeme/:path*", "/istasyon/:path*"],
};
