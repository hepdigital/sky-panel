import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hostinger paketi (GitHub Actions) bağımsız çalışan sunucu üretir
  ...(process.env.BUILD_TARGET === "standalone" ? { output: "standalone" as const } : {}),
  cacheComponents: true,
  partialPrefetching: true,
  // Uygulama (PWA): service worker önbelleğe alınmaz (güncelleme hemen yayılsın)
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] },
      { source: "/manifest.webmanifest", headers: [{ key: "Content-Type", value: "application/manifest+json; charset=utf-8" }, { key: "Cache-Control", value: "public, max-age=3600" }] },
    ];
  },
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
