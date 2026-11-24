import { ordersHref } from "@/features/shop-orders/paths";
import { countOrdersAwaitingPacking, UNCOUNTED } from "@/features/shop-orders/server/orders";
import { getDb } from "@/shared/db";
import { formatNumber } from "@/shared/format";
import type { FeatureNav } from "@/shared/nav/types";

/** "รอจัดของ" คือคำสั่งซื้อที่จ่ายแล้ว นับไม่ได้ให้ขึ้น "–" โดยเมนูส่วนอื่นยังใช้ได้ (ORD-004) */
export function awaitingPackingLabel(shopId: number): string {
  try {
    return `รอจัดของ ${formatNumber(countOrdersAwaitingPacking(getDb(), shopId))}`;
  } catch (error) {
    console.error(error);
    return `รอจัดของ ${UNCOUNTED}`;
  }
}

export const nav: FeatureNav = {
  header: [],
  sellerMenu: [
    { label: "คำสั่งซื้อ", href: ordersHref(), order: 30 },
    { label: awaitingPackingLabel, href: ordersHref({ status: "paid" }), order: 31 },
  ],
};
