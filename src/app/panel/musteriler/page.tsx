import type { Metadata } from "next";
import { CustomerList } from "@/components/admin/customer-list";

export const metadata: Metadata = { title: "Müşteriler" };

export default function CustomersPage() {
  return <CustomerList />;
}
