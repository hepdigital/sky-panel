import type { Metadata } from "next";
import { AccountView } from "@/components/portal/account-view";

export const metadata: Metadata = { title: "Cari Hesap" };

export default function AccountPage() {
  return <AccountView />;
}
