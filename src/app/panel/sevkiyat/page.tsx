import { Suspense } from "react";
import type { Metadata } from "next";
import { after, connection } from "next/server";
import { ShippingAdmin } from "@/components/shipping/shipping-admin";
import { requireAdmin } from "@/server/auth";
import { tariffCheck } from "@/lib/cargo-tariff";
import { getTariff, listShipments, syncYurticiIfStale, yurticiStatus } from "@/server/shipping";

export const metadata: Metadata = { title: "Sevkiyat" };

async function Shipping() {
  await connection();
  await requireAdmin();
  const [tarife, api, list] = await Promise.all([getTariff(), yurticiStatus(), listShipments()]);
  // Gönderiler bir saatte bir Yurtiçi'den yenilenir (arka planda; sayfa beklemez)
  after(() => syncYurticiIfStale().catch((e) => console.error("syncYurtici", e)));
  const rows = list.map(({ s, siparisNo }) => ({
    id: s.id, tarih: s.tarih, yon: s.yon === "gelen" ? ("gelen" as const) : ("giden" as const),
    karsi: (s.yon === "gelen" ? s.gonderici : s.alici) ?? "—", adres: s.yon === "gelen" ? null : s.aliciAdres,
    koli: s.koli, desi: s.desi, ucret: s.ucret, toplam: s.toplam, durum: s.durum, teslim: s.durumKodu === "OK", red: s.red, takipUrl: s.takipUrl,
    siparisId: s.siparisId, siparisNo, // Gelen gönderiler (iade, evrak, tedarikçiden) farklı fiyatlanır: tarife kontrolü yalnızca giden ve desili gönderide
    tarife: s.yon === "giden" && s.ucret > 0 && s.desi > 0 ? tariffCheck(tarife, s.koli, s.desi, s.ucret) : null,
  }));
  return <ShippingAdmin tarife={tarife} api={api} gonderiler={rows} />;
}

export default function ShippingPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-96 max-w-[1000px] animate-pulse rounded-2xl bg-muted" />}>
      <Shipping />
    </Suspense>
  );
}
