// ภาพ 3 มิติของสินค้า (docs/requirements/product-3d-view.md) ผ่านหน้าเว็บจริงกับข้อมูลตัวอย่าง
// SCREENSHOTS=1 pnpm e2e บันทึกภาพตัวแสดง 3 มิติลง docs/screenshots/

import { readFileSync } from "node:fs";
import { devices, expect, test, type Browser, type Page } from "@playwright/test";

const SAVE_SCREENSHOTS = process.env.SCREENSHOTS === "1";
// สินค้าตัวอย่างที่ README บอกว่ามีไฟล์ 3 มิติ
const chair = "เก้าอี้ผ้ากำมะหยี่";
const isModelFile = (url: string | URL) => new URL(url).pathname.startsWith("/product-models/");
const isModelUpload = (url: URL) => url.pathname === "/product-models";

/** เปิดหน้าสินค้าจากการค้นหาที่หน้าแรก แล้วนับคำขอไฟล์ 3 มิติทั้งหมดของหน้านี้ */
async function openProduct(page: Page, name: string) {
  const modelRequests: string[] = [];
  page.on("request", (request) => {
    if (isModelFile(request.url()) && request.method() === "GET") modelRequests.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("searchbox", { name: "คำค้น" }).fill(name);
  await page.getByRole("button", { name: "ค้นหา" }).click();
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  return modelRequests;
}

const viewer = (page: Page) => page.locator("model-viewer");
const loaded = (page: Page) => viewer(page).evaluate((element) => (element as HTMLElement & { loaded: boolean }).loaded);
const theta = (page: Page) =>
  viewer(page).evaluate((element) => (element as HTMLElement & { getCameraOrbit(): { theta: number } }).getCameraOrbit().theta);

async function waitForModel(page: Page) {
  await expect.poll(() => loaded(page), { timeout: 30_000 }).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: "กำลังโหลด" })).toHaveCount(0);
}

test("P3D-003 P3D-004 P3D-005 P3D-Q01 ผู้ซื้อกด ดูแบบ 3 มิติ หมุนด้วยการลากและปุ่มลูกศร ซูมได้ แล้วกดรูปย่อกลับไปดูรูป", async ({ page }) => {
  const modelRequests = await openProduct(page, chair);

  // P3D-003 รูปย่อ 3 รูปตามด้วยทางเข้า และรูปใหญ่เป็นรูปปก
  const gallery = page.getByRole("article").getByRole("list").first();
  await expect(gallery.getByRole("button")).toHaveText(["", "", "", "ดูแบบ 3 มิติ"]);
  const cover = await gallery.getByRole("button", { name: "ดูรูปที่ 1" }).locator("img").getAttribute("src");
  await expect(page.getByRole("img", { name: chair })).toHaveAttribute("src", cover!);
  // P3D-Q01 ยังไม่กดจึงยังไม่มีคำขอไฟล์ 3 มิติ
  expect(modelRequests).toEqual([]);

  await page.getByRole("button", { name: "ดูแบบ 3 มิติ" }).click();
  await waitForModel(page);
  expect(modelRequests).toHaveLength(1);
  await expect(page.getByRole("button", { name: "ดูแบบ 3 มิติ" })).toHaveAttribute("aria-pressed", "true");

  // P3D-005 บนแล็ปท็อปไม่มีปุ่ม ดูในห้องของคุณ แต่ตัวแสดงตั้งให้วางของขนาดจริงแบบย่อขยายไม่ได้ไว้แล้ว
  await expect(viewer(page)).toHaveAttribute("ar", "");
  await expect(viewer(page)).toHaveAttribute("ar-scale", "fixed");
  await expect(page.getByRole("button", { name: "ดูในห้องของคุณ" })).toBeHidden();
  expect(await viewer(page).evaluate((element) => (element as HTMLElement & { canActivateAR: boolean }).canActivateAR)).toBe(false);

  // ภาพหน้าจอของตัวแสดง และตรวจว่าที่จอกว้าง 390 และ 360 จุดไม่มีส่วนล้นจนต้องเลื่อนซ้ายขวา
  const settle = () => page.evaluate(() => new Promise((done) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(done)), 300)));
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (SAVE_SCREENSHOTS) {
    // รอแถบความคืบหน้าของตัวแสดงจางหายก่อนถ่าย
    const bar = () =>
      viewer(page).evaluate((element) => getComputedStyle(element.shadowRoot!.querySelector("#default-progress-bar > .bar")!).opacity);
    await expect.poll(bar).toBe("0");
    await page.screenshot({ path: "docs/screenshots/p3d-viewer-desktop.png" });
  }
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await settle();
    expect(await overflow(), `หน้าสินค้าที่แสดงแบบ 3 มิติล้นจอกว้าง ${width} จุด`).toBeLessThanOrEqual(0);
  }
  if (SAVE_SCREENSHOTS) await page.screenshot({ path: "docs/screenshots/p3d-viewer-390.png" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await settle();

  // P3D-004 ลากเมาส์ไปทางซ้ายแล้วสินค้าหมุน
  const box = (await viewer(page).boundingBox())!;
  const start = await theta(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => theta(page)).not.toBeCloseTo(start, 2);

  // P3D-004 ใช้ปุ่มลูกศรหมุนได้ด้วย
  const beforeKey = await theta(page);
  await viewer(page).focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => theta(page)).not.toBeCloseTo(beforeKey, 2);

  // P3D-004 ซูมด้วยล้อเมาส์
  const radius = () =>
    viewer(page).evaluate((element) => (element as HTMLElement & { getCameraOrbit(): { radius: number } }).getCameraOrbit().radius);
  const far = await radius();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);
  await expect.poll(radius).toBeLessThan(far);

  // P3D-004 กดรูปย่อรูปที่ 2 แล้วพื้นที่รูปใหญ่กลับไปแสดงรูปที่ 2
  await gallery.getByRole("button", { name: "ดูรูปที่ 2" }).click();
  await expect(viewer(page)).toHaveCount(0);
  const second = await gallery.getByRole("button", { name: "ดูรูปที่ 2" }).locator("img").getAttribute("src");
  await expect(page.getByRole("img", { name: chair })).toHaveAttribute("src", second!);
});

