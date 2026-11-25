import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { CurrentAccount } from "@/features/account/server/sessions";
import { featureNavs, headerLinks, sellerMenuLinks } from "@/shared/nav/registry";
import type { FeatureNav } from "@/shared/nav/types";

const seller: CurrentAccount = { id: 1, email: "a@example.com", displayName: "ก", isAdmin: false, shopId: 7 };

const navs: FeatureNav[] = [
  {
    header: [
      { label: "ร้านของฉัน", href: "/seller", order: 50, visibleTo: (viewer) => viewer?.shopId != null },
      { label: "เข้าสู่ระบบ", href: "/login", order: 90, visibleTo: (viewer) => viewer === null },
    ],
    sellerMenu: [{ label: "หน้าร้าน", href: (shopId) => `/shops/${shopId}`, order: 50 }],
  },
  {
    header: [{ label: "หน้าแรก", href: "/", order: 10 }],
    sellerMenu: [{ label: "สินค้า", href: "/seller/products", order: 10 }],
  },
];

describe("แถบนำทาง", () => {
  test("ทุกโฟลเดอร์ใน src/features มี nav.ts ที่ลงทะเบียนไว้แล้ว", () => {
    const folders = readdirSync(join(process.cwd(), "src/features"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(Object.keys(featureNavs).sort()).toEqual(folders);
  });

  test("แสดงเฉพาะลิงก์ที่คนนี้ควรเห็น เรียงตาม order", () => {
    expect(headerLinks(null, navs).map((link) => link.label)).toEqual(["หน้าแรก", "เข้าสู่ระบบ"]);
    expect(headerLinks(seller, navs).map((link) => link.label)).toEqual(["หน้าแรก", "ร้านของฉัน"]);
  });

  test("เมนูหลังบ้านเติมเลขร้านให้ลิงก์ที่ต้องใช้", () => {
    expect(sellerMenuLinks(7, navs)).toEqual([
      { label: "สินค้า", href: "/seller/products" },
      { label: "หน้าร้าน", href: "/shops/7" },
    ]);
  });
});
