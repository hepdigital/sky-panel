// Oturum çerezi: giriş (auth.ts) ve her sayfa açılışında süre yenileme (proxy.ts) aynı ayarı kullanır.

export const COOKIE = "sky_oturum";

/**
 * Oturum kullandıkça uzar: süre 90 gün; kalan süre 60 günün altına inince veritabanında yeniden 90 güne çekilir,
 * çerezin süresini de proxy her sayfa açılışında yeniler. Düzenli kullanan personelden giriş istenmez.
 */
export const SESSION_DAYS = 90;
export const RENEW_BELOW_DAYS = 60;

export const sessionCookie = (expires: Date) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  expires,
});
