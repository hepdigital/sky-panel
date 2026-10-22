import type { Metadata } from "next";
import { StationProvider } from "@/components/station/store";

export const metadata: Metadata = { title: { default: "İstasyonlar", template: "%s · Sky İstasyon" } };

export default function StationLayout({ children }: LayoutProps<"/istasyon">) {
  return <StationProvider>{children}</StationProvider>;
}
