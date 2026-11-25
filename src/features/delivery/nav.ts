import type { FeatureNav } from "@/shared/nav/types";

export const nav: FeatureNav = {
  header: [{ label: "ติดตามพัสดุ", href: "/track", order: 40, visibleTo: (viewer) => viewer !== null }],
  sellerMenu: [],
};
