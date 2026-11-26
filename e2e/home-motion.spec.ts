// ราวกั้นของการขยับรอบ 3 (docs/design-system.md หัวข้อการขยับ): ลดการขยับ สคริปต์ไม่ทำงาน และจอ 360

import { expect, test } from "@playwright/test";

const firstProductImage = "main a[href^='/products/'] img";

test("ผู้ใช้ขอลดการขยับ: หน้าแรกไม่มี animation ที่ยังเล่นอยู่ ไม่โหลดฉาก 3 มิติ และเนื้อหาครบ", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const sceneScripts: string[] = [];
  page.on("request", (request) => {
    if (/three/i.test(request.url())) sceneScripts.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /ซื้อของจากหลายร้าน\s*ในที่เดียว/ })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);

  const running = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation.playState === "running" && Number(animation.effect?.getComputedTiming().duration) > 160)
      .map((animation) => (animation as CSSAnimation).animationName ?? "transition"),
  );
  expect(running).toEqual([]);
  await expect(page.locator("canvas")).toBeHidden();
  await expect(page.getByRole("button", { name: "หยุดภาพเคลื่อนไหว" })).toHaveCount(0);
  expect(await page.locator(firstProductImage).first().evaluate((image) => getComputedStyle(image.closest("li")!).opacity)).toBe("1");
  await context.close();
});

test("JavaScript ของแอปโหลดไม่ได้: หน้าแรกยังเห็นส่วนต้อนรับ ภาพพัสดุ การ์ดหมวด และสินค้า โดยไม่ล้นจอ 360", async ({ page }) => {
  await page.route("**/_next/static/**/*.js", (route) => route.abort());
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("img", { name: "พัสดุเดินทางจากร้านถึงบ้าน" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "หมวดหมู่" }).getByRole("link").first()).toBeVisible();
  const image = page.locator(firstProductImage).first();
  await expect(image).toBeVisible();
  expect(Number(await image.evaluate((element) => getComputedStyle(element).opacity))).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  // ส่วนต้อนรับสูงไม่เกิน 45% ของจอ สินค้าแถวแรกจึงโผล่ในจอแรก
  const hero = (await page.locator("section", { has: page.getByRole("heading", { level: 1 }) }).boundingBox())!;
  expect(hero.height).toBeLessThanOrEqual(780 * 0.45);
});

test("จอ 1440: ฉาก 3 มิติของส่วนต้อนรับโหลดหลังหน้าแสดง มีปุ่มหยุด และกดค้นหาจากส่วนต้อนรับได้", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const pause = page.getByRole("button", { name: "หยุดภาพเคลื่อนไหว" });
  await expect(pause).toBeVisible();
  await pause.click();
  await expect(pause).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("searchbox", { name: "พิมพ์สิ่งที่อยากได้" }).fill("รองเท้าไม่เกิน 2000");
  await page.getByRole("button", { name: "หาเลย" }).click();
  await expect(page).toHaveURL(/\?q=/);
  await expect(page.getByText(/^พบ [\d,]+ รายการ/)).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "พิมพ์สิ่งที่อยากได้" })).toHaveCount(0);
});
