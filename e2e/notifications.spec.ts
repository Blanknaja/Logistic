// แจ้งเตือน (docs/requirements/notification.md) ผ่านหน้าเว็บจริงกับข้อมูลตัวอย่าง
// ผู้ขายเปลี่ยนสถานะการจัดส่ง แล้วกระดิ่งของผู้ซื้อที่เปิดหน้าค้างไว้เพิ่มขึ้นเองโดยไม่โหลดหน้าใหม่

import { DatabaseSync } from "node:sqlite";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { stubTiles } from "./osm-tiles";

// ฐานข้อมูลที่ playwright.config.ts ให้แอปของ e2e ใช้
const E2E_DB = "data/e2e.db";

/** NTF-014 ตัวเลขที่กระดิ่งต้องเปลี่ยนภายในเวลานี้ */
const LIVE_UPDATE_MS = 10_000;

const header = (page: Page) => page.getByRole("navigation", { name: "เมนูหลัก" });
const bell = (page: Page) => header(page).getByRole("button", { name: /^แจ้งเตือน/ });
const panel = (page: Page) => page.getByRole("region", { name: "แจ้งเตือนล่าสุด" });
const items = (page: Page) => page.locator('a[href^="/notifications/"]');
const listed = (page: Page) => page.getByRole("main").locator('a[href^="/notifications/"]');
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const bellName = (unread: number) => (unread > 0 ? `แจ้งเตือน ยังไม่อ่าน ${unread} รายการ` : "แจ้งเตือน");

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน").fill("demo1234");
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
}

async function signedInPage(browser: Browser, email: string, options: { width?: number; javaScriptEnabled?: boolean } = {}) {
  const context = await browser.newContext({ viewport: { width: options.width ?? 1280, height: 800 } });
  const page = await context.newPage();
  await signIn(page, email);
  if (options.javaScriptEnabled !== false) return page;
  const noScript = await browser.newContext({ viewport: { width: options.width ?? 1280, height: 800 }, javaScriptEnabled: false, storageState: await context.storageState() });
  await context.close();
  return noScript.newPage();
}

function query<T>(sql: string, ...params: (string | number)[]): T[] {
  const db = new DatabaseSync(E2E_DB, { readOnly: true });
  const rows = db.prepare(sql).all(...params);
  db.close();
  return rows as T[];
}

const unreadOf = (email: string) =>
  Number(
    query<{ n: number }>(
      "SELECT count(*) AS n FROM notifications n JOIN accounts a ON a.id = n.account_id WHERE a.email = ? AND n.read_at IS NULL",
      email,
    )[0].n,
  );

