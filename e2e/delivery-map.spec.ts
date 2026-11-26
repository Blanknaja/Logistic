// แผนที่การจัดส่ง (docs/requirements/delivery-map.md) ผ่านหน้าเว็บจริงกับข้อมูลตัวอย่าง
// ภาพแผนที่ทุกคำขอได้ภาพจำลองจาก osm-tiles.ts ยกเว้นชุดท้ายไฟล์ที่ลองกับ OpenStreetMap จริง ซึ่งรันเองด้วย OSM_LIVE=1

import { DatabaseSync } from "node:sqlite";
import { devices, expect, test, type Browser, type BrowserContext, type Page, type Route } from "@playwright/test";
import { isTile, stubTiles } from "./osm-tiles";

// ฐานข้อมูลที่ playwright.config.ts ให้แอปของ e2e ใช้ อ่านอย่างเดียวเพื่อหาเลขติดตามพัสดุตัวอย่าง
const E2E_DB = "data/e2e.db";

const mapBox = (page: Page) => page.locator("[data-delivery-map]");
const pinLabels = (page: Page) => page.locator(".leaflet-tooltip");
const latestLabel = (page: Page) => page.locator('.leaflet-tooltip[class*="labelLatest"]');
const solidLines = (page: Page) => page.locator('path[class*="_solid"]');
const dashedLines = (page: Page) => page.locator('path[class*="_dashed"]');
const mapSection = (page: Page) => page.getByRole("region", { name: "แผนที่การจัดส่ง" });
const routeText = (page: Page) => mapSection(page).getByText(/ล่าสุด|^จัดส่งภายใน/);
const mapFailed = (page: Page) => page.getByRole("alert").filter({ hasText: "แสดงแผนที่ไม่ได้ ลองใหม่อีกครั้ง" });
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.ceil((p / 100) * values.length) - 1];

async function signIn(page: Page, email: string, password = "demo1234") {
  await page.goto("/login");
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน").fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
}

/** ผู้ซื้อตัวอย่างเข้าสู่ระบบ แล้วกดจากคำสั่งซื้อที่กำลังจัดส่งไปหน้าติดตามพัสดุ คืนที่อยู่ของหน้านั้น */
async function openShippingParcel(page: Page, email: string): Promise<string> {
  await signIn(page, email);
  await page.goto("/orders");
  // การ์ดคำสั่งซื้อ "กำลังจัดส่ง ชื่อร้าน ..." ไม่ใช่ปุ่มกรองสถานะ
  await page.getByRole("link", { name: /^กำลังจัดส่ง / }).click();
  await page.getByRole("main").getByRole("link", { name: "ติดตามพัสดุ" }).click();
  await expect(page.getByRole("heading", { name: "ติดตามพัสดุ" })).toBeVisible();
  return new URL(page.url()).pathname;
}

function sampleTrackingNos(where = "1 = 1"): string[] {
  const db = new DatabaseSync(E2E_DB, { readOnly: true });
  const rows = db
    .prepare(`SELECT p.tracking_no FROM parcels p JOIN orders o ON o.id = p.order_id JOIN accounts a ON a.id = o.buyer_account_id WHERE ${where} ORDER BY p.id`)
    .all();
  db.close();
  return rows.map((row) => String(row.tracking_no));
}

