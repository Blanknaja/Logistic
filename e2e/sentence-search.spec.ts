// ค้นหาด้วยประโยค (docs/requirements/sentence-search.md)
// พิมพ์ประโยคในช่องค้นหาของแถบด้านบน ระบบบอกก่อนว่าจะค้นอะไร แล้วเปลี่ยนเป็นตัวกรองที่เอาออกได้ทีละอัน

import { expect, test, type Page } from "@playwright/test";

const SENTENCE = "รองเท้าไม่เกิน 500 ถูกสุด";
const searchBox = (page: Page) => page.getByRole("search").getByLabel("คำค้น");
const preview = (page: Page) => page.locator(".search-preview");
const cardPrices = async (page: Page) =>
  (await page.getByRole("main").locator('a[href^="/products/"] span:text-matches("^฿")').allTextContents()).map((text) =>
    Number(text.replace(/[฿,]/g, "")),
  );

async function shoot(page: Page, name: string) {
  if (process.env.SCREENSHOTS) await page.screenshot({ path: `docs/screenshots/sentence-search/${name}.png` });
}

for (const width of [360, 1440]) {
  test.describe(`จอกว้าง ${width} จุด`, () => {
    test.use({ viewport: { width, height: width === 360 ? 780 : 900 } });

    test("SNT-011 SNT-008 พิมพ์ประโยค เห็นก่อนว่าจะค้นอะไร กดค้นหาแล้วได้ตัวกรองที่เอาออกได้ทีละอัน", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("main").locator('a[href^="/products/"] img').first()).toBeVisible();
      await expect(preview(page)).toBeHidden();

      await searchBox(page).focus();
      await expect(preview(page)).toHaveText("พิมพ์เป็นประโยคได้ เช่น “รองเท้าไม่เกิน 500 ถูกสุด”");
      await shoot(page, `hint-${width}`);

      await searchBox(page).fill("เสื้อ");
      await expect(preview(page)).toBeHidden();

      await searchBox(page).fill(SENTENCE);
      await expect(preview(page)).toHaveText("จะค้นหา “รองเท้า” · ราคาไม่เกิน ฿500 · เรียงราคาต่ำไปสูง");
      await shoot(page, `preview-${width}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

      await searchBox(page).press("Enter");
      await expect(page.getByText(/^พบ \d+ รายการ สำหรับ "รองเท้า"$/)).toBeVisible();
      await expect(searchBox(page)).toHaveValue(SENTENCE);
      const active = page.getByRole("list", { name: "ตัวกรองที่ใช้อยู่" });
      await expect(active.getByRole("link", { name: "เอา ราคาไม่เกิน ฿500 ออก" })).toBeVisible();
      await expect(active.getByRole("link", { name: "เอา เรียงราคาต่ำไปสูง ออก" })).toBeVisible();

      const prices = await cardPrices(page);
      expect(prices.length).toBeGreaterThan(0);
      expect(Math.max(...prices)).toBeLessThanOrEqual(500);
      expect(prices).toEqual(prices.toSorted((a, b) => a - b));
      for (const link of await active.getByRole("link").all()) {
        expect((await link.boundingBox())!.height, "SNT-Q03").toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await searchBox(page).blur();
      await shoot(page, `results-${width}`);

      await active.getByRole("link", { name: "เอา ราคาไม่เกิน ฿500 ออก" }).click();
      await expect(page).toHaveURL(/\?q=%E0%B8%A3%E0%B8%AD%E0%B8%87%E0%B9%80%E0%B8%97%E0%B9%89%E0%B8%B2&sort=price-asc$/);
      await expect(searchBox(page)).toHaveValue("รองเท้า");
      await expect(page.getByRole("link", { name: "เอา ราคาไม่เกิน ฿500 ออก" })).toHaveCount(0);
    });
  });
}

test("SNT-006 หมวดหมู่ในประโยค เลือกหมวดหมู่นั้นให้", async ({ page }) => {
  await page.goto("/");
  await searchBox(page).fill("หมวดสัตว์เลี้ยง 100 ถึง 500");
  await expect(preview(page)).toHaveText("จะค้นหา สัตว์เลี้ยง · ราคา ฿100 ถึง ฿500");
  await searchBox(page).press("Enter");

  await expect(page.getByRole("link", { name: "เอา ราคา ฿100 ถึง ฿500 ออก" })).toHaveAttribute("href", "/?category=11");
  await expect(page.getByRole("navigation", { name: "หมวดหมู่" }).getByRole("link", { name: "สัตว์เลี้ยง" })).toHaveAttribute("aria-current", "page");
});

test("SNT-008 ช่วงราคาในประโยคกลับด้าน บอกข้อผิดพลาดใต้ช่องราคาเหมือนกรอกเอง", async ({ page }) => {
  await page.goto("/");
  await searchBox(page).fill("เสื้อ 500 ถึง 100");
  await searchBox(page).press("Enter");

  await expect(page.getByText("ราคาต่ำสุดต้องไม่มากกว่าราคาสูงสุด")).toBeVisible();
  await expect(page.getByRole("link", { name: /^เอา ราคา/ })).toHaveCount(0);
});

test("SNT-002 ราคาในประโยคเกิน 1,000,000 บาท บอกข้อผิดพลาดใต้ช่องราคา", async ({ page }) => {
  await page.goto("/");
  await searchBox(page).fill("หูฟังตั้งแต่ 2000000");
  await searchBox(page).press("Enter");

  await expect(page.getByText("ราคาต้องไม่เกิน 1,000,000 บาท")).toBeVisible();
});

test("SNT-005 ประโยคที่บอกการเรียง ช่องเลือกการเรียงแสดงแบบนั้น และค่าจากประโยคชนะตัวกรองในที่อยู่ของหน้า", async ({ page }) => {
  await page.goto(`/?q=${encodeURIComponent(SENTENCE)}&max=9000&sort=price-desc`);

  await expect(page.getByLabel("เรียงตาม")).toHaveValue("price-asc");
  await expect(page.getByLabel("ราคาสูงสุด")).toHaveValue("500");
});

test("SNT-010 เลขติดตามพัสดุในช่องค้นหาสินค้า พาไปหน้าติดตามพัสดุ", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("อีเมล").fill("buyer3@example.com");
  await page.getByLabel("รหัสผ่าน").fill("demo1234");
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");

  await searchBox(page).fill("bs0000000001");
  await expect(preview(page)).toHaveText("จะเปิดหน้าติดตามพัสดุ BS0000000001");
  await searchBox(page).press("Enter");

  await expect(page).toHaveURL(/\/track\?no=BS0000000001$/);
  await expect(page.getByRole("main")).toContainText("ไม่พบ");
});

test("ประโยคทำงานแม้ JavaScript ของแอปโหลดไม่ได้", async ({ page }) => {
  await page.route("**/_next/static/**/*.js", (route) => route.abort());
  await page.goto(`/?q=${encodeURIComponent(SENTENCE)}`);

  await expect(page.getByRole("link", { name: "เอา ราคาไม่เกิน ฿500 ออก" })).toBeVisible();
  await searchBox(page).focus();
  await expect(preview(page)).toBeHidden();
});

test("SNT-Q02 หน้าผลลัพธ์ของประโยคแสดงภายใน 2 วินาที ใน 95 จาก 100 ครั้ง", async ({ request }) => {
  const times: number[] = [];
  for (let i = 0; i < 100; i++) {
    const started = performance.now();
    const response = await request.get(`/?q=${encodeURIComponent(SENTENCE)}`);
    expect(await response.text()).toContain("เอา ราคาไม่เกิน ฿500 ออก");
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  console.log(`SNT-Q02 p50 ${Math.round(times[49])} p95 ${Math.round(times[94])} ช้าสุด ${Math.round(times[99])} มิลลิวินาที`);
  expect(times[94]).toBeLessThan(2000);
});
