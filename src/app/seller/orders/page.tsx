import { OrderListView } from "@/features/shop-orders/components/order-list";
import { ordersHref, parseListParams } from "@/features/shop-orders/paths";
import { requireShop } from "@/features/shop/require-shop";
import { countShopOrders, listShopOrders, shopOrdersVersion } from "@/features/shop-orders/server/orders";
import { getDb } from "@/shared/db";
import { ORDER_STATUS } from "@/shared/statuses";

export default async function SellerOrdersPage({ searchParams }: PageProps<"/seller/orders">) {
  const { shopId } = await requireShop(ordersHref());
  const params = parseListParams(await searchParams);
  const db = getDb();
  // อ่าน version ก่อนรายการ คำสั่งซื้อที่เข้ามาระหว่างนี้จึงถูกจับได้ในรอบถามถัดไป
  const version = shopOrdersVersion(db, shopId);
  const list = listShopOrders(db, shopId, {
    status: params.status && ORDER_STATUS[params.status],
    q: params.q,
    page: params.page,
    asOf: params.asOf,
  });
  // ตัวกรองทั้งหมดแสดงคำสั่งซื้อที่รอจัดของเป็นกลุ่มแรก ใช้ asOf เดียวกับรายการ จึงไม่แทรกคำสั่งซื้อใหม่เอง
  const awaitingPacking =
    !params.status && !params.q ? listShopOrders(db, shopId, { status: ORDER_STATUS.paid, q: "", page: 1, asOf: list.asOf }) : null;
  return (
    <OrderListView
      params={params}
      counts={countShopOrders(db, shopId)}
      list={list}
      awaitingPacking={awaitingPacking}
      version={version}
    />
  );
}