test("MAP-004 MAP-006 MAP-010 ผู้ซื้อตัวอย่างเปิดหน้าติดตามพัสดุของคำสั่งซื้อที่กำลังจัดส่ง เห็นหมุด 3 จังหวัด เส้นทึบ เส้นประ หมุดล่าสุด และข้อความเส้นทาง", async ({ page }) => {
  const tiles: { url: string; referer: string }[] = [];
  page.on("request", (request) => {
    if (isTile(new URL(request.url()))) tiles.push({ url: request.url(), referer: request.headers().referer ?? "" });
  });
  await stubTiles(page);
  const path = await openShippingParcel(page, "buyer2@example.com");

  await expect(mapBox(page)).toHaveAttribute("data-delivery-map", "ready");
  await expect(pinLabels(page)).toHaveText(["กรุงเทพมหานคร", "นครราชสีมา", "ขอนแก่น"]);
  await expect(latestLabel(page)).toHaveText("นครราชสีมา");
  await expect(solidLines(page)).toHaveCount(1);
  await expect(dashedLines(page)).toHaveCount(1);
  await expect(routeText(page)).toHaveText("กรุงเทพมหานคร → นครราชสีมา (ล่าสุด) → ขอนแก่น (ปลายทาง)");
  await expect(mapSection(page).getByText("แผนที่แสดงจังหวัดที่พัสดุผ่านมาแล้ว ไม่ใช่ตำแหน่งปัจจุบัน")).toBeVisible();
  // เครดิตของ OpenStreetMap อยู่บนแผนที่ที่โหลดแล้ว และตาเห็น (delivery-map.md ข้อจำกัด)
  const credit = mapBox(page).locator(".leaflet-control-attribution");
  await expect(credit).toBeVisible();
  await expect(credit).toHaveText("© OpenStreetMap contributors");
  await expect(credit.getByRole("link", { name: "OpenStreetMap" })).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
  const creditBox = (await credit.boundingBox())!;
  const frame = (await mapBox(page).boundingBox())!;
  expect(creditBox.x + creditBox.width, "เครดิตอยู่ในกรอบแผนที่").toBeLessThanOrEqual(frame.x + frame.width + 1);
  expect(creditBox.y + creditBox.height, "เครดิตอยู่ในกรอบแผนที่").toBeLessThanOrEqual(frame.y + frame.height + 1);

  // ระบบไม่ส่งเลขติดตามพัสดุให้ OpenStreetMap ทั้งในที่อยู่ของภาพและในหน้าที่ขอภาพ
  const trackingNo = path.split("/").pop()!;
  expect(tiles.length).toBeGreaterThan(0);
  for (const tile of tiles) {
    expect(tile.url).not.toContain(trackingNo);
    expect(tile.referer).not.toContain(trackingNo);
  }

  // ย่อหน้าต่างหรือหมุนจอ หมุดทั้ง 3 ยังอยู่ในกรอบแผนที่
  await page.setViewportSize({ width: 360, height: 780 });
  const pinsInside = async () => {
    const map = (await mapBox(page).boundingBox())!;
    const pins = await page.locator('path[class*="_pin"], path[class*="_latest"]').all();
    for (const pin of pins) {
      const box = (await pin.boundingBox())!;
      if (box.x < map.x || box.y < map.y || box.x + box.width > map.x + map.width || box.y + box.height > map.y + map.height) return false;
    }
    return pins.length;
  };
  await expect.poll(pinsInside).toBe(3);
});

