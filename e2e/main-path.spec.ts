// เส้นทางหลักของ product.md ส่วนที่ 1 ผ่านหน้าเว็บจริง ทุกหน้าไปถึงด้วยการกดลิงก์หรือปุ่ม ไม่พิมพ์ที่อยู่เอง
// SCREENSHOTS=1 pnpm e2e บันทึกภาพของแต่ละขั้นลง docs/screenshots/

import { deflateSync, crc32 } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { stubTiles } from "./osm-tiles";

const SAVE_SCREENSHOTS = process.env.SCREENSHOTS === "1";
// ฐานข้อมูลของ e2e ถูกล้างทุกครั้ง ชื่อเหล่านี้จึงไม่ซ้ำกับข้อมูลเดิม
const seller = { email: "somchai@example.com", password: "sellerpass123", name: "สมชาย" };
const buyer = { email: "somying@example.com", password: "buyerpass123", name: "สมหญิง" };
const shopName = "ร้านสมชายผ้าไทย";
const productName = "เสื้อยืดลายช้าง";

/** รูป PNG สีเดียว ไว้ใส่เป็นรูปสินค้า */
function png(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
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
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let step = 0;

/** ภาพหน้าจอของขั้นนี้ และตรวจว่าที่จอกว้าง 360 จุดไม่มีส่วนล้นจนต้องเลื่อนซ้ายขวา */
async function shot(page: Page, name: string, options: { mobile?: boolean } = {}) {
  step += 1;
  const file = `${String(step).padStart(2, "0")}-${name}`;
  await page.waitForLoadState("networkidle");
  await expect(page.locator('[role="status"]:has-text("กำลังโหลด"), [role="status"][aria-label="กำลังโหลด"]')).toHaveCount(0);
  if (SAVE_SCREENSHOTS) await page.screenshot({ path: `docs/screenshots/${file}.png`, fullPage: true });
  const desktop = page.viewportSize()!;
  await page.setViewportSize({ width: 360, height: 780 });
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${name} ล้นจอกว้าง 360 จุด`).toBeLessThanOrEqual(0);
  if (SAVE_SCREENSHOTS && options.mobile) await page.screenshot({ path: `docs/screenshots/${file}-360.png`, fullPage: true });
  await page.setViewportSize(desktop);
}

const menu = (page: Page) => page.getByRole("navigation", { name: "เมนูหลัก" });

async function signUp(page: Page, account: { email: string; password: string; name: string }) {
  await page.goto("/");
  await menu(page).getByRole("link", { name: "สมัครบัญชี" }).click();
  await page.getByLabel("อีเมล").fill(account.email);
  await page.getByLabel("รหัสผ่าน").fill(account.password);
  await page.getByLabel("ชื่อที่แสดง").fill(account.name);
  await page.getByRole("button", { name: "สมัครบัญชี" }).click();
  await expect(menu(page).getByRole("link", { name: account.name })).toBeVisible();
}

/** product.md: คนหนึ่งคนใช้สองบัญชีเดินเส้นทางหลักจบภายใน 10 นาที */
const MAIN_PATH_LIMIT_MS = 10 * 60 * 1000;

test("เส้นทางหลัก: เปิดร้าน ลงสินค้า ตั้งสต็อก สั่งซื้อ จ่ายเงิน ส่งสำเร็จ และผู้ซื้อได้รับสินค้าแล้ว", async ({ browser }) => {
  const startedAt = Date.now();
  const sellerPage = await (await browser.newContext()).newPage();
  const buyerPage = await (await browser.newContext()).newPage();
  await stubTiles(sellerPage);
  await stubTiles(buyerPage);

  await test.step("บัญชีแรกสมัครและเปิดร้าน", async () => {
    const page = sellerPage;
    await signUp(page, seller);
    await shot(page, "seller-signed-up");
    await menu(page).getByRole("link", { name: "เปิดร้าน" }).click();
    await page.getByLabel("ชื่อร้าน").fill(shopName);
    await page.getByLabel("ชื่อผู้ส่ง").fill("สมชาย ใจดี");
    await page.getByLabel("เบอร์โทร").fill("0812345678");
    await page.getByLabel("รายละเอียดที่อยู่").fill("99/1 ถนนสุขุมวิท");
    await page.getByLabel("ตำบลหรือแขวง").fill("คลองเตย");
    await page.getByLabel("อำเภอหรือเขต").fill("คลองเตย");
    await page.getByLabel("จังหวัด").selectOption("กรุงเทพมหานคร");
    await page.getByLabel("รหัสไปรษณีย์").fill("10110");
    await shot(page, "open-shop-form");
    await page.getByRole("button", { name: "เปิดร้าน" }).click();
    await expect(page.getByText("เปิดร้านสำเร็จ")).toBeVisible();
    await shot(page, "seller-home");
  });

  await test.step("ลงสินค้าที่มีตัวเลือกสีและขนาด", async () => {
    const page = sellerPage;
    await page.getByRole("link", { name: "ลงสินค้าชิ้นแรก" }).click();
    await page.getByLabel("ชื่อสินค้า").fill(productName);
    await page.getByLabel("รายละเอียด").fill("ผ้าฝ้ายเนื้อนุ่ม ใส่สบาย");
    await page.getByLabel("หมวดหมู่").selectOption({ index: 1 });
    await page.getByLabel("เพิ่มรูป").setInputFiles({ name: "shirt.png", mimeType: "image/png", buffer: png(240, 240, [15, 118, 110]) });
    await expect(page.getByRole("img").first()).toBeVisible();
    for (const [index, name, values] of [
      [1, "สี", ["ดำ", "ขาว"]],
      [2, "ขนาด", ["M", "L"]],
    ] as const) {
      await page.getByRole("button", { name: "เพิ่มตัวเลือก" }).click();
      await page.getByLabel(`ชื่อตัวเลือกที่ ${index}`).fill(name);
      for (const value of values) {
        await page.getByLabel("เพิ่มค่าตัวเลือก").nth(index - 1).fill(value);
        await page.getByRole("button", { name: "เพิ่ม", exact: true }).nth(index - 1).click();
      }
    }
    for (const label of ["ดำ M", "ดำ L", "ขาว M", "ขาว L"]) {
      await page.getByLabel(`ราคา ${label}`).fill("250");
    }
    await shot(page, "product-form");
    await page.getByRole("button", { name: "บันทึกและเปิดขาย" }).click();
    await expect(page.getByText("เปิดขายสินค้าแล้ว")).toBeVisible();
    await expect(page.getByText(productName, { exact: true })).toBeVisible();
    await shot(page, "product-list");
  });

  await test.step("ตั้งสต็อกของแบบย่อยที่จะขาย", async () => {
    const page = sellerPage;
    await page.getByRole("navigation", { name: "เมนูหลังบ้านของร้าน" }).getByRole("link", { name: "สต็อก" }).click();
    const row = page.getByRole("listitem").filter({ hasText: productName }).filter({ hasText: "ดำ L" });
    await row.getByLabel("ตั้งสต็อกใหม่").fill("10");
    await row.getByRole("button", { name: "บันทึก" }).click();
    await expect(row.getByText("สต็อก 10")).toBeVisible();
    await shot(page, "stock");
  });

  await test.step("บัญชีที่สองสมัคร ค้นหาสินค้า และใส่ตะกร้า", async () => {
    const page = buyerPage;
    await signUp(page, buyer);
    await page.getByRole("searchbox", { name: "คำค้น" }).fill("ลายช้าง");
    await page.getByRole("button", { name: "ค้นหา" }).click();
    await expect(page.getByRole("link", { name: productName })).toBeVisible();
    await shot(page, "search-results", { mobile: true });
    await page.getByRole("link", { name: productName }).click();
    await page.getByRole("radio", { name: "ดำ" }).check();
    await page.getByRole("radio", { name: "L" }).check();
    await page.getByLabel("จำนวน").fill("2");
    await page.getByRole("button", { name: "ใส่ตะกร้า" }).click();
    await expect(page.getByRole("status")).toContainText("ตะกร้า");
    await shot(page, "product-added-to-cart", { mobile: true });
  });

  await test.step("ผู้ซื้อเปิดตะกร้า เพิ่มที่อยู่ และสั่งซื้อ", async () => {
    const page = buyerPage;
    await menu(page).getByRole("link", { name: /^ตะกร้า/ }).click();
    await expect(page.getByRole("link", { name: productName })).toBeVisible();
    await shot(page, "cart", { mobile: true });
    await page.getByRole("button", { name: "สั่งซื้อ" }).click();
    await page.getByRole("link", { name: "เพิ่มที่อยู่" }).click();
    await page.getByLabel("ชื่อผู้รับ").fill("สมหญิง รักดี");
    await page.getByLabel("เบอร์โทร").fill("0898765432");
    await page.getByLabel("บ้านเลขที่ ซอย ถนน").fill("12/3 ซอยนิมมานเหมินท์ 9");
    await page.getByLabel("ตำบลหรือแขวง").fill("สุเทพ");
    await page.getByLabel("อำเภอหรือเขต").fill("เมืองเชียงใหม่");
    await page.getByLabel("จังหวัด").selectOption("เชียงใหม่");
    await page.getByLabel("รหัสไปรษณีย์").fill("50200");
    await shot(page, "address-form", { mobile: true });
    await page.getByRole("button", { name: "บันทึก" }).click();
    await expect(page.getByText("12/3 ซอยนิมมานเหมินท์ 9")).toBeVisible();
    await expect(page.getByText("฿540").last()).toBeVisible();
    await shot(page, "checkout", { mobile: true });
    await page.getByRole("button", { name: "สั่งซื้อ" }).click();
    await expect(page.getByRole("heading", { name: "จ่ายเงิน", exact: true })).toBeVisible();
    await expect(menu(page).getByRole("link", { name: "ตะกร้า", exact: true })).toBeVisible();
  });

  await test.step("ผู้ซื้อจ่ายด้วยบัตรทดลองของตัวจำลอง", async () => {
    const page = buyerPage;
    await expect(page.getByText("กำลังใช้ตัวจำลองการจ่ายเงิน")).toBeVisible();
    await shot(page, "pay-choose-method", { mobile: true });
    await page.getByRole("link", { name: "บัตร", exact: true }).click();
    await page.getByLabel("เลขบัตร").fill("4242 4242 4242 4242");
    await page.getByLabel("ชื่อบนบัตร").fill("SOMYING RAKDEE");
    await page.getByLabel("เดือนปีหมดอายุ").fill("12/30");
    await page.getByLabel("รหัสหลังบัตร").fill("123");
    await shot(page, "pay-card", { mobile: true });
    await page.getByRole("button", { name: "จ่ายเงิน" }).click();
    await expect(page.getByRole("heading", { name: "จ่ายเงินสำเร็จ" })).toBeVisible();
    await shot(page, "paid", { mobile: true });
  });

  await test.step("ผู้ขายเห็นคำสั่งซื้อรอจัดของ แล้วเปลี่ยนสถานะทีละขั้นจนส่งสำเร็จ", async () => {
    const page = sellerPage;
    await menu(page).getByRole("link", { name: "ร้านของฉัน" }).click();
    const sellerMenu = page.getByRole("navigation", { name: "เมนูหลังบ้านของร้าน" });
    await expect(sellerMenu.getByRole("link", { name: "รอจัดของ 1" })).toBeVisible();
    await sellerMenu.getByRole("link", { name: "รอจัดของ 1" }).click();
    await expect(page.getByRole("link", { name: /\d{10}/ })).toHaveCount(1);
    await shot(page, "seller-orders");
    await page.getByRole("link", { name: /\d{10}/ }).click();
    await expect(page.getByRole("button", { name: "จัดส่ง" })).toBeVisible();
    await shot(page, "seller-order");
    await page.getByRole("button", { name: "จัดส่ง" }).click();
    // ORD-009 ปุ่มจัดส่งพาไปหน้าติดตามพัสดุ ที่มีทั้งประวัติการจัดส่งและปุ่มเปลี่ยนสถานะ
    await expect(page.getByRole("heading", { name: "ติดตามพัสดุ" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "ประวัติการจัดส่ง" })).toBeVisible();
    await expect(page.getByText("รอร้านจัดของ").first()).toBeVisible();
    for (const [status, extra] of [
      ["ร้านส่งของแล้ว", null],
      ["อยู่ระหว่างขนส่ง", null],
      ["กำลังนำส่ง", null],
      ["ส่งสำเร็จ", "สมหญิง รักดี"],
    ] as const) {
      await page.getByRole("link", { name: `เปลี่ยนเป็น ${status}` }).click();
      await page.getByLabel("สถานที่").fill(status === "ร้านส่งของแล้ว" ? "ไปรษณีย์คลองเตย" : "ศูนย์กระจายสินค้าเชียงใหม่");
      // MAP-002 ขั้นแรกได้จังหวัดของร้านไว้ให้ก่อน ขั้นหลังจากนี้ได้เชียงใหม่ที่เลือกไว้ครั้งก่อน
      if (status === "อยู่ระหว่างขนส่ง") await page.getByLabel("จังหวัด").selectOption("เชียงใหม่");
      if (extra) await page.getByLabel("ชื่อผู้รับ").fill(extra);
      if (status === "ส่งสำเร็จ") await shot(page, "parcel-delivered-form");
      await page.getByRole("button", { name: "บันทึก" }).click();
      await expect(page.getByRole("status")).toHaveText("บันทึกแล้ว");
      await expect(page.getByRole("definition").filter({ hasText: status }).first()).toBeVisible();
    }
    await shot(page, "parcel-delivered");
  });

  await test.step("ผู้ซื้อเปิดหน้าติดตามพัสดุแล้วกดได้รับสินค้าแล้ว", async () => {
    const page = buyerPage;
    await menu(page).getByRole("link", { name: "คำสั่งซื้อ" }).click();
    await expect(page.getByRole("link", { name: new RegExp(shopName) })).toBeVisible();
    await shot(page, "buyer-orders", { mobile: true });
    await page.getByRole("link", { name: new RegExp(shopName) }).click();
    await expect(page.getByRole("heading", { name: /^คำสั่งซื้อ \d{10}$/ })).toBeVisible();
    await shot(page, "buyer-order", { mobile: true });
    await page.getByRole("main").getByRole("link", { name: "ติดตามพัสดุ" }).click();
    await expect(page.getByText("ส่งสำเร็จ").first()).toBeVisible();
    await expect(page.getByText("กรุงเทพมหานคร → เชียงใหม่ (ล่าสุด และปลายทาง)")).toBeVisible();
    await expect(page.locator('[data-delivery-map="ready"]')).toBeVisible();
    await shot(page, "tracking", { mobile: true });
    await page.getByRole("button", { name: "ได้รับสินค้าแล้ว" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "ยืนยัน" }).click();
    await expect(page.getByRole("button", { name: "ได้รับสินค้าแล้ว" })).toBeHidden();
    await shot(page, "received", { mobile: true });
    await menu(page).getByRole("link", { name: "คำสั่งซื้อ" }).click();
    await expect(page.getByRole("link", { name: new RegExp(`${shopName} สำเร็จ`) })).toBeVisible();
  });

  // เครื่องกดเร็วกว่าคนมาก ถ้าใช้เกิน 1 ใน 5 ของเวลาที่ให้คน แปลว่ามีหน้าที่ช้าผิดปกติ
  expect(Date.now() - startedAt, "เดินเส้นทางหลักจบภายใน 2 นาที").toBeLessThan(MAIN_PATH_LIMIT_MS / 5);
});
