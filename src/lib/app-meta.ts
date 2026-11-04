import type { Metadata } from "next";

/**
 * Panelin uygulama olarak yüklenmesi (PWA): yalnızca panel ve giriş sayfalarında. Müşteri sayfaları (teklif linki,
 * konfigüratör) yüklenebilir uygulama sunmaz.
 */
export const appMetadata: Pick<Metadata, "manifest" | "appleWebApp" | "applicationName"> = {
  manifest: "/manifest.webmanifest",
  applicationName: "SKY Panel",
  appleWebApp: { capable: true, title: "SKY Panel", statusBarStyle: "default" },
};
