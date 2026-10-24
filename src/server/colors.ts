import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { pushColors } from "./sites";

const { kumasRenkleri } = schema;

export type FabricColor = { hex: string; ad: string; aktif: boolean };

/** Kumaş renkleri, sırasıyla; aktif = stokta */
export async function listColors(): Promise<FabricColor[]> {
  return db().select({ hex: kumasRenkleri.hex, ad: kumasRenkleri.ad, aktif: kumasRenkleri.aktif }).from(kumasRenkleri).orderBy(asc(kumasRenkleri.sira), asc(kumasRenkleri.ad));
}

/** Stok durumunu değiştirir ve GazeboTente sitelerine yazar (çağıran yönetici yetkisini denetler) */
export async function setColorStock(hex: string, aktif: boolean) {
  await db().update(kumasRenkleri).set({ aktif }).where(eq(kumasRenkleri.hex, hex));
  return pushColors((await listColors()).map((c) => ({ ad: c.ad, hex: c.hex, aktif: c.aktif })));
}
