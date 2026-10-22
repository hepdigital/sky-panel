import type { Metadata } from "next";
import { OrderDetail, OrderDetailFallback } from "@/components/portal/order-detail";
import { getOrder, recentOrders } from "@/lib/mock";

export function generateStaticParams() {
  return recentOrders.map((o) => ({ id: o.id }));
}

export async function generateMetadata({ params }: PageProps<"/portal/siparisler/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: id };
}

export default async function OrderPage({ params }: PageProps<"/portal/siparisler/[id]">) {
  const { id } = await params;
  const order = getOrder(id);
  if (!order) return <OrderDetailFallback />;
  return <OrderDetail order={order} />;
}