test("NTF-014 NTF-002 NTF-004 ผู้ขายเปลี่ยนสถานะการจัดส่ง กระดิ่งของผู้ซื้อที่เปิดหน้าค้างไว้เพิ่มขึ้น 1 ภายใน 10 วินาทีโดยไม่โหลดหน้าใหม่ กดแจ้งเตือนแล้วเป็นอ่านแล้วและไปหน้าติดตามพัสดุ", async ({
  browser,
}) => {
  const [{ tracking_no: trackingNo }] = query<{ tracking_no: string }>(
    `SELECT p.tracking_no FROM parcels p JOIN orders o ON o.id = p.order_id JOIN accounts b ON b.id = o.buyer_account_id
     JOIN shops s ON s.id = o.shop_id JOIN accounts sa ON sa.id = s.owner_account_id
     WHERE b.email = 'buyer3@example.com' AND sa.email = 'seller02@example.com' AND p.status = 'กำลังนำส่ง'`,
  );
  const before = unreadOf("buyer3@example.com");
  expect(before).toBeGreaterThanOrEqual(2);

  const home = await signedInPage(browser, "buyer3@example.com");
  const list = await home.context().newPage();
  const seller = await signedInPage(browser, "seller02@example.com");
  await stubTiles(home.context());
  await stubTiles(seller);

  await home.goto("/");
  await expect(bell(home)).toHaveAccessibleName(bellName(before));
  await expect(bell(home)).toHaveText(String(before));
  await home.evaluate(() => {
    (window as unknown as { openedOnce: boolean }).openedOnce = true;
    window.scrollTo(0, 400);
  });
  const scrolledTo = await home.evaluate(() => window.scrollY);
  expect(scrolledTo).toBeGreaterThan(0);

  await list.goto("/notifications");
  await expect(list.getByText(`ยังไม่อ่าน ${before} รายการ`)).toBeVisible();
  const listedBefore = await listed(list).count();
  await bell(list).click();
  await expect(panel(list).locator('a[href^="/notifications/"]').first()).toBeVisible();
  await expect(panel(list).getByText(`พัสดุ ${trackingNo} จากร้าน ใจดีช็อป เป็น ส่งสำเร็จ`)).toHaveCount(0);

  await seller.goto(`/track/${trackingNo}`);
  await seller.getByRole("link", { name: "เปลี่ยนเป็น ส่งสำเร็จ" }).click();
  await seller.getByLabel("สถานที่").fill("บ้านผู้รับ");
  await seller.getByLabel("ชื่อผู้รับ").fill("ผู้ซื้อตัวอย่าง 3");
  await seller.getByRole("button", { name: "บันทึก" }).click();
  await expect(seller.getByRole("status")).toHaveText("บันทึกแล้ว");
  const changedAt = Date.now();

  // NTF-014 กระดิ่งเพิ่มขึ้นเองโดยหน้าไม่โหลดใหม่และตำแหน่งที่เลื่อนอ่านอยู่ไม่ขยับ
  await expect(bell(home)).toHaveAccessibleName(bellName(before + 1), { timeout: LIVE_UPDATE_MS });
  expect(Date.now() - changedAt).toBeLessThan(LIVE_UPDATE_MS);
  await expect(header(home).locator("[aria-live]")).toHaveText("มีแจ้งเตือนใหม่ 1 รายการ");
  expect(await home.evaluate(() => (window as unknown as { openedOnce?: boolean }).openedOnce)).toBe(true);
  expect(await home.evaluate(() => window.scrollY)).toBe(scrolledTo);

  // NTF-014 หน้าแจ้งเตือนได้แถบให้กดแสดง รายการที่กำลังดูไม่ขยับ
  const banner = list.getByRole("button", { name: "มีแจ้งเตือนใหม่ 1 รายการ กดเพื่อแสดง" });
  await expect(banner).toBeVisible({ timeout: LIVE_UPDATE_MS });
  expect(await listed(list).count()).toBe(listedBefore);
  // NTF-014 รายการใต้กระดิ่งที่กางอยู่ได้แจ้งเตือนใหม่เป็นรายการบนสุดเอง
  await expect(panel(list).locator('a[href^="/notifications/"]').first()).toContainText(`พัสดุ ${trackingNo} จากร้าน ใจดีช็อป เป็น ส่งสำเร็จ`, {
    timeout: LIVE_UPDATE_MS,
  });
  await list.keyboard.press("Escape");
  await banner.click();
  await expect(listed(list).first()).toContainText(`พัสดุ ${trackingNo} จากร้าน ใจดีช็อป เป็น ส่งสำเร็จ`);
  await expect(banner).toBeHidden();

  // NTF-002 กดกระดิ่งเห็นรายการใหม่บนสุด และการกางรายการไม่ทำให้อ่านแล้ว
  await bell(home).click();
  const top = panel(home).locator('a[href^="/notifications/"]').first();
  await expect(top).toContainText(`พัสดุ ${trackingNo} จากร้าน`);
  await expect(top).toContainText("เป็น ส่งสำเร็จ กดได้รับสินค้าแล้วเมื่อได้ของ");
  await expect(top).toContainText("ยังไม่อ่าน");
  await expect(panel(home).getByRole("link", { name: "ดูทั้งหมด" })).toBeVisible();
  await top.hover();
  await home.waitForTimeout(1_500);
  expect(unreadOf("buyer3@example.com")).toBe(before + 1);
  await expect(bell(home)).toHaveAccessibleName(bellName(before + 1));

  // NTF-004 กดแจ้งเตือนแล้วไปหน้าติดตามพัสดุ กระดิ่งลดลง 1
  await top.click();
  await expect(home).toHaveURL(new RegExp(`/track/${trackingNo}$`));
  await expect(home.getByRole("heading", { level: 1 })).toContainText("ส่งสำเร็จ");
  await expect(bell(home)).toHaveAccessibleName(bellName(before));
  await bell(home).click();
  await expect(panel(home).locator('a[href^="/notifications/"]').first()).toContainText(`พัสดุ ${trackingNo}`);
  await expect(panel(home).locator('a[href^="/notifications/"]').first()).not.toContainText("ยังไม่อ่าน");

  // NTF-014 อีกหน้าต่างของบัญชีเดียวกันได้จำนวนที่ลดลงภายใน 10 วินาทีเช่นกัน
  await expect(bell(list)).toHaveAccessibleName(bellName(before), { timeout: LIVE_UPDATE_MS });

  // NTF-Q03 ตัวเลขหลังโหลดหน้าใหม่เท่ากับจำนวนที่ยังไม่อ่านจริง
  await home.reload();
  await expect(bell(home)).toHaveAccessibleName(bellName(unreadOf("buyer3@example.com")));
  expect(unreadOf("buyer3@example.com")).toBe(before);

  // NTF-016 ผู้ขายไม่ได้แจ้งเตือนของผู้ซื้อ
  await seller.goto("/notifications");
  await expect(seller.getByText(trackingNo)).toHaveCount(0);
});

