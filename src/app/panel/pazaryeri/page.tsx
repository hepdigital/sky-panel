import { redirect } from "next/navigation";

/** Eski adres: pazaryeri ürünleri artık Ürünler ekranında */
export default function OldMarketplacePage() {
  redirect("/panel/satis-urunleri");
}
