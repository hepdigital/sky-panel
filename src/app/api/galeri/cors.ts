import { getSettings } from "@/server/gallery";

/** Galeri sayfası panel adresine tarayıcıdan yazar (sayaç, talep): yalnızca galerinin sitesine izin verilir */
export async function corsHeaders(req: Request): Promise<Record<string, string>> {
  const origin = req.headers.get("origin") ?? "";
  const site = new URL((await getSettings()).siteUrl);
  const allowed = [site.origin, site.origin.replace("://", "://www."), site.origin.replace("://www.", "://")];
  return allowed.includes(origin) ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" } : {};
}

export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "?";