test("NTF-005 NTF-002 กดอ่านทั้งหมดแล้วจากรายการใต้กระดิ่ง กระดิ่งไม่มีตัวเลข และปิดรายการด้วย Escape หรือกดนอกรายการ", async ({ browser }) => {
  const page = await signedInPage(browser, "buyer2@example.com");
  await page.goto("/");
  await expect(bell(page)).toHaveAccessibleName(/ยังไม่อ่าน \d+ รายการ/);

  await bell(page).click();
  await expect(items(page).first()).toBeVisible();
  expect(await items(page).count()).toBeLessThanOrEqual(10);
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect(bell(page)).toBeFocused();

  await bell(page).click();
  await expect(panel(page)).toBeVisible();
  await page.getByRole("main").click({ position: { x: 5, y: 5 } });
  await expect(panel(page)).toBeHidden();

  await bell(page).click();
  await panel(page).getByRole("button", { name: "อ่านทั้งหมดแล้ว" }).click();
  await expect(bell(page)).toHaveAccessibleName("แจ้งเตือน");
  await expect(bell(page)).toHaveText("");
  await expect(panel(page).getByRole("button", { name: "อ่านทั้งหมดแล้ว" })).toBeDisabled();
  await expect(panel(page).getByText("ยังไม่อ่าน")).toHaveCount(0);
  expect(unreadOf("buyer2@example.com")).toBe(0);
});

test("NTF-002 NTF-015 อินเทอร์เน็ตหลุด กดกระดิ่งเห็นข้อความโหลดไม่สำเร็จพร้อมปุ่มลองใหม่ กระดิ่งแสดงตัวเลขล่าสุดที่รู้ และกลับมาแล้วลองใหม่ได้รายการ", async ({ browser }) => {
  const page = await signedInPage(browser, "buyer1@example.com");
  await page.goto("/");
  const unread = unreadOf("buyer1@example.com");
  await expect(bell(page)).toHaveAccessibleName(bellName(unread));

  await page.context().setOffline(true);
  await bell(page).click();
  await expect(panel(page).getByRole("alert")).toContainText("โหลดแจ้งเตือนไม่สำเร็จ");
  await page.waitForTimeout(6_000);
  await expect(bell(page)).toHaveAccessibleName(bellName(unread));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.context().setOffline(false);
  await panel(page).getByRole("button", { name: "ลองใหม่" }).click();
  await expect(items(page)).toHaveCount(10);
  await expect(bell(page)).toHaveAccessibleName(bellName(unread));
});

test("NTF-001 NTF-003 NTF-005 สคริปต์ของหน้าไม่ทำงาน กระดิ่งเป็นลิงก์ไปหน้าแจ้งเตือน เปลี่ยนหน้า กดแจ้งเตือน และกดอ่านทั้งหมดแล้วได้", async ({ browser }) => {
  const unread = unreadOf("seller01@example.com");
  const page = await signedInPage(browser, "seller01@example.com", { javaScriptEnabled: false });
  await page.goto("/");

  await header(page).getByRole("link", { name: bellName(unread) }).click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByText(`ยังไม่อ่าน ${unread} รายการ`)).toBeVisible();
  await expect(items(page).first()).toContainText("ร้านของฉัน: ");

  await items(page).first().click();
  await expect(page).toHaveURL(/\/seller\/(orders\/\d+|stock\?filter=out)$/);
  await expect(header(page).getByRole("link", { name: bellName(unread - 1) })).toBeVisible();

  await page.goto("/notifications");
  await page.getByRole("button", { name: "อ่านทั้งหมดแล้ว" }).click();
  await expect(page.getByText("ยังไม่อ่าน 0 รายการ")).toBeVisible();
  await expect(header(page).getByRole("link", { name: "แจ้งเตือน", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "อ่านทั้งหมดแล้ว" })).toBeDisabled();
});

