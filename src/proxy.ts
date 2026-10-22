import { NextResponse, type NextRequest } from "next/server";

/**
 * Yayında yalnızca 1. aşama ekranları açıktır: giriş, panel (teklif, sipariş, müşteri, ürün, kullanıcı) ve müşterinin teklif linki.
 * Örnek veriyle çalışan prototip ekranlar (bayi portalı, ödeme, istasyonlar…) yalnızca geliştirmede görünür.
 */
const PROTOTYPE = [/^\/portal(\/|$)/, /^\/odeme(\/|$)/, /^\/istasyon(\/|$)/, /^\/panel\/siparisler\/yeni(\/|$)/, /^\/panel\/uretim(\/|$)/];

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();
  const path = request.nextUrl.pathname;
  if (path === "/") return NextResponse.redirect(new URL("/panel", request.url));
  if (PROTOTYPE.some((r) => r.test(path))) return new NextResponse("Sayfa bulunamadı", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/portal/:path*", "/odeme/:path*", "/istasyon/:path*", "/panel/siparisler/yeni", "/panel/uretim"],
};
