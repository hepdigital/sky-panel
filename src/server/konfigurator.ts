import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { SZ, gzRows, gzTotal } from "@/lib/terminal/calc";
import { withPriceTable } from "@/lib/terminal/price-table";
import { KONF_KDV, KONF_MODE, cleanConfig, summaryLines } from "@/lib/konfigurator";
import { listColors } from "./colors";
import { db, schema } from "./db";
import { saveWebp } from "./files";
import { gazeboTables } from "./gazebo-prices";

// Site konfigüratörünün sepeti: tarayıcıdan gelen tasarım sunucuda yeniden doğrulanıp fiyatlanır ve imzalanır.
// Site (WordPress eklentisi) imzayı ortak anahtarla (KONFIGURATOR_SECRET) doğrular; fiyata tarayıcıdan dokunulamaz.
// Biçim: base64url(JSON) + "." + base64url(HMAC-SHA256). Geçerlilik 2 saat (sepete eklenene kadar).

const TTL = 2 * 3600;
const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export type KonfPayload = {
  v: 1;
  /** Tek kullanımlık kimlik (aynı tasarım iki kez eklenirse ayrı satır) */
  n: string;
  marka: string;
  exp: number;
  baslik: string;
  /** Birim fiyat, KDV hariç (WooCommerce'te fiyatlar KDV hariç girili) */
  fiyat: number;
  kdv: number;
  adet: number;
  satirlar: { ad: string; deger: string }[];
  parcalar: { ad: string; fiyat: number }[];
  gorsel: string | null;
  cfg: unknown;
};

export async function signCart(input: { marka: string; g: unknown; adet: unknown; gorsel?: unknown }) {
  const secret = process.env.KONFIGURATOR_SECRET;
  if (!secret) throw new Error("Konfigüratör sepeti yapılandırılmamış.");
  const [brand] = await db().select({ id: schema.markalar.id }).from(schema.markalar).where(eq(schema.markalar.kod, String(input.marka)));
  if (!brand) throw new Error("Marka bulunamadı.");
  const [tables, colors] = await Promise.all([gazeboTables([brand.id]), listColors()]);
  const active = colors.filter((c) => c.aktif);
  const r = withPriceTable(tables[brand.id], () => {
    const c = cleanConfig(input.g, active.map((x) => x.hex));
    if (!c.ok) return c;
    const g = c.g;
    const rows = gzRows(g, KONF_MODE);
    if (rows.some((x) => x.bad)) return { ok: false as const, hata: "Seçimde fiyatı olmayan bir parça var." };
    return { ok: true as const, g, fiyat: gzTotal(g, KONF_MODE), parcalar: rows.map((x) => ({ ad: x.c || x.t, fiyat: x.v })), satirlar: summaryLines(g, active.find((x) => x.hex === g.color)?.ad ?? null) };
  });
  if (!r.ok) throw new Error(r.hata);

  // 3D görüntüsü (webp, data URL): sepette ve siparişte küçük resim
  let gorsel: string | null = null;
  const m = typeof input.gorsel === "string" ? input.gorsel.match(/^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/) : null;
  if (m && m[1].length < 600_000) {
    const yol = await saveWebp("konfigurator", Buffer.from(m[1], "base64")).catch(() => null);
    if (yol) gorsel = `${(process.env.PUBLIC_URL ?? "").replace(/\/+$/, "")}${yol}`;
  }

  const payload: KonfPayload = {
    v: 1,
    n: randomBytes(9).toString("base64url"),
    marka: String(input.marka),
    exp: Math.floor(Date.now() / 1000) + TTL,
    baslik: `Gazebo Çadır ${SZ[r.g.size]} m (Kendin Tasarla)`,
    fiyat: Math.round(r.fiyat * 100) / 100,
    kdv: KONF_KDV,
    adet: Math.max(1, Math.min(99, Math.round(Number(input.adet) || 1))),
    satirlar: r.satirlar,
    parcalar: r.parcalar,
    gorsel,
    cfg: r.g,
  };
  const body = b64(JSON.stringify(payload));
  const sig = b64(createHmac("sha256", secret).update(body).digest());
  return { token: `${body}.${sig}`, payload };
}