test("NTF-004 NTF-016 NTF-017 เปิดลิงก์แจ้งเตือนของบัญชีอื่นเห็น ไม่พบแจ้งเตือน ผู้ดูแลแพลตฟอร์มเห็น ยังไม่มีแจ้งเตือน และคนที่ยังไม่เข้าสู่ระบบไม่เห็นกระดิ่ง", async ({
  browser,
  page: guest,
}) => {
  const [{ id }] = query<{ id: number }>("SELECT n.id FROM notifications n JOIN accounts a ON a.id = n.account_id WHERE a.email = 'buyer1@example.com' LIMIT 1");
  const unread = unreadOf("buyer1@example.com");

  const other = await signedInPage(browser, "buyer3@example.com");
  await other.goto(`/notifications/${id}`);
  await expect(other.getByRole("heading", { name: "ไม่พบแจ้งเตือน" })).toBeVisible();
  expect(unreadOf("buyer1@example.com")).toBe(unread);

  const context = await browser.newContext();
  const admin = await context.newPage();
  await admin.goto("/login");
  await admin.getByLabel("อีเมล").fill("admin@example.com");
  await admin.getByLabel("รหัสผ่าน").fill("admin1234");
  await admin.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await admin.waitForURL((url) => url.pathname !== "/login");
  await admin.goto("/");
  await expect(bell(admin)).toHaveAccessibleName("แจ้งเตือน");
  await bell(admin).click();
  await expect(panel(admin).getByText("ยังไม่มีแจ้งเตือน")).toBeVisible();
  await panel(admin).getByRole("link", { name: "ดูทั้งหมด" }).click();
  await expect(admin.getByRole("heading", { name: "ยังไม่มีแจ้งเตือน" })).toBeVisible();
  await expect(admin.getByRole("button", { name: "อ่านทั้งหมดแล้ว" })).toBeDisabled();
  await expect(admin.getByText(/หน้า \d+ จาก/)).toHaveCount(0);

  await guest.goto("/");
  await expect(header(guest).getByRole("link", { name: "ตะกร้า", exact: true })).toBeVisible();
  await expect(header(guest).getByText("แจ้งเตือน")).toHaveCount(0);
  await expect(header(guest).locator('[aria-label^="แจ้งเตือน"]')).toHaveCount(0);
  await guest.goto("/notifications");
  await expect(guest).toHaveURL(/\/login\?next=%2Fnotifications$/);
});

