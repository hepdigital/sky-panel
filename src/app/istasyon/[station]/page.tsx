import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StationScreen } from "@/components/station/station-screen";
import { stations, type StationKey } from "@/lib/station-data";

const slugs: Record<string, StationKey> = {
  tasarim: "design",
  baski: "print",
  uretim: "production",
  sevkiyat: "shipping",
};

export function generateStaticParams() {
  return Object.keys(slugs).map((station) => ({ station }));
}

export async function generateMetadata({ params }: PageProps<"/istasyon/[station]">): Promise<Metadata> {
  const { station } = await params;
  return { title: slugs[station] ? stations[slugs[station]].title : "İstasyon" };
}

export default async function StationPage({ params }: PageProps<"/istasyon/[station]">) {
  const { station } = await params;
  const key = slugs[station];
  if (!key) notFound();
  return <StationScreen station={key} />;
}
