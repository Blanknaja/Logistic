import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderDetail } from "@/features/checkout/components/order-detail";
import { getBuyerOrder } from "@/features/checkout/server/buyer-orders";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";

export const metadata: Metadata = { title: "รายละเอียดคำสั่งซื้อ" };

export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[orderNo]">) {
  const { orderNo } = await params;
  const { cancel, notice } = await searchParams;
  const viewer = await requireAccount(`/orders/${encodeURIComponent(orderNo)}`);
  const order = getBuyerOrder(getDb(), viewer.id, orderNo);
  if (!order) notFound();

  return <OrderDetail order={order} confirmingCancel={cancel === "1"} notice={notice} />;
}
