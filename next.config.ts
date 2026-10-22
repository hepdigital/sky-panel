import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hostinger paketi (GitHub Actions) bağımsız çalışan sunucu üretir
  ...(process.env.BUILD_TARGET === "standalone" ? { output: "standalone" as const } : {}),
  cacheComponents: true,
  partialPrefetching: true,
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