test("MAP-005 MAP-009 OpenStreetMap ไม่ตอบ เห็นกรอบสีพื้นระหว่างรอ ครบ 10 วินาทีเห็นข้อความกับปุ่ม ลองใหม่ ส่วนอื่นใช้ได้ครบ และกดลองใหม่แล้วแผนที่ขึ้นโดยไม่โหลดหน้าใหม่", async ({ page }) => {
  await stubTiles(page);
  const path = await openShippingParcel(page, "buyer1@example.com");
  await page.unroute(isTile);
  // ภาพแผนที่ไม่มาเลย คำขอค้างไว้
  const hung: Route[] = [];
  await page.route(isTile, (route) => void hung.push(route));
  await page.goto(path);

  await expect(mapBox(page)).toHaveAttribute("data-delivery-map", "loading");
  const placeholder = await mapBox(page).evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(placeholder).toMatch(/^rgb\(/);
  expect(placeholder, "กรอบระหว่างรอต้องมีสีพื้นต่างจากหน้า").not.toBe(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
  expect((await mapBox(page).boundingBox())!.height).toBeGreaterThan(200);
  await expect(mapFailed(page)).toHaveCount(0);
  await expect(routeText(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "ประวัติการจัดส่ง" })).toBeVisible();

  await expect(mapFailed(page).getByRole("button", { name: "ลองใหม่" })).toBeVisible({ timeout: 15_000 });
  const waited = await page.evaluate(() => performance.now());
  expect(waited, "แสดงข้อความหลังรอครบ 10 วินาที").toBeGreaterThanOrEqual(10_000);
  expect(waited).toBeLessThan(13_000);

  // สถานะ ประวัติ ข้อความเส้นทาง และปุ่ม ได้รับสินค้าแล้ว ยังอยู่และกดได้
  await expect(page.getByText("ส่งสำเร็จ").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "ประวัติการจัดส่ง" })).toBeVisible();
  await expect(routeText(page)).toHaveText("กรุงเทพมหานคร → นครสวรรค์ → เชียงใหม่ (ล่าสุด และปลายทาง)");
  await page.getByRole("button", { name: "ได้รับสินค้าแล้ว" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "ยกเลิก" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // กดลองใหม่ ระบบขอภาพแผนที่อีกครั้งในหน้าเดิม
  for (const route of hung) await route.abort().catch(() => {});
  await page.unroute(isTile);
  await stubTiles(page);
  await page.evaluate(() => Object.assign(window, { samePage: true }));
  const requested = page.waitForRequest((request) => isTile(new URL(request.url())));
  await mapFailed(page).getByRole("button", { name: "ลองใหม่" }).click();
  await requested;
  await expect(mapBox(page)).toHaveAttribute("data-delivery-map", "ready");
  expect(await page.evaluate(() => "samePage" in window)).toBe(true);

  // MAP-009 พัสดุส่งสำเร็จแล้ว เส้นทึบถึงปลายทาง ไม่มีเส้นประ
  await expect(pinLabels(page)).toHaveText(["กรุงเทพมหานคร", "นครสวรรค์", "เชียงใหม่"]);
  await expect(latestLabel(page)).toHaveText("เชียงใหม่");
  await expect(solidLines(page)).toHaveCount(1);
  await expect(dashedLines(page)).toHaveCount(0);
});

test("MAP-004 ชื่อจังหวัดบนหมุดเป็นข้อความเสมอ แท็ก HTML ในชื่อไม่กลายเป็น element บนแผนที่", async ({ page }) => {
  await stubTiles(page);
  const path = await openShippingParcel(page, "buyer2@example.com");
  const tag = "<i id=injected>x</i>";
  // แก้ชื่อจังหวัดในหน้าที่เซิร์ฟเวอร์ส่งมา เพื่อให้แผนที่ได้ชื่อที่มีแท็ก HTML
  await page.route(path, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replaceAll("นครราชสีมา", tag) });
  });
  await page.goto(path);

  await expect(mapBox(page)).toHaveAttribute("data-delivery-map", "ready");
  await expect(latestLabel(page)).toHaveText(tag);
  await expect(page.locator(".leaflet-container #injected")).toHaveCount(0);
});

test("MAP-006 ปิด JavaScript ยังเห็นข้อความเส้นทางครบ แม้ไม่มีแผนที่ และไม่มีกรอบแผนที่เปล่ากินที่", async ({ page, browser }) => {
  await stubTiles(page);
  const path = await openShippingParcel(page, "buyer2@example.com");
  const context = await browser.newContext({ javaScriptEnabled: false, storageState: await page.context().storageState() });
  const noScript = await context.newPage();
  const tiles: string[] = [];
  noScript.on("request", (request) => void (isTile(new URL(request.url())) && tiles.push(request.url())));

  await noScript.goto(path);
  await expect(routeText(noScript)).toHaveText("กรุงเทพมหานคร → นครราชสีมา (ล่าสุด) → ขอนแก่น (ปลายทาง)");
  await expect(noScript.getByRole("heading", { name: "ประวัติการจัดส่ง" })).toBeVisible();
  await expect(mapBox(noScript)).toBeHidden();
  expect(await mapBox(noScript).boundingBox(), "กรอบแผนที่ไม่กินที่").toBeNull();
  // ข้อความเส้นทางเป็นสิ่งแรกที่ตาเห็นในส่วนแผนที่ ไม่มีที่ว่างของแผนที่อยู่เหนือมัน
  const section = (await mapSection(noScript).boundingBox())!;
  const firstLine = (await routeText(noScript).boundingBox())!;
  expect(firstLine.y - section.y).toBeLessThan(8);
  expect(tiles).toEqual([]);
  await context.close();
});

