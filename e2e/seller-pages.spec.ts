// หลังบ้านของร้านกับข้อมูลตัวอย่าง: หน้าต่างยืนยันการลบสินค้า (PRD-009) และแถวของหน้าสต็อกเมื่อสคริปต์ของแอปไม่ทำงาน (INV-004)

import { expect, test, type Page } from "@playwright/test";

async function signInAsSeller(page: Page) {
  await page.goto("/login");
  await page.getByLabel("อีเมล").fill("seller01@example.com");
  await page.getByLabel("รหัสผ่าน").fill("demo1234");
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
}

const firstStockRow = (page: Page) => page.getByRole("main").locator("li", { has: page.getByRole("textbox", { name: /^สต็อก/ }) }).first();

test("PRD-009 ปิดหน้าต่างยืนยันการลบด้วยปุ่ม ยกเลิก หรือ Escape โฟกัสกลับไปที่ ลบสินค้านี้ และสินค้ายังอยู่", async ({ page }) => {
  await signInAsSeller(page);
  await page.goto("/seller/products");
  await page.getByRole("main").locator('a[href^="/seller/products/"]:not([href$="/new"])').first().click();
  const trigger = page.getByRole("button", { name: "ลบสินค้านี้" });
  const dialog = page.getByRole("dialog");

  await trigger.click();
  await expect(dialog.getByRole("button", { name: "ยกเลิก" })).toBeFocused();
  await dialog.getByRole("button", { name: "ยกเลิก" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("heading", { name: "แก้ไขสินค้า" })).toBeVisible();
});

test("INV-004 มีสคริปต์ ปุ่มบันทึกกับยกเลิกขึ้นเมื่อแก้ตัวเลข กดยกเลิกแล้วตัวเลขเดิมกลับมา ปุ่มหาย และโฟกัสอยู่ที่ช่อง", async ({ page }) => {
  await signInAsSeller(page);
  await page.goto("/seller/stock");
  const row = firstStockRow(page);
  const input = row.getByRole("textbox", { name: /^สต็อก/ });
  const original = await input.inputValue();

  await expect(row.getByRole("button", { name: "บันทึก" })).toBeHidden();
  await input.fill("987");
  await expect(row.getByRole("button", { name: "บันทึก" })).toBeVisible();
  await row.getByRole("button", { name: "ยกเลิก" }).click();
  await expect(input).toHaveValue(original);
  await expect(row.getByRole("button", { name: "บันทึก" })).toBeHidden();
  await expect(input).toBeFocused();
});

// ปิดกั้นไฟล์ JavaScript ของแอปแทนการปิด JavaScript ทั้งหมด เพราะเนื้อหาของหน้าสต็อกส่งมาทีหลังโครงหน้ากำลังโหลด
// และต้องใช้สคริปต์ที่ฝังในหน้าสลับเข้าที่ แบบเดียวกับ e2e/browse-and-shop.spec.ts
test("INV-004 JavaScript ของแอปโหลดไม่ได้ ปุ่มบันทึกกับยกเลิกอยู่โดยไม่ต้องแก้ตัวเลข และยกเลิกคืนตัวเลขเดิมโดยไม่บันทึก", async ({ page }) => {
  await signInAsSeller(page);
  await page.route("**/_next/static/**/*.js", (route) => route.abort());
  await page.goto("/seller/stock");
  const row = firstStockRow(page);
  const input = row.getByRole("textbox", { name: /^สต็อก/ });
  const original = await input.inputValue();

  await expect(row.getByRole("button", { name: "บันทึก" })).toBeVisible();
  await expect(row.getByRole("button", { name: "ยกเลิก" })).toBeVisible();
  await input.fill("987");
  await row.getByRole("button", { name: "ยกเลิก" }).click();
  await expect(input).toHaveValue(original);
  expect(new URL(page.url()).pathname).toBe("/seller/stock");
});