test("P3D-004 อินเทอร์เน็ตหลุดตอนกด ดูแบบ 3 มิติ เห็นข้อความกับปุ่ม ลองใหม่ รูปย่อและกล่องซื้อยังใช้ได้ ลองใหม่สำเร็จ และกลับมาดูแบบ 3 มิติได้อีก", async ({ page }) => {
  await openProduct(page, chair);
  await page.route(isModelFile, (route) => route.abort("internetdisconnected"));

  await page.getByRole("button", { name: "ดูแบบ 3 มิติ" }).click();
  const failed = page.getByRole("alert").filter({ hasText: "แสดงภาพ 3 มิติไม่ได้ ลองใหม่อีกครั้ง" });
  await expect(failed.getByRole("button", { name: "ลองใหม่" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ใส่ตะกร้า" })).toBeVisible();

  await page.unroute(isModelFile);
  await page.getByRole("button", { name: "ลองใหม่" }).click();
  await waitForModel(page);

  await page.getByRole("button", { name: "ดูรูปที่ 3" }).click();
  await expect(viewer(page)).toHaveCount(0);

  // กลับมาดูแบบ 3 มิติอีกครั้ง ต้องไม่ได้ผลที่โหลดไม่สำเร็จครั้งแรกกลับมา
  await page.getByRole("button", { name: "ดูแบบ 3 มิติ" }).click();
  await waitForModel(page);
});

test("P3D-004 โหลดไม่สำเร็จแล้วไปดูรูปย่อ พออินเทอร์เน็ตกลับมา กด ดูแบบ 3 มิติ อีกครั้งก็เห็นภาพ", async ({ page }) => {
  await openProduct(page, chair);
  await page.route(isModelFile, (route) => route.abort("internetdisconnected"));
  await page.getByRole("button", { name: "ดูแบบ 3 มิติ" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "แสดงภาพ 3 มิติไม่ได้ ลองใหม่อีกครั้ง" })).toBeVisible();

  await page.getByRole("button", { name: "ดูรูปที่ 2" }).click();
  await page.unroute(isModelFile);
  await page.getByRole("button", { name: "ดูแบบ 3 มิติ" }).click();
  await waitForModel(page);
});

/** หยุดเวลาของหน้า หลังจากนี้เวลาเดินเฉพาะตอน test เลื่อนเอง ต้องเรียก page.clock.install() ก่อนเปิดหน้า */
const pauseClock = async (page: Page) => page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);

test("P3D-Q02 ไฟล์ 3 มิติโหลดเกิน 30 วินาที เห็นข้อความกับปุ่ม ลองใหม่ แทนสัญลักษณ์กำลังโหลด", async ({ page }) => {
  await page.clock.install();
  await openProduct(page, chair);
  // ไฟล์ไม่มาเลย คำขอค้างไว้จนจบ test
  const requested = new Promise<void>((resolve) => void page.route(isModelFile, () => resolve()));
  await pauseClock(page);

  await page.getByRole("button", { name: "ดูแบบ 3 มิติ" }).click();
  await requested;
  const loading = page.getByRole("status").filter({ hasText: "กำลังโหลด" });
  const failed = page.getByRole("alert").filter({ hasText: "แสดงภาพ 3 มิติไม่ได้ ลองใหม่อีกครั้ง" });
  await page.clock.fastForward(29_000);
  await expect(loading).toBeVisible();
  await expect(failed).toHaveCount(0);

  await page.clock.fastForward(1_000);
  await expect(failed.getByRole("button", { name: "ลองใหม่" })).toBeVisible();
  await expect(loading).toHaveCount(0);
});

test.describe("P3D-005 บนมือถือ Android ที่วางของในห้องได้", () => {
  const { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
  test.use({ userAgent, viewport, deviceScaleFactor, isMobile, hasTouch });

  test("P3D-005 กด ดูแบบ 3 มิติ แล้วเห็นปุ่ม ดูในห้องของคุณ (จำลองเครื่อง ไม่ได้เปิดกล้องจริง)", async ({ page }) => {
    await openProduct(page, chair);
    await page.getByRole("button", { name: "ดูแบบ 3 มิติ" }).click();
    await waitForModel(page);
    await expect(page.getByRole("button", { name: "ดูในห้องของคุณ" })).toBeVisible();
    expect(await viewer(page).evaluate((element) => (element as HTMLElement & { canActivateAR: boolean }).canActivateAR)).toBe(true);
  });
});

/** เข้าสู่ระบบเป็นผู้ขายของร้านแรกในข้อมูลตัวอย่าง แล้วเปิดหน้ารายการสินค้าของร้าน คืนแถวของสินค้าชิ้นแรก */
async function openSellerProducts(page: Page) {
  await page.goto("/login");
  await page.getByLabel("อีเมล").fill("seller01@example.com");
  await page.getByLabel("รหัสผ่าน").fill("demo1234");
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await expect(page.getByRole("navigation", { name: "เมนูหลัก" }).getByRole("link", { name: "ร้านของฉัน" })).toBeVisible();
  await page.goto("/seller/products");
  return page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "แก้ไข" }) }).first();
}

