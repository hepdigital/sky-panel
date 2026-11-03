import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Terminal } from "@/components/terminal/terminal";
import { isAdmin, requireSeller } from "@/server/auth";
import { getCatalogs, getCosts, productCodes } from "@/server/catalog";
import { listColors } from "@/server/colors";
import { gazeboCostTable, gazeboTables } from "@/server/gazebo-prices";
import { brandCard, brandsFor } from "@/server/brands";
import { activeChannels } from "@/server/channels";
import { customerForQuote } from "@/server/customers";
import { getPackages, getTariff } from "@/server/shipping";

export const metadata: Metadata = { title: "Yeni teklif" };

async function Loaded({ searchParams }: { searchParams: Promise<{ musteri?: string | string[] }> }) {
  await connection();
  const me = await requireSeller();
  const raw = (await searchParams).musteri;
  const id = Number(typeof raw === "string" ? raw : "");
  const [customer, channels, brands, colors, costs] = await Promise.all([
    id > 0 ? customerForQuote(me, id) : null,
    activeChannels(),
    brandsFor(me),
    listColors(),
    // Maliyet yalnızca yöneticiye gider
    isAdmin(me) ? getCosts() : null,
  ]);
  if (!brands.length) return <p className="mx-auto mt-10 max-w-md text-center text-sm text-muted-foreground">Size tanımlı aktif marka yok. Yöneticinizden marka atamasını isteyin.</p>;
  const ids = brands.map((b) => b.id);
  const [catalogs, tables, gazeboCost, tarife, paketler, kodlar] = await Promise.all([
    getCatalogs(ids), gazeboTables(ids), isAdmin(me) ? gazeboCostTable() : null, getTariff(), getPackages(), productCodes(),
  ]);
  // Koli ölçüleri: gazebo parçaları anahtarıyla, teklif ürünleri ürün koduyla (sepet anahtarı)
  const gazebo = Object.fromEntries(Object.entries(paketler).filter(([k]) => !k.startsWith("u|")));
  const urun = Object.fromEntries(Object.entries(paketler).flatMap(([k, p]) => (k.startsWith("u|") && kodlar[Number(k.slice(2))] ? [[kodlar[Number(k.slice(2))], p]] : [])));
  return (
    <Terminal
      catalogs={catalogs}
      costs={costs}
      tables={tables}
      gazeboCost={gazeboCost}
      outOfStock={colors.filter((c) => !c.aktif).map((c) => c.hex)}
      initialCustomer={customer}
      channels={channels}
      brands={brands.map(brandCard)}
      kargo={{ tarife, gazebo, urun }}
    />
  );
}

export default function NewQuotePage({ searchParams }: PageProps<"/panel/teklifler/yeni">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-6 h-[600px] max-w-[1400px] animate-pulse rounded-2xl bg-muted" />}>
      <Loaded searchParams={searchParams} />
    </Suspense>
  );
}
