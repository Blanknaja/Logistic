import type { FeatureNav } from "@/shared/nav/types";

export const nav: FeatureNav = {
  header: [
    { label: "คำสั่งซื้อ", href: "/orders", order: 30, visibleTo: (viewer) => viewer !== null },
    { label: "ที่อยู่จัดส่ง", href: "/addresses", order: 31, visibleTo: (viewer) => viewer !== null },
  ],
  sellerMenu: [],
};
