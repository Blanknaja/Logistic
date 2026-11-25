import { countCartItems } from "@/features/cart/server/cart";
import { getDb } from "@/shared/db";
import type { FeatureNav } from "@/shared/nav/types";

/** ตัวเลขนับจำนวนรายการ ไม่ใช่จำนวนชิ้น ตะกร้าว่างไม่แสดงตัวเลข (CRT-001 CRT-007) */
export function cartLabel(count: number): string {
  return count > 0 ? `ตะกร้า (${count})` : "ตะกร้า";
}

export const nav: FeatureNav = {
  header: [{ label: (viewer) => cartLabel(viewer ? countCartItems(getDb(), viewer.id) : 0), href: "/cart", order: 20 }],
  sellerMenu: [],
};
