import type { Metadata } from "next";
import { Catalog } from "@/components/portal/catalog";

export const metadata: Metadata = { title: "Ürünler" };

export default function ProductsPage() {
  return <Catalog />;
}