test("MAP-001 MAP-002 ผู้ขายเลือกจังหวัดตอนเปลี่ยนสถานะ ไม่เลือกได้ข้อความใต้ช่องโดยสถานที่ยังอยู่ และครั้งถัดไปเลือกจังหวัดล่าสุดไว้ให้", async ({ page }) => {
  await stubTiles(page);
  const [trackingNo] = sampleTrackingNos("a.email = 'buyer3@example.com'");
  await signIn(page, "seller01@example.com");
  await page.goto(`/track/${trackingNo}`);

  await page.getByRole("link", { name: "เปลี่ยนเป็น ร้านส่งของแล้ว" }).click();
  // MAP-002 รายการแรกมีจังหวัดของที่อยู่ต้นทางของร้าน
  await expect(page.getByLabel("จังหวัด")).toHaveValue("กรุงเทพมหานคร");
  await page.getByLabel("สถานที่").fill("ไปรษณีย์บางซื่อ");
  await page.getByLabel("จังหวัด").selectOption("");
  await page.getByRole("button", { name: "บันทึก" }).click();
  await expect(page.locator("#field-province-error")).toHaveText("เลือกจังหวัด");
  await expect(page.getByLabel("สถานที่")).toHaveValue("ไปรษณีย์บางซื่อ");

  await page.getByLabel("จังหวัด").selectOption("นนทบุรี");
  await page.getByRole("button", { name: "บันทึก" }).click();
  await expect(page.getByRole("status")).toHaveText("บันทึกแล้ว");

  await page.getByRole("link", { name: "เปลี่ยนเป็น อยู่ระหว่างขนส่ง" }).click();
  await expect(page.getByLabel("จังหวัด")).toHaveValue("นนทบุรี");

  await page.getByRole("link", { name: "ดูประวัติการจัดส่ง" }).click();
  await expect(page.getByText("ไปรษณีย์บางซื่อ · นนทบุรี")).toBeVisible();
  await expect(routeText(page)).toHaveText("กรุงเทพมหานคร → นนทบุรี (ล่าสุด) → กรุงเทพมหานคร (ปลายทาง)");
  await expect(pinLabels(page)).toHaveText(["กรุงเทพมหานคร", "นนทบุรี"]);
});

test("MAP-Q04 พัสดุตัวอย่างทุกชิ้น ข้อความเส้นทางมีชื่อจังหวัดครบทุกหมุดบนแผนที่", async ({ page }) => {
  const trackingNos = sampleTrackingNos();
  expect(trackingNos.length).toBeGreaterThanOrEqual(7);
  await stubTiles(page);
  await signIn(page, "admin@example.com", "admin1234");

  for (const trackingNo of trackingNos) {
    await page.goto(`/track/${trackingNo}`);
    await expect(mapBox(page)).toHaveAttribute("data-delivery-map", "ready");
    const pins = await pinLabels(page).allTextContents();
    const text = (await routeText(page).textContent()) ?? "";
    expect(pins.length, trackingNo).toBeGreaterThan(0);
    for (const pin of pins) expect(text, `${trackingNo} ${text}`).toContain(pin);
  }
  console.log(`MAP-Q04 พัสดุตัวอย่าง ${trackingNos.length} ชิ้น ข้อความเส้นทางมีชื่อจังหวัดครบทุกหมุด`);
});

test("MAP-Q01 ปิดกั้นภาพแผนที่ไว้ เปิดหน้าติดตามพัสดุ 100 ครั้ง สถานะ ประวัติ และข้อความเส้นทางขึ้นภายใน 2 วินาทีอย่างน้อย 95 ครั้ง", async ({ page }) => {
  await page.route(isTile, (route) => route.abort("blockedbyclient"));
  const path = await openShippingParcel(page, "buyer2@example.com");
  const times: number[] = [];
  for (let i = 0; i < 100; i++) {
    const started = Date.now();
    await page.goto(path, { waitUntil: "commit" });
    await routeText(page).waitFor();
    await page.getByText("อยู่ระหว่างขนส่ง").first().waitFor();
    await page.getByRole("heading", { name: "ประวัติการจัดส่ง" }).waitFor();
    times.push(Date.now() - started);
  }
  console.log(`MAP-Q01 ${path} 100 ครั้ง p50 ${percentile(times, 50)} p95 ${percentile(times, 95)} ช้าสุด ${Math.max(...times)} มิลลิวินาที`);
  expect(times.filter((ms) => ms <= 2000).length).toBeGreaterThanOrEqual(95);
  // ภาพแผนที่ที่ถูกปิดกั้นทำให้ที่ของแผนที่บอกว่าแสดงไม่ได้ ไม่ค้าง
  await expect(mapFailed(page)).toBeVisible();
});

