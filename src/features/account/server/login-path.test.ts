import { describe, expect, test } from "vitest";
import { isLoginNotice, loginPath, safeNextPath } from "@/features/account/server/login-path";

describe("ACC-008 พากลับหน้าเดิมหลังเข้าสู่ระบบ", () => {
  test("ACC-008 ที่อยู่หน้าเข้าสู่ระบบจำหน้าที่ตั้งใจเปิดไว้", () => {
    expect(loginPath("/profile")).toBe("/login?next=%2Fprofile");
    expect(loginPath("/orders/2611240001?tab=parcel", "relogin")).toBe(
      "/login?next=%2Forders%2F2611240001%3Ftab%3Dparcel&notice=relogin",
    );
    expect(safeNextPath("/orders/2611240001?tab=parcel")).toBe("/orders/2611240001?tab=parcel");
  });

  test("ACC-008 next ที่พาไปเว็บอื่นหรือไม่ใช่ที่อยู่ ได้หน้าแรกแทน", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "profile", "", undefined, ["/a"]]) {
      expect(safeNextPath(bad)).toBe("/");
    }
    expect(loginPath("//evil.example")).toBe("/login?next=%2F");
  });

  test("ACC-008 รับเฉพาะชื่อข้อความที่หน้าเข้าสู่ระบบรู้จัก", () => {
    expect(isLoginNotice("relogin")).toBe(true);
    expect(isLoginNotice("password-reset")).toBe(true);
    expect(isLoginNotice("toString")).toBe(false);
    expect(isLoginNotice(["relogin"])).toBe(false);
  });
});
