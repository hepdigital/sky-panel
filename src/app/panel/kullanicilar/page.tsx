import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { desc, sql } from "drizzle-orm";
import { UserAdmin } from "@/components/admin/user-admin";
import { requireAdmin } from "@/server/auth";
import { listBrands, userBrandMap } from "@/server/brands";
import { db, schema } from "@/server/db";

export const metadata: Metadata = { title: "Kullanıcılar" };

async function Users() {
  await connection();
  const me = await requireAdmin();
  const k = schema.kullanicilar;
  const rows = await db()
    .select({
      id: k.id, kullaniciAdi: k.kullaniciAdi, adSoyad: k.adSoyad, eposta: k.eposta, telefon: k.telefon, rol: k.rol, aktif: k.aktif,
      sonGiris: k.sonGiris,
      // Dış tablo adı açıkça yazılır: tek tablolu sorguda Drizzle "id" yazar, alt sorguda teklifin id'sine bağlanır
      teklif: sql<number>`(SELECT COUNT(*) FROM teklifler AS t2 WHERE t2.kullanici_id = kullanicilar.id)`,
    })
    .from(k)
    .orderBy(desc(k.aktif), k.adSoyad);
  const [brands, map] = await Promise.all([listBrands(), userBrandMap()]);
  return (
    <UserAdmin
      meId={me.id}
      brands={brands.filter((b) => b.aktif).map((b) => ({ id: b.id, ad: b.ad, renk: b.renk }))}
      users={rows.map((r) => ({ ...r, teklif: Number(r.teklif), sonGiris: r.sonGiris?.toISOString() ?? null, markalar: map.get(r.id) ?? [] }))}
    />
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1100px] animate-pulse rounded-2xl bg-muted" />}>
      <Users />
    </Suspense>
  );
}
