// หน้าแรกกับฟอร์มร้านหลังปรับ UX (browse.md และ shop.md ส่วนสมมติฐาน 2026-11-25)
// สินค้าเริ่มในจอแรก ตัวกรองพับไว้บนจอเล็ก และช่องเลือกโลโก้ภาษาไทยที่ใช้ได้ด้วยแป้นพิมพ์และไม่ต้องรอ JavaScript

import { expect, test, type Page } from "@playwright/test";

/**
 * ไฟล์ JavaScript ของแอปโหลดไม่ได้ หน้ายังแสดงครบเพราะสคริปต์ที่ฝังในหน้าทำงาน แต่ React ไม่เริ่มทำงาน
 * ใช้แทนการปิด JavaScript ทั้งหมด เพราะเนื้อหาของหน้าส่งมาทีหลังโครงหน้ากำลังโหลด และต้องใช้สคริปต์ที่ฝังในหน้าสลับเข้าที่
 */
async function withoutAppScripts(page: Page) {
  await page.route("**/_next/static/**/*.js", (route) => route.abort());
}

const firstProductImage = (page: Page) => page.getByRole("main").locator('a[href^="/products/"] img').first();
const filterToggle = (page: Page) => page.locator("summary", { hasText: "ตัวกรอง" });

async function signInAsBuyer(page: Page) {
  await page.goto("/login");
  await page.getByLabel("อีเมล").fill("buyer3@example.com");
  await page.getByLabel("รหัสผ่าน").fill("demo1234");
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
}

test.describe("จอกว้าง 390 จุด", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("รูปสินค้าเริ่มในจอแรก ช่วงราคาพับไว้หลังปุ่มตัวกรอง และกรองแล้วบรรทัดจำนวนผลลัพธ์บอกช่วงราคา", async ({ page }) => {
    await page.goto("/");
    await expect(firstProductImage(page)).toBeVisible();
    expect((await firstProductImage(page).boundingBox())!.y).toBeLessThan(844);
    await expect(page.getByLabel("ราคาต่ำสุด")).toBeHidden();

    await filterToggle(page).click();
    await page.getByLabel("ราคาต่ำสุด").fill("100");
    await page.getByLabel("ราคาสูงสุด").fill("500");
    await page.getByRole("button", { name: "ใช้ตัวกรอง" }).click();

    await expect(page).toHaveURL(/min=100&max=500/);
    await expect(page.getByText("ราคา ฿100 ถึง ฿500")).toBeVisible();
    await expect(page.getByLabel("ราคาต่ำสุด")).toBeHidden();
  });

  test("JavaScript ของแอปโหลดไม่ได้ ก็กางตัวกรองได้", async ({ page }) => {
    await withoutAppScripts(page);
    await page.goto("/");
    await filterToggle(page).click();
    await expect(page.getByLabel("ราคาต่ำสุด")).toBeVisible();
  });
});

test("จอกว้าง 1440 จุด ตัวกรองอยู่ในแถวเดียวกับจำนวนผลลัพธ์โดยไม่ต้องกด และรูปสินค้าเริ่มในจอแรก", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  // หลัง load เนื้อหาที่ส่งตามมาอาจยังรอ React สลับเข้าที่ และฟอนต์ที่ยังไม่มาทำให้แถวหมวดหมู่ขึ้นบรรทัดต่างกัน จึงรอทั้งสองก่อนวัด
  const resultCount = page.getByText(/^พบ [\d,]+ รายการ$/);
  await expect(resultCount).toBeVisible();
  await expect(firstProductImage(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(filterToggle(page)).toBeHidden();
  const count = (await resultCount.boundingBox())!;
  const sort = (await page.getByLabel("เรียงตาม").boundingBox())!;
  expect(Math.abs(count.y + count.height / 2 - (sort.y + sort.height / 2))).toBeLessThan(12);
  expect((await firstProductImage(page).boundingBox())!.y).toBeLessThan(900);
});

test("ฟอร์มเปิดร้าน: กดเปิดร้านตอนยังไม่กรอก เคอร์เซอร์ไปช่องแรกที่ผิด และเลือกโลโก้ด้วยแป้นพิมพ์ได้", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsBuyer(page);
  await page.goto("/open-shop");

  await page.getByRole("button", { name: "เปิดร้าน" }).click();
  await expect(page.getByText("ชื่อร้านต้องมี 3 ถึง 30 ตัวอักษร")).toBeVisible();
  await expect(page.getByLabel("ชื่อร้าน")).toBeFocused();

  await page.getByLabel("คำอธิบายร้าน (ไม่บังคับ)").focus();
  await page.keyboard.press("Tab");
  const logo = page.locator("#field-logo");
  await expect(logo).toBeFocused();
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (await chooser).setFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });
  await expect(page.locator('label[for="field-logo"]', { hasText: "เปลี่ยนรูป" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ลบโลโก้" })).toBeVisible();
});

test("ฟอร์มเปิดร้าน: JavaScript ของแอปโหลดไม่ได้ ก็กดป้าย เลือกรูป แล้วเปิดช่องเลือกไฟล์ได้", async ({ page }) => {
  await signInAsBuyer(page);
  await withoutAppScripts(page);
  await page.goto("/open-shop");

  const chooser = page.waitForEvent("filechooser");
  await page.locator('label[for="field-logo"]', { hasText: "เลือกรูป" }).click();
  expect((await chooser).isMultiple()).toBe(false);
});
