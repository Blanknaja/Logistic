import type { CurrentAccount } from "@/features/account/server/sessions";
import { countCartItems } from "@/features/cart/server/cart";
import { getDb } from "@/shared/db";
import type { FeatureNav } from "@/shared/nav/types";

/** ตัวเลขที่ไอคอนตะกร้านับจำนวนรายการ ไม่ใช่จำนวนชิ้น คนที่ยังไม่เข้าสู่ระบบไม่มีตะกร้า (CRT-001 CRT-007) */
export function cartCount(viewer: CurrentAccount | null): number {
  return viewer ? countCartItems(getDb(), viewer.id) : 0;
}

/** ชื่อของไอคอนตะกร้า ตะกร้าว่างไม่มีตัวเลข */
export function cartLabel(count: number): string {
  return count > 0 ? `ตะกร้า (${count})` : "ตะกร้า";
}

// ไอคอนตะกร้าอยู่ใน SiteHeader เอง เพราะต้องอยู่นอกเมนูให้เห็นทุกขนาดจอ
export const nav: FeatureNav = {
  header: [],
  sellerMenu: [],
};