test.describe("จอกว้าง 360 จุด", () => {
  test("NTF-Q06 NTF-001 NTF-003 บัญชีที่กระดิ่งเป็น 99+ แถบด้านบน รายการใต้กระดิ่ง และหน้าแจ้งเตือนไม่ทำให้หน้าเลื่อนซ้ายขวา กระดิ่งและแต่ละรายการสูงและกว้างอย่างน้อย 44 จุด", async ({
    browser,
  }) => {
    const db = new DatabaseSync(E2E_DB);
    const account = db.prepare("SELECT id FROM accounts WHERE email = 'seller03@example.com'").get() as { id: number };
    db.prepare("DELETE FROM notifications WHERE account_id = ?").run(account.id);
    const insert = db.prepare("INSERT INTO notifications (account_id, type, message, href, event_key, created_at) VALUES (?, 'shop-stock-empty', ?, '/seller/stock?filter=out', ?, ?)");
    for (let n = 1; n <= 120; n++) {
      insert.run(account.id, `ร้านของฉัน: เสื้อยืดคอกลมผ้าฝ้ายแขนสั้นลายทางรุ่นพิเศษ สีกรมท่า ขนาด ${n} สต็อกเหลือ 0 ชิ้น`, `e2e:${n}`, new Date(Date.now() - n * 60_000).toISOString());
    }
    db.close();

    const page = await signedInPage(browser, "seller03@example.com", { width: 360 });
    await page.goto("/");
    await expect(bell(page)).toHaveText("99+");
    await expect(bell(page)).toHaveAccessibleName("แจ้งเตือน ยังไม่อ่าน 120 รายการ");
    expect(await overflow(page)).toBe(0);
    expect((await page.getByRole("banner").boundingBox())!.height).toBeLessThanOrEqual(57);
    const bellBox = (await bell(page).boundingBox())!;
    expect(bellBox.width).toBeGreaterThanOrEqual(44);
    expect(bellBox.height).toBeGreaterThanOrEqual(44);
    // กระดิ่งอยู่ก่อนไอคอนตะกร้า ในแถวเดียวกับโลโก้ ช่องค้นหา และปุ่มเมนู
    const cart = (await header(page).getByRole("link", { name: /^ตะกร้า/ }).boundingBox())!;
    const menu = (await header(page).getByRole("button", { name: "เมนู" }).boundingBox())!;
    const search = (await page.getByRole("searchbox", { name: "คำค้น" }).boundingBox())!;
    expect(bellBox.x + bellBox.width).toBeLessThanOrEqual(cart.x + 1);
    expect(Math.abs(bellBox.y - cart.y)).toBeLessThan(2);
    expect(Math.abs(bellBox.y - menu.y)).toBeLessThan(2);
    expect(search.width).toBeGreaterThanOrEqual(44);

    await bell(page).click();
    await expect(items(page)).toHaveCount(10);
    expect(await overflow(page)).toBe(0);
    for (const box of await Promise.all((await items(page).all()).map((item) => item.boundingBox()))) {
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    }
    const panelBox = (await panel(page).boundingBox())!;
    expect(panelBox.x).toBeGreaterThanOrEqual(0);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(360);

    await panel(page).getByRole("link", { name: "ดูทั้งหมด" }).click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByText("หน้า 1 จาก 6")).toBeVisible();
    await expect(items(page)).toHaveCount(20);
    expect(await overflow(page)).toBe(0);
    for (const box of await Promise.all((await items(page).all()).map((item) => item.boundingBox()))) {
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole("link", { name: "ถัดไป" }).click();
    await expect(page.getByText("หน้า 2 จาก 6")).toBeVisible();
    await page.goto("/notifications?page=99");
    await expect(page.getByText("หน้า 6 จาก 6")).toBeVisible();
    await expect(page.getByRole("button", { name: "ถัดไป" })).toBeDisabled();
    expect(await overflow(page)).toBe(0);
  });
});

test("NTF-014 หน้าแจ้งเตือนถามเซิร์ฟเวอร์รอบละครั้งเดียว ไม่ถามตอนแท็บถูกซ่อน ถามทันทีเมื่อกลับมา และการถามไม่ต่ออายุการเข้าสู่ระบบ", async ({ browser }) => {
  const page = await signedInPage(browser, "buyer3@example.com");
  const asked: number[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) asked.push(Date.now());
  });
  const session = () =>
    query<{ last_used_at: string; expires_at: string }>(
      `SELECT se.last_used_at, se.expires_at FROM sessions se JOIN accounts a ON a.id = se.account_id
       WHERE a.email = ? ORDER BY se.id DESC LIMIT 1`,
      "buyer3@example.com",
    )[0];

  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "แจ้งเตือน" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const loaded = session();
  asked.length = 0;

  // 11 วินาทีมีรอบถาม 2 รอบ กระดิ่งกับแถบแจ้งเตือนใหม่ใช้รอบเดียวกัน
  await page.waitForTimeout(11_000);
  expect(asked.length).toBeGreaterThanOrEqual(2);
  expect(asked.length).toBeLessThanOrEqual(3);
  expect(session()).toEqual(loaded);

  const setHidden = (hidden: boolean) =>
    page.evaluate((value) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => value });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
  await setHidden(true);
  await page.waitForTimeout(1_000);
  asked.length = 0;
  await page.waitForTimeout(6_000);
  expect(asked).toEqual([]);

  await setHidden(false);
  await expect.poll(() => asked.length, { timeout: 2_000 }).toBe(1);
  await page.context().close();
});