/** จับเวลาจากเริ่มเปิดหน้าจนแผนที่มีหมุด เส้น และภาพแผนที่ครบ ในเบราว์เซอร์ใหม่ที่ยังไม่มีแคช */
async function timeToMap(browser: Browser, storageState: Awaited<ReturnType<BrowserContext["storageState"]>>, path: string, stub: boolean) {
  const context = await browser.newContext({ storageState });
  if (stub) await stubTiles(context);
  const page = await context.newPage();
  await page.goto(path, { waitUntil: "commit" });
  const ms = await page.waitForFunction(
    () => document.querySelector('[data-delivery-map="ready"] .leaflet-tooltip') && performance.now(),
    null,
    { timeout: 30_000, polling: "raf" },
  );
  const value = Math.round(Number(await ms.jsonValue()));
  await context.close();
  return value;
}

test("MAP-Q02 เปิดหน้าติดตามพัสดุ 10 ครั้งโดยเปิดหน้าใหม่ทุกครั้ง เห็นหมุดและเส้นภายใน 5 วินาทีอย่างน้อย 9 ครั้ง (ภาพแผนที่จำลอง)", async ({ page, browser }) => {
  await stubTiles(page);
  const path = await openShippingParcel(page, "buyer2@example.com");
  const state = await page.context().storageState();
  const times: number[] = [];
  for (let i = 0; i < 10; i++) times.push(await timeToMap(browser, state, path, true));
  console.log(`MAP-Q02 ภาพแผนที่จำลอง ${path} 10 ครั้ง (มิลลิวินาที): ${times.join(" ")} ช้าสุด ${Math.max(...times)}`);
  expect(times.filter((ms) => ms <= 5000).length).toBeGreaterThanOrEqual(9);
});

test.describe("MAP-Q03 บนมือถือ", () => {
  const { userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
  test.use({ userAgent, viewport: { width: 360, height: 780 }, deviceScaleFactor, isMobile, hasTouch });

  test("MAP-Q03 จอกว้าง 360 จุด หน้าไม่ล้นซ้ายขวา และลากนิ้วเดียวบนแผนที่แล้วหน้าเลื่อน แผนที่ไม่ขยับ", async ({ page }) => {
    await stubTiles(page);
    await openShippingParcel(page, "buyer2@example.com");
    await expect(mapBox(page)).toHaveAttribute("data-delivery-map", "ready");
    expect(await overflow(page), "หน้าติดตามพัสดุล้นจอกว้าง 360 จุด").toBeLessThanOrEqual(0);

    await mapBox(page).evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const box = (await mapBox(page).boundingBox())!;
    const mapPosition = () => page.locator(".leaflet-map-pane").evaluate((element) => getComputedStyle(element).transform);
    const pinned = await mapPosition();
    const before = await page.evaluate(() => scrollY);

    const cdp = await page.context().newCDPSession(page);
    const x = box.x + box.width / 2;
    const from = box.y + box.height * 0.8;
    const to = box.y + box.height * 0.2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: from }] });
    for (let step = 1; step <= 10; step++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: from + ((to - from) * step) / 10 }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 50);
    expect(await mapPosition()).toBe(pinned);
  });
});

test.describe("ลองกับ OpenStreetMap จริง (รันเองด้วย OSM_LIVE=1 ไม่อยู่ใน pnpm e2e ปกติ)", () => {
  test.skip(process.env.OSM_LIVE !== "1", "ขอภาพแผนที่จาก OpenStreetMap จริง รันเองเป็นครั้งคราว");

  test("MAP-Q02 ภาพแผนที่จริงจาก OpenStreetMap 10 ครั้งโดยเปิดหน้าใหม่ทุกครั้ง และถ่ายภาพหน้าจอที่จอกว้าง 1440 และ 390", async ({ page, browser }) => {
    const path = await openShippingParcel(page, "buyer2@example.com");
    const state = await page.context().storageState();
    const times: number[] = [];
    for (let i = 0; i < 10; i++) times.push(await timeToMap(browser, state, path, false));
    console.log(`MAP-Q02 OpenStreetMap จริง ${path} 10 ครั้ง (มิลลิวินาที): ${times.join(" ")} ช้าสุด ${Math.max(...times)}`);
    expect(times.filter((ms) => ms <= 5000).length).toBeGreaterThanOrEqual(9);

    for (const [width, height] of [
      [1440, 900],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(path);
      await expect(mapBox(page)).toHaveAttribute("data-delivery-map", "ready", { timeout: 15_000 });
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: `docs/screenshots/delivery-map-${width}.png`, fullPage: true });
    }
  });
});
