import type { FeatureNav } from "@/shared/nav/types";

export const nav: FeatureNav = {
  header: [
    { label: "เข้าสู่ระบบ", href: "/login", order: 90, visibleTo: (viewer) => viewer === null },
    { label: "สมัครบัญชี", href: "/signup", order: 91, visibleTo: (viewer) => viewer === null },
    { label: (viewer) => viewer?.displayName ?? "", href: "/profile", order: 99, visibleTo: (viewer) => viewer !== null },
  ],
  sellerMenu: [],
};
