import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { desc, sql } from "drizzle-orm";
import { UserAdmin } from "@/components/admin/user-admin";
import { requireAdmin } from "@/server/auth";
import { db, schema } from "@/server/db";

export const metadata: Metadata = { title: "Kullanıcılar" };

async function Users() {
  await connection();
  const me = await requireAdmin();
  const k = schema.kullanicilar;
  const t = schema.teklifler;
  const rows = await db()
    .select({
      id: k.id, kullaniciAdi: k.kullaniciAdi, adSoyad: k.adSoyad, eposta: k.eposta, telefon: k.telefon, rol: k.rol, aktif: k.aktif,
      sonGiris: k.sonGiris,
      teklif: sql<number>`(SELECT COUNT(*) FROM ${t} WHERE ${t.kullaniciId} = ${k.id})`,
    })
    .from(k)
    .orderBy(desc(k.aktif), k.adSoyad);
  return <UserAdmin meId={me.id} users={rows.map((r) => ({ ...r, teklif: Number(r.teklif), sonGiris: r.sonGiris?.toISOString() ?? null }))} />;
}

export default function UsersPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1100px] animate-pulse rounded-2xl bg-muted" />}>
      <Users />
    </Suspense>
  );
}
