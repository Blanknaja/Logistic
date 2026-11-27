import { notFound } from "next/navigation";
import { OrderDetailView } from "@/features/shop-orders/components/order-detail";
import { orderHref, ordersHref, parseListParams } from "@/features/shop-orders/paths";
import { requireShop } from "@/features/shop/require-shop";
import { findOrderParcel, getShopOrder, shopOrdersVersion, type ParcelSummary } from "@/features/shop-orders/server/orders";
import { getDb } from "@/shared/db";
import { PageReveal } from "@/shared/ui/transitions";

export default async function SellerOrderPage({ params, searchParams }: PageProps<"/seller/orders/[orderNo]">) {
  const { orderNo } = await params;
  const { shopId } = await requireShop(orderHref(orderNo));
  const db = getDb();
  const version = shopOrdersVersion(db, shopId);
  const order = getShopOrder(db, shopId, orderNo);
  if (!order) notFound();

  let parcel: ParcelSummary | null | "unavailable";
  try {
    parcel = findOrderParcel(db, order.id);
  } catch (error) {
    console.error(error);
    parcel = "unavailable";
  }

  const backHref = ordersHref(parseListParams(await searchParams));
  return (
    <PageReveal>
      <OrderDetailView order={order} parcel={parcel} backHref={backHref} version={version} />
    </PageReveal>
  );
}
