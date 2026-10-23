import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { ProductAdmin } from "@/components/products/product-admin";
import { isAdmin, requireSeller } from "@/server/auth";
import { canEditProduct, listProducts } from "@/server/catalog";

export const metadata: Metadata = { title: "Ürünler" };

async function Products() {
  await connection();
  const me = await requireSeller();
  const { kategoriler, urunler } = await listProducts();
  return (
    <ProductAdmin
      admin={isAdmin(me)}
      kategoriler={kategoriler.map((k) => ({ id: k.id, ad: k.ad, aciklama: k.aciklama, uyari: k.uyari, aktif: k.aktif }))}
      urunler={urunler.map((u) => ({
        id: u.id, kod: u.kod, kategoriId: u.kategoriId, ad: u.ad, aciklama: u.aciklama, gorsel: u.gorsel,
        toptan: u.toptan, perakende: u.perakende, uyari: u.uyari, aktif: u.aktif, renkSecimi: u.renkSecimi, secenekAd: u.secenekAd, secenekToptan: u.secenekToptan, secenekPerakende: u.secenekPerakende, ekleyen: u.ekleyen,
        duzenlenebilir: canEditProduct(me, u.olusturanId),
      }))}
    />
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1200px] animate-pulse rounded-2xl bg-muted" />}>
      <Products />
    </Suspense>
  );
}
