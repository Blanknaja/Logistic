import type { FeatureNav } from "@/shared/nav/types";

export const nav: FeatureNav = {
  header: [
    // ผู้ดูแลแพลตฟอร์มเปิดร้านไม่ได้ (SHP-005) จึงไม่เห็นเมนูนี้
    { label: "เปิดร้าน", href: "/open-shop", order: 50, visibleTo: (viewer) => viewer?.shopId === null && !viewer.isAdmin },
    { label: "ร้านของฉัน", href: "/seller", order: 50, visibleTo: (viewer) => viewer?.shopId != null },
  ],
  sellerMenu: [
    { label: "ตั้งค่าร้าน", href: "/seller/settings", order: 40 },
    { label: "หน้าร้าน", href: (shopId) => `/shops/${shopId}`, order: 50 },
  ],
};
