// แถบด้านบน (product.md ส่วนที่ 8): จอเล็กเป็นแถวเดียว ลิงก์อื่นอยู่ในปุ่มเมนู จอ 900 ขึ้นไปลิงก์เรียงในแถวเดียวกัน

import { expect, test, type Page } from "@playwright/test";

const menu = (page: Page) => page.getByRole("navigation", { name: "เมนูหลัก" });

test.describe("จอกว้าง 390 จุด", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("แถบด้านบนเป็นแถวเดียว ปุ่มเมนูเปิดด้วยเมาส์และแป้นพิมพ์ ปิดด้วย Escape และปิดเองเมื่อไปหน้าอื่น", async ({ page }) => {
    await page.goto("/");
    expect((await page.getByRole("banner").boundingBox())!.height).toBeLessThanOrEqual(57);
    const button = menu(page).getByRole("button", { name: "เมนู" });
    const login = menu(page).getByRole("link", { name: "เข้าสู่ระบบ" });
    await expect(menu(page).getByRole("link", { name: "ตะกร้า", exact: true })).toBeVisible();
    await expect(login).toBeHidden();

    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(login).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toBeFocused();
    await expect(login).toBeHidden();

    await page.keyboard.press("Enter");
    await expect(login).toBeVisible();
    await login.click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(login).toBeHidden();
  });

  test("ค้นหาจากแถบด้านบนของหน้าอื่นด้วยปุ่ม Enter ไปหน้าผลการค้นหา และคำค้นยังอยู่ในช่อง", async ({ page }) => {
    await page.goto("/login");
    const search = page.getByRole("searchbox", { name: "คำค้น" });
    await search.fill("เก้าอี้");
    await search.press("Enter");
    await expect(page).toHaveURL(/\/\?q=/);
    await expect(search).toHaveValue("เก้าอี้");
  });

  test("ไม่มี JavaScript ก็เปิดเมนูและกดลิงก์ได้", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    await menu(page).locator("summary").click();
    await expect(menu(page).getByRole("link", { name: "สมัครบัญชี" })).toBeVisible();
    await context.close();
  });
});

test("จอกว้าง 1440 จุด ลิงก์เรียงในแถวเดียวกับโลโก้ และไม่มีปุ่มเมนู", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const logo = (await menu(page).getByRole("link", { name: "Blanksong" }).boundingBox())!;
  const signup = (await menu(page).getByRole("link", { name: "สมัครบัญชี" }).boundingBox())!;
  expect(Math.abs(logo.y + logo.height / 2 - (signup.y + signup.height / 2))).toBeLessThan(4);
  await expect(menu(page).getByRole("button", { name: "เมนู" })).toBeHidden();
});
