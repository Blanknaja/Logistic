import { describe, expect, test } from "vitest";
import { hashPassword, hashPasswordSync, verifyPassword } from "@/features/account/server/password";

describe("รหัสผ่าน", () => {
  test("เก็บเป็นค่า hash ไม่ใช่ตัวรหัสผ่าน และตรวจกลับได้", async () => {
    const stored = await hashPassword("demo1234");
    expect(stored).not.toContain("demo1234");
    expect(stored).toMatch(/^scrypt\$/);
    expect(await verifyPassword("demo1234", stored)).toBe(true);
    expect(await verifyPassword("demo12345", stored)).toBe(false);
  });

  test("รหัสเดียวกันได้ hash ต่างกัน เพราะสุ่ม salt ทุกครั้ง", async () => {
    expect(await hashPassword("demo1234")).not.toBe(await hashPassword("demo1234"));
  });

  test("hash แบบ sync ตรวจด้วยตัวตรวจปกติได้", async () => {
    expect(await verifyPassword("demo1234", hashPasswordSync("demo1234"))).toBe(true);
  });

  test("ค่า hash ที่เสียหายตอบว่าไม่ตรง ไม่โยน error", async () => {
    expect(await verifyPassword("demo1234", "")).toBe(false);
    expect(await verifyPassword("demo1234", "scrypt$1$2$3$xx$yy")).toBe(false);
    expect(await verifyPassword("demo1234", "md5$abc")).toBe(false);
  });
});