const modelInput = (page: Page) => page.getByLabel(/^(เลือก|เปลี่ยน)ไฟล์ 3 มิติ$/);
const saveButton = (page: Page) => page.getByRole("button", { name: "บันทึก", exact: true });
const chairGlb = () => ({ name: "chair.glb", mimeType: "model/gltf-binary", buffer: readFileSync("src/shared/seed/models/SheenChair.glb") });

test("P3D-001 P3D-002 ผู้ขายเพิ่ม เปลี่ยน และเอาไฟล์ 3 มิติออกจากสินค้าของร้าน", async ({ page }) => {
  const row = await openSellerProducts(page);
  const name = (await row.locator("p").first().textContent())!;
  const startedAt = Date.now();
  await row.getByRole("link", { name: "แก้ไข" }).click();
  await expect(page.getByRole("heading", { name: "แก้ไขสินค้า" })).toBeVisible();
  const productId = page.url().match(/\/seller\/products\/(\d+)/)![1];
  const fileInput = () => modelInput(page);
  const save = saveButton(page);
  await expect(page.getByText("ไฟล์ .glb ไม่เกิน 10 MB ของในไฟล์ต้องมีขนาดจริง หน่วยเป็นเมตร")).toBeVisible();

  // P3D-001 ไฟล์ที่ไม่ผ่านเงื่อนไขไม่ถูกรับ และข้อมูลอื่นยังอยู่ครบ
  const jpg = Buffer.alloc(2048);
  jpg.set([0xff, 0xd8, 0xff, 0xe0]);
  await fileInput().setInputFiles({ name: "photo.glb", mimeType: "model/gltf-binary", buffer: jpg });
  await expect(page.getByText("photo.glb: ไฟล์ต้องเป็นชนิด GLB")).toBeVisible();
  const big = Buffer.alloc(12 * 1024 * 1024);
  big.write("glTF", 0, "latin1");
  big.writeUInt32LE(2, 4);
  big.writeUInt32LE(big.length, 8);
  await fileInput().setInputFiles({ name: "big.glb", mimeType: "model/gltf-binary", buffer: big });
  await expect(page.getByText("big.glb: ไฟล์ 3 มิติต้องมีขนาดไม่เกิน 10 MB")).toBeVisible();
  await expect(page.getByRole("button", { name: "เอาออก" })).toHaveCount(0);
  await expect(page.getByLabel("ชื่อสินค้า")).toHaveValue(name);

  // P3D-001 ส่งไฟล์ไม่สำเร็จ เห็นข้อความ ปุ่มลองใหม่ ปุ่มเอาออก และบันทึกไม่ได้จนกว่าจะส่งสำเร็จ
  await page.route(isModelUpload, (route) => route.abort("internetdisconnected"));
  await fileInput().setInputFiles(chairGlb());
  await expect(page.getByRole("alert").filter({ hasText: "ส่งไฟล์ไม่สำเร็จ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "เอาออก" })).toBeVisible();
  await expect(save).toBeDisabled();
  await page.unroute(isModelUpload);

  // P3D-001 ระหว่างส่งเห็นแถบความคืบหน้า เสร็จแล้วเห็นชื่อและขนาดไฟล์
  await page.route(isModelUpload, async (route) => {
    await new Promise((done) => setTimeout(done, 1000));
    await route.continue();
  });
  await page.getByRole("button", { name: "ลองใหม่" }).click();
  await expect(page.getByRole("progressbar", { name: "กำลังส่งไฟล์ 3 มิติ" })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(0, { timeout: 30_000 });
  await page.unroute(isModelUpload);
  await expect(page.getByText("chair.glb 3.9 MB")).toBeVisible();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText("บันทึกแล้ว")).toBeVisible();
  // ตัวเลขความสำเร็จ: ผู้ขายเพิ่มไฟล์ให้สินค้าหนึ่งชิ้นได้ภายใน 1 นาที เครื่องกดเร็วกว่าคน จึงต้องเร็วกว่านั้นมาก
  expect(Date.now() - startedAt).toBeLessThan(60_000);

  await page.goto(`/products/${productId}`);
  await expect(page.getByRole("button", { name: "ดูแบบ 3 มิติ" })).toBeVisible();

  // P3D-002 กดเอาออกแล้วออกจากหน้าโดยไม่บันทึก สินค้ายังมีไฟล์เดิม
  await page.goto(`/seller/products/${productId}`);
  await expect(page.getByText("chair.glb 3.9 MB")).toBeVisible();
  await page.getByRole("button", { name: "เอาออก" }).click();
  await page.getByRole("link", { name: "กลับไปรายการสินค้า" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "ออกโดยไม่บันทึก" }).click();
  await expect(page.getByRole("heading", { name: "สินค้า", exact: true })).toBeVisible();
  await page.goto(`/products/${productId}`);
  await expect(page.getByRole("button", { name: "ดูแบบ 3 มิติ" })).toBeVisible();

  // P3D-002 กดเอาออกแล้วบันทึก หน้าสินค้าไม่มีทางเข้า ดูแบบ 3 มิติ และรูปยังอยู่
  await page.goto(`/seller/products/${productId}`);
  await page.getByRole("button", { name: "เอาออก" }).click();
  await expect(page.getByText("chair.glb")).toHaveCount(0);
  await save.click();
  await expect(page.getByText("บันทึกแล้ว")).toBeVisible();
  await page.goto(`/products/${productId}`);
  await expect(page.getByRole("img", { name })).toBeVisible();
  await expect(page.getByRole("button", { name: "ดูแบบ 3 มิติ" })).toHaveCount(0);
});

test("P3D-001 ไฟล์ที่ส่งไม่เสร็จใน 60 วินาที เห็น ส่งไฟล์ไม่สำเร็จ พร้อมปุ่ม ลองใหม่ และ เอาออก ข้อมูลอื่นยังอยู่ และบันทึกไม่ได้", async ({ page }) => {
  await page.clock.install();
  const row = await openSellerProducts(page);
  const name = (await row.locator("p").first().textContent())!;
  await row.getByRole("link", { name: "แก้ไข" }).click();
  await expect(page.getByRole("heading", { name: "แก้ไขสินค้า" })).toBeVisible();
  // สัญญาณช้าจนไฟล์ส่งไม่เสร็จ คำขอค้างไว้จนจบ test
  const sending = new Promise<void>((resolve) => void page.route(isModelUpload, () => resolve()));
  await pauseClock(page);

  await modelInput(page).setInputFiles(chairGlb());
  await sending;
  const failed = page.getByRole("alert").filter({ hasText: "ส่งไฟล์ไม่สำเร็จ" });
  await page.clock.fastForward(59_000);
  await expect(page.getByRole("progressbar", { name: "กำลังส่งไฟล์ 3 มิติ" })).toBeVisible();
  await expect(failed).toHaveCount(0);

  await page.clock.fastForward(1_000);
  await expect(failed).toBeVisible();
  await expect(page.getByRole("button", { name: "ลองใหม่" })).toBeVisible();
  await expect(page.getByRole("button", { name: "เอาออก" })).toBeVisible();
  await expect(saveButton(page)).toBeDisabled();
  await expect(page.getByLabel("ชื่อสินค้า")).toHaveValue(name);
});

const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.ceil((p / 100) * values.length) - 1];

test("P3D-Q01 เปิดหน้าสินค้าที่มีไฟล์ 3 มิติ 100 ครั้งโดยไม่กด แสดงผลภายใน 2 วินาทีอย่างน้อย 95 ครั้ง และไม่มีคำขอไฟล์ 3 มิติเลย", async ({ page }) => {
  const modelRequests = await openProduct(page, chair);
  const path = new URL(page.url()).pathname;
  const times: number[] = [];
  for (let i = 0; i < 100; i++) {
    const started = Date.now();
    await page.goto(path, { waitUntil: "load" });
    times.push(Date.now() - started);
  }
  await page.waitForLoadState("networkidle");
  console.log(`P3D-Q01 ${path} 100 ครั้ง p50 ${percentile(times, 50)} p95 ${percentile(times, 95)} ช้าสุด ${Math.max(...times)} มิลลิวินาที`);
  expect(times.filter((ms) => ms <= 2000).length).toBeGreaterThanOrEqual(95);
  expect(modelRequests).toEqual([]);
});

/** จับเวลาจากกด "ดูแบบ 3 มิติ" จนตัวแสดงโหลดไฟล์เสร็จและหมุนได้ ในหน้าที่เพิ่งเปิดใหม่ของเบราว์เซอร์ที่ยังไม่มีแคช */
async function timeToModel(browser: Browser, path: string): Promise<number> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const ms = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const started = performance.now();
        new MutationObserver((_, observer) => {
          const element = document.querySelector("model-viewer");
          if (!element) return;
          observer.disconnect();
          element.addEventListener("load", () => resolve(performance.now() - started), { once: true });
        }).observe(document.body, { childList: true, subtree: true });
        [...document.querySelectorAll("button")].find((button) => button.textContent === "ดูแบบ 3 มิติ")!.click();
      }),
  );
  await context.close();
  return Math.round(ms);
}

test("P3D-Q02 กด ดูแบบ 3 มิติ ของไฟล์ไม่เกิน 5 MB 10 ครั้งโดยเปิดหน้าใหม่ทุกครั้ง หมุนได้ภายใน 5 วินาทีอย่างน้อย 9 ครั้ง", async ({ page, browser }) => {
  await openProduct(page, chair);
  const path = new URL(page.url()).pathname;
  const times: number[] = [];
  for (let i = 0; i < 10; i++) times.push(await timeToModel(browser, path));
  console.log(`P3D-Q02 ${path} 10 ครั้ง (มิลลิวินาที): ${times.join(" ")} ช้าสุด ${Math.max(...times)}`);
  expect(times.filter((ms) => ms <= 5000).length).toBeGreaterThanOrEqual(9);
});
