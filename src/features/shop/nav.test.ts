import { describe, expect, test } from "vitest";
import type { CurrentAccount } from "@/features/account/server/sessions";
import { nav } from "@/features/shop/nav";
import { headerLinks, sellerMenuLinks } from "@/shared/nav/registry";

const somchai: CurrentAccount = { id: 1, email: "somchai@example.com", displayName: "สมชาย", isAdmin: false, shopId: null };

describe("SHP-001 ทางเข้าเปิดร้านและร้านของฉัน", () => {
  test("SHP-001 ยังไม่มีร้าน เห็นเมนูเปิดร้าน 1 รายการที่พาไปหน้าเปิดร้าน และไม่เห็นร้านของฉัน", () => {
    expect(headerLinks(somchai, [nav])).toEqual([{ label: "เปิดร้าน", href: "/open-shop" }]);
  });

  test("SHP-001 มีร้านแล้ว เห็นเมนูร้านของฉัน 1 รายการที่พาไปหน้าแรกของหลังบ้าน และไม่เห็นเปิดร้าน", () => {
    expect(headerLinks({ ...somchai, shopId: 7 }, [nav])).toEqual([{ label: "ร้านของฉัน", href: "/seller" }]);
  });

  test("SHP-001 ยังไม่เข้าสู่ระบบ ไม่เห็นทั้งสองเมนู", () => {
    expect(headerLinks(null, [nav])).toEqual([]);
  });

  test("SHP-005 ผู้ดูแลแพลตฟอร์มไม่เห็นเมนูเปิดร้าน", () => {
    expect(headerLinks({ ...somchai, isAdmin: true }, [nav])).toEqual([]);
  });
});

describe("SHP-006 ทางเข้าจากหลังบ้านของร้าน", () => {
  test("SHP-006 เมนูหลังบ้านมีหน้าตั้งค่าร้าน และหน้าร้านของร้านตัวเอง", () => {
    expect(sellerMenuLinks(7, [nav])).toEqual([
      { label: "ตั้งค่าร้าน", href: "/seller/settings" },
      { label: "หน้าร้าน", href: "/shops/7" },
    ]);
  });
});
