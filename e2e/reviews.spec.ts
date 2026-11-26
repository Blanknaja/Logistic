// รีวิวและให้คะแนน (review.md) ผ่านหน้าเว็บจริงกับข้อมูลตัวอย่าง:
// ผู้ซื้อที่มีคำสั่งซื้อสำเร็จเขียนรีวิวพร้อมรูป รีวิวขึ้นบนหน้าสินค้าและการ์ด ร้านตอบ แล้วผู้ดูแลแพลตฟอร์มซ่อนจนคะแนนเฉลี่ยเปลี่ยน
// พร้อมวัด REV-Q04 ที่จอกว้าง 360 จุด

import { deflateSync, crc32 } from "node:zlib";
import { expect, test, type Browser, type Page } from "@playwright/test";

const REVIEW_TEXT = "ลองเขียนรีวิวจาก e2e ของดีแต่กล่องบุบ";
const REPLY_TEXT = "ขอบคุณที่แจ้งครับ ร้านจะแพ็คให้แน่นขึ้น";

/** รูป PNG สีเดียว ไว้ใส่เป็นรูปในรีวิว */
function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [200, 120, 40]).flat())]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function signIn(browser: Browser, email: string, password = "demo1234"): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน").fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
  return page;
}

/** ที่จอกว้าง 360 จุด หน้านี้ไม่ต้องเลื่อนซ้ายขวา (REV-Q04) */
async function expectFits360(page: Page, name: string) {
  const desktop = page.viewportSize()!;
  await page.setViewportSize({ width: 360, height: 780 });
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${name} ล้นจอกว้าง 360 จุด`).toBeLessThanOrEqual(0);
  await page.setViewportSize(desktop);
}

const reviews = (page: Page) => page.locator("#reviews");
/** คะแนนเฉลี่ยกับจำนวนรีวิวของส่วนรีวิวบนหน้าสินค้า เช่น "4.3 (12)" หรือ "ยังไม่มีรีวิว" */
async function ratingSummary(page: Page): Promise<string> {
  await expect(reviews(page).getByRole("heading", { name: "รีวิว", exact: true })).toBeVisible();
  const parts = reviews(page).locator('p:has-text("จาก 5 ดาว") > span');
  if ((await parts.count()) === 0) return "ยังไม่มีรีวิว";
  const count = /^([\d,]+) รีวิว$/.exec((await parts.last().textContent()) ?? "")?.[1];
  return `${await parts.first().textContent()} (${count})`;
}

test("REV ผู้ซื้อเขียนรีวิวพร้อมรูป รีวิวขึ้นบนหน้าสินค้าและการ์ด ร้านตอบรีวิว แล้วผู้ดูแลแพลตฟอร์มซ่อนจนคะแนนเฉลี่ยกลับเป็นค่าเดิม", async ({ browser }) => {
  const buyer = await signIn(browser, "buyer1@example.com");
  let productPath = "";
  let shopPath = "";
  let reviewPath = "";
  let before = "";
  let afterReview = "";

  await test.step("REV-005 ผู้ซื้อเปิดคำสั่งซื้อที่รอรีวิวแล้วกดเขียนรีวิว", async () => {
    await buyer.getByRole("navigation", { name: "เมนูหลัก" }).getByRole("link", { name: "คำสั่งซื้อ" }).click();
    await buyer.getByRole("link", { name: /^รอรีวิว \d+$/ }).click();
    await expect(buyer.getByText(/รอรีวิว \d+ รายการ/).first()).toBeVisible();
    await expectFits360(buyer, "หน้ารายการคำสั่งซื้อที่กรองรอรีวิว");
    await buyer.getByRole("main").locator('a[href^="/orders/"]').first().click();
    await expect(buyer.getByRole("link", { name: "เขียนรีวิว" }).first()).toBeVisible();
    await expectFits360(buyer, "หน้ารายละเอียดคำสั่งซื้อที่มีปุ่มเขียนรีวิว");
    await buyer.getByRole("link", { name: "เขียนรีวิว" }).first().click();
    await expect(buyer.getByRole("heading", { name: "เขียนรีวิว" })).toBeVisible();
  });

  await test.step("จดคะแนนของสินค้าก่อนเขียนรีวิว", async () => {
    productPath = (await buyer.getByRole("main").locator('a[href^="/products/"]').first().getAttribute("href")) ?? "";
    expect(productPath).toMatch(/^\/products\/\d+$/);
    const product = await (await browser.newContext()).newPage();
    await product.goto(productPath);
    before = await ratingSummary(product);
    shopPath = (await product.getByRole("main").locator('a[href^="/shops/"]').first().getAttribute("href")) ?? "";
    expect(shopPath).toMatch(/^\/shops\/\d+$/);
    await product.context().close();
  });

  await test.step("REV-001 REV-002 ผู้ซื้อเลือก 1 ดาว พิมพ์ข้อความ เพิ่มรูป แล้วส่งรีวิว", async () => {
    await buyer.getByRole("button", { name: "ส่งรีวิว" }).click();
    await expect(buyer.getByText("เลือกคะแนน 1 ถึง 5 ดาว")).toBeVisible();

    const star = buyer.locator("label", { has: buyer.getByRole("radio", { name: "1 ดาว" }) });
    const box = (await star.boundingBox())!;
    expect(box.width, "ดาวกว้างอย่างน้อย 44 จุด").toBeGreaterThanOrEqual(44);
    expect(box.height, "ดาวสูงอย่างน้อย 44 จุด").toBeGreaterThanOrEqual(44);
    await star.click();
    await expect(buyer.getByRole("radio", { name: "1 ดาว" })).toBeChecked();

    await buyer.getByLabel("ข้อความ (ไม่บังคับ)").fill(REVIEW_TEXT);
    await expect(buyer.getByText(`${[...REVIEW_TEXT].length}/500`)).toBeVisible();
    await buyer.locator('input[type="file"]').setInputFiles([
      { name: "ของจริง.png", mimeType: "image/png", buffer: png(320, 240) },
      { name: "เคลื่อนไหว.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") },
    ]);
    await expect(buyer.getByText("1/3")).toBeVisible();
    await expect(buyer.getByText("ใช้ได้เฉพาะรูป JPG หรือ PNG")).toBeVisible();
    await expect(buyer.locator("progress")).toHaveCount(0);
    await expectFits360(buyer, "หน้าเขียนรีวิว");

    await buyer.getByRole("button", { name: "ส่งรีวิว" }).click();
    await expect(buyer.getByText("ส่งรีวิวแล้ว")).toBeVisible();
    await expect(buyer.getByRole("heading", { name: "รีวิวของฉัน" })).toBeVisible();
    await expect(buyer.getByText(REVIEW_TEXT)).toBeVisible();
    await expect(buyer.getByRole("link", { name: "แก้ไขรีวิว" })).toBeVisible();
    await expect(buyer.getByText(/แก้ไขได้ถึง/)).toBeVisible();
    reviewPath = new URL(buyer.url()).pathname;
    await expectFits360(buyer, "หน้ารีวิวของฉัน");
  });

  await test.step("REV-006 REV-007 REV-009 รีวิวขึ้นบนสุดของหน้าสินค้าพร้อมรูป และการ์ดในหน้าร้านมีคะแนน", async () => {
    await buyer.getByRole("main").locator('a[href^="/products/"]').first().click();
    await expect(reviews(buyer).getByText(REVIEW_TEXT)).toBeVisible();
    const top = reviews(buyer).locator("li", { hasText: REVIEW_TEXT }).first();
    await expect(top).toContainText("ผ***");
    await expect(top).toContainText("1 ดาว");
    await expect(top.locator('img[src^="/review-images/"]')).toBeVisible();
    expect(await top.locator('img[src^="/review-images/"]').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(320);
    afterReview = await ratingSummary(buyer);
    expect(afterReview).not.toBe(before);
    expect(afterReview).toMatch(/^\d\.\d \([\d,]+\)$/);
    await expect(buyer.getByRole("main").locator('h1 a[href="#reviews"]')).toContainText("รีวิว");
    await expectFits360(buyer, "หน้ารายละเอียดสินค้าที่มีรีวิว");

    await buyer.goto(shopPath);
    await expect(buyer.getByRole("main").locator(`a[href="${productPath}"]`)).toContainText(`★ ${afterReview}`);
    await expectFits360(buyer, "หน้าร้านที่การ์ดมีคะแนน");
  });

  await test.step("REV-014 REV-015 ร้านเห็นรีวิวใหม่ในหน้ารีวิวของร้านแล้วตอบ", async () => {
    const shopNo = shopPath.split("/").pop()!.padStart(2, "0");
    const seller = await signIn(browser, `seller${shopNo}@example.com`);
    await seller.getByRole("navigation", { name: "เมนูหลัก" }).getByRole("link", { name: "ร้านของฉัน" }).click();
    await seller.getByRole("navigation", { name: "เมนูหลังบ้านของร้าน" }).getByRole("link", { name: /^รีวิว ยังไม่ตอบ \d+$/ }).click();
    await expect(seller.getByRole("heading", { name: "รีวิวของร้าน" })).toBeVisible();
    await seller.getByRole("link", { name: /^ยังไม่ตอบ \d+$/ }).click();
    const item = seller.getByRole("main").locator("li", { hasText: REVIEW_TEXT }).first();
    await expect(item).toContainText("ผ***");
    await expect(item).not.toContainText("ผู้ซื้อตัวอย่าง");

    await item.getByText("ตอบรีวิว", { exact: true }).click();
    await item.getByRole("button", { name: "ส่งคำตอบ" }).click();
    await expect(item.getByText("กรอกคำตอบ 1 ถึง 500 ตัวอักษร")).toBeVisible();
    await item.getByLabel("คำตอบของร้าน").fill(REPLY_TEXT);
    await expectFits360(seller, "หน้ารีวิวของร้านที่กางช่องตอบ");
    await item.getByRole("button", { name: "ส่งคำตอบ" }).click();
    await expect(seller.getByRole("main").getByText(REVIEW_TEXT)).toHaveCount(0);

    await seller.getByRole("link", { name: /^ทั้งหมด \d+$/ }).click();
    const answered = seller.getByRole("main").locator("li", { hasText: REVIEW_TEXT }).first();
    await expect(answered).toContainText(`คำตอบจากร้าน: ${REPLY_TEXT}`);
    await expect(answered.getByText("แก้ไขคำตอบ", { exact: true })).toBeVisible();

    await buyer.goto(productPath);
    await expect(reviews(buyer).locator("li", { hasText: REVIEW_TEXT }).first()).toContainText(`คำตอบจากร้าน: ${REPLY_TEXT}`);
    await seller.context().close();
  });

  await test.step("REV-016 REV-017 ผู้ดูแลแพลตฟอร์มซ่อนรีวิว รีวิวหายจากหน้าสินค้าและคะแนนกลับเป็นค่าเดิม ส่วนผู้ซื้อยังเห็นรีวิวของตัวเองพร้อมเหตุผล", async () => {
    const admin = await signIn(browser, "admin@example.com", "admin1234");
    await admin.getByRole("navigation", { name: "เมนูหลัก" }).getByRole("link", { name: "จัดการรีวิว" }).click();
    await expect(admin.getByRole("heading", { name: "จัดการรีวิว" })).toBeVisible();
    const item = admin.getByRole("main").locator("li", { hasText: REVIEW_TEXT }).first();
    await expect(item).toContainText("ผู้ซื้อตัวอย่าง 1");

    await item.getByText("ซ่อนรีวิว", { exact: true }).click();
    await item.getByRole("button", { name: "ยืนยัน" }).click();
    await expect(item.getByText("กรอกเหตุผล 1 ถึง 200 ตัวอักษร")).toBeVisible();
    await item.getByLabel("เหตุผลที่ซ่อน").fill("ลองซ่อนจาก e2e");
    await expectFits360(admin, "หน้าจัดการรีวิวที่กางช่องเหตุผล");
    await item.getByRole("button", { name: "ยืนยัน" }).click();
    await expect(item).toContainText("ถูกซ่อนโดยผู้ดูแลแพลตฟอร์ม เหตุผล: ลองซ่อนจาก e2e");
    await expect(item.getByRole("button", { name: "เลิกซ่อน" })).toBeVisible();

    await buyer.goto(productPath);
    expect(await ratingSummary(buyer)).toBe(before);
    await expect(reviews(buyer).getByText(REVIEW_TEXT)).toHaveCount(0);

    await buyer.goto(`${reviewPath}?edit=1`);
    await expect(buyer.getByText("ถูกซ่อนโดยผู้ดูแลแพลตฟอร์ม เหตุผล: ลองซ่อนจาก e2e")).toBeVisible();
    await expect(buyer.getByText(REVIEW_TEXT)).toBeVisible();
    await expect(buyer.getByRole("link", { name: "แก้ไขรีวิว" })).toHaveCount(0);

    await item.getByRole("button", { name: "เลิกซ่อน" }).click();
    await expect(admin.getByRole("main").locator("li", { hasText: REVIEW_TEXT }).first().getByText("ซ่อนรีวิว", { exact: true })).toBeVisible();
    await buyer.goto(productPath);
    expect(await ratingSummary(buyer)).toBe(afterReview);
    await admin.context().close();
  });

  await buyer.context().close();
});

test("REV-009 REV-010 REV-011 หน้าแรกมีการ์ดที่แสดงคะแนน เรียงคะแนนสูงสุดและกรอง 4 ดาวขึ้นไปได้ และพิมพ์คะแนนในประโยคได้ผลเดียวกัน", async ({ page }) => {
  await page.goto("/");
  const cards = page.getByRole("main").locator('a[href^="/products/"]');
  await expect(cards).toHaveCount(20);
  const rated = await cards.filter({ hasText: "★" }).count();
  expect(rated, "REV-019 การ์ดที่แสดงคะแนนในหน้าแรกหน้าที่ 1").toBeGreaterThanOrEqual(8);
  expect(rated).toBeLessThan(20);
  await expectFits360(page, "หน้าแรกที่การ์ดมีคะแนน");

  await page.getByLabel("เรียงตาม").selectOption({ label: "คะแนนสูงสุด" });
  await expect(page).toHaveURL(/sort=rating/);
  await expect(cards.first()).toContainText("★ 5.0");
  await page.locator('select[name="rating"]').selectOption({ label: "4 ดาวขึ้นไป" });
  await expect(page).toHaveURL(/rating=4/);
  await expect(page.getByRole("link", { name: "เอา คะแนน 4 ดาวขึ้นไป ออก" })).toBeVisible();
  const filteredCount = await page.getByText(/^พบ [\d,]+ รายการ$/).textContent();
  const averages = await cards.evaluateAll((links) => links.map((link) => Number(/★ (\d\.\d)/.exec(link.textContent ?? "")?.[1])));
  expect(averages).toHaveLength(20);
  expect(averages.every((average) => average >= 4)).toBe(true);
  expect(averages).toEqual([...averages].sort((a, b) => b - a));

  await page.getByRole("searchbox", { name: "คำค้น" }).fill("4 ดาวขึ้นไป คะแนนสูงสุด");
  await expect(page.locator("#search-preview")).toContainText("คะแนน 4 ดาวขึ้นไป · เรียงคะแนนสูงสุด");
  await page.getByRole("searchbox", { name: "คำค้น" }).press("Enter");
  await expect(page.getByRole("link", { name: "เอา คะแนน 4 ดาวขึ้นไป ออก" })).toBeVisible();
  await expect(page.getByRole("link", { name: "เอา เรียงคะแนนสูงสุด ออก" })).toBeVisible();
  await expect(page.getByText(/^พบ [\d,]+ รายการ$/)).toHaveText(filteredCount ?? "");
  await expectFits360(page, "หน้าผลลัพธ์ที่กรองคะแนน");
});
