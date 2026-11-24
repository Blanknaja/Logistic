import { describe, expect, test } from "vitest";
import { nav } from "@/features/account/nav";
import type { CurrentAccount } from "@/features/account/server/sessions";
import { headerLinks } from "@/shared/nav/registry";

const somchai: CurrentAccount = { id: 1, email: "somchai@example.com", displayName: "สมชาย", isAdmin: false, shopId: null };

describe("แถบด้านบนของ account", () => {
  test("ACC-001 เข้าสู่ระบบแล้ว มุมบนแสดงชื่อที่แสดงและพาไปหน้าโปรไฟล์", () => {
    expect(headerLinks(somchai, [nav])).toEqual([{ label: "สมชาย", href: "/profile" }]);
  });

  test("ACC-007 ยังไม่เข้าสู่ระบบหรือออกจากระบบแล้ว เห็นปุ่มเข้าสู่ระบบแทนชื่อ", () => {
    expect(headerLinks(null, [nav])).toEqual([
      { label: "เข้าสู่ระบบ", href: "/login" },
      { label: "สมัครบัญชี", href: "/signup" },
    ]);
  });
});
