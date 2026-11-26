import { nav as account } from "@/features/account/nav";
import { nav as browse } from "@/features/browse/nav";
import { nav as cart } from "@/features/cart/nav";
import { nav as checkout } from "@/features/checkout/nav";
import { nav as delivery } from "@/features/delivery/nav";
import { nav as notification } from "@/features/notification/nav";
import { nav as payment } from "@/features/payment/nav";
import { nav as productListing } from "@/features/product-listing/nav";
import { nav as review } from "@/features/review/nav";
import { nav as shop } from "@/features/shop/nav";
import { nav as shopOrders } from "@/features/shop-orders/nav";
import { nav as stock } from "@/features/stock/nav";
import type { CurrentAccount } from "@/features/account/server/sessions";
import type { FeatureNav } from "./types";

// ชื่อตรงกับชื่อโฟลเดอร์ใน src/features มี test ตรวจว่าครบ
// จะเพิ่มลิงก์ ให้แก้ nav.ts ของ feature ตัวเอง ไม่ต้องแก้ไฟล์นี้
export const featureNavs: Record<string, FeatureNav> = {
  account,
  browse,
  cart,
  checkout,
  delivery,
  notification,
  payment,
  "product-listing": productListing,
  review,
  shop,
  "shop-orders": shopOrders,
  stock,
};

const byOrder = (a: { order: number; label: string }, b: { order: number; label: string }) =>
  a.order - b.order || a.label.localeCompare(b.label);

export function headerLinks(
  viewer: CurrentAccount | null,
  navs: FeatureNav[] = Object.values(featureNavs),
): { label: string; href: string }[] {
  return navs
    .flatMap((nav) => nav.header)
    .filter((link) => !link.visibleTo || link.visibleTo(viewer))
    .map(({ label, href, order }) => ({ label: typeof label === "function" ? label(viewer) : label, href, order }))
    .sort(byOrder)
    .map(({ label, href }) => ({ label, href }));
}

export function sellerMenuLinks(
  shopId: number,
  navs: FeatureNav[] = Object.values(featureNavs),
): { label: string; href: string }[] {
  return navs
    .flatMap((nav) => nav.sellerMenu)
    .map(({ label, href, order }) => ({
      label: typeof label === "function" ? label(shopId) : label,
      href: typeof href === "function" ? href(shopId) : href,
      order,
    }))
    .sort(byOrder)
    .map(({ label, href }) => ({ label, href }));
}
