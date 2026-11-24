// วัดคุณภาพขั้นต่ำของ product.md ส่วนที่ 6 กับแอปที่เปิดอยู่ ดูวิธีใช้ใน README หัวข้อ "ความเร็ว"
//   DATABASE_PATH=data/speed.db pnpm tsx scripts/measure-speed.ts http://localhost:3563
// ขั้น 1: เปิดหน้าหลักทีละหน้า หน้าละ 100 ครั้งใน Chrome จับเวลาตั้งแต่เริ่มเปิดจนหน้าโหลดเสร็จ (load event)
// ขั้น 2: ผู้ใช้จำลอง 20 คนขอหน้าพร้อมกันวนไปเรื่อยๆ นาน SPEED_LOAD_SECONDS วินาที (ค่าเริ่มต้น 300) จับเวลาจนได้หน้าครบ
// สคริปต์สร้างการเข้าสู่ระบบของ buyer1 และ seller01 และใส่ของ 2 ชิ้นลงตะกร้าของ buyer1 ในฐานข้อมูลที่แอปใช้

import { chromium } from "@playwright/test";
import { createSession } from "@/features/account/server/sessions";
import { addToCart } from "@/features/cart/server/cart";
import { databasePath, openDb } from "@/shared/db";
import { SESSION_COOKIE } from "@/shared/session";

const base = process.argv[2] ?? "http://localhost:3100";
const loads = Number(process.env.SPEED_LOADS ?? 100);
const loadSeconds = Number(process.env.SPEED_LOAD_SECONDS ?? 300);
const USERS = 20;
const LIMIT_MS = 2000;

const db = openDb(databasePath());
const idOf = (sql: string) => {
  const row = db.prepare(sql).get();
  if (!row) throw new Error(`ไม่พบข้อมูลตัวอย่างสำหรับ ${sql} รัน pnpm seed ก่อน`);
  return String(Object.values(row)[0]);
};
const buyerId = Number(idOf("SELECT id FROM accounts WHERE email = 'buyer1@example.com'"));
const sellerId = Number(idOf("SELECT id FROM accounts WHERE email = 'seller01@example.com'"));
if (!db.prepare("SELECT 1 FROM cart_items WHERE account_id = ?").get(buyerId)) {
  for (const variant of db.prepare("SELECT id FROM variants WHERE stock > 5 ORDER BY id DESC LIMIT 2").all()) {
    addToCart(db, buyerId, { variantId: Number(variant.id), quantity: "1" });
  }
}
const sessions = { buyer: createSession(db, buyerId), seller: createSession(db, sellerId) };
const orderNo = idOf(`SELECT order_no FROM orders WHERE buyer_account_id = ${buyerId} AND status = 'กำลังจัดส่ง' LIMIT 1`);
const groupId = idOf(`SELECT group_id FROM orders WHERE order_no = '${orderNo}'`);
const trackingNo = idOf(`SELECT p.tracking_no FROM parcels p JOIN orders o ON o.id = p.order_id WHERE o.order_no = '${orderNo}'`);
const productId = idOf("SELECT id FROM products WHERE status = 'ขายอยู่' ORDER BY id DESC LIMIT 1");
const shopId = idOf("SELECT shop_id FROM products WHERE status = 'ขายอยู่' ORDER BY id DESC LIMIT 1");
db.close();

const pages: { who: "guest" | keyof typeof sessions; path: string }[] = [
  { who: "guest", path: "/" },
  { who: "guest", path: `/?q=${encodeURIComponent("เสื้อ")}` },
  { who: "guest", path: `/products/${productId}` },
  { who: "guest", path: `/shops/${shopId}` },
  { who: "buyer", path: "/cart" },
  { who: "buyer", path: "/checkout" },
  { who: "buyer", path: "/orders" },
  { who: "buyer", path: `/orders/${orderNo}` },
  { who: "buyer", path: `/pay/${groupId}` },
  { who: "buyer", path: `/track/${trackingNo}` },
  { who: "seller", path: "/seller" },
  { who: "seller", path: "/seller/products" },
  { who: "seller", path: "/seller/stock" },
  { who: "seller", path: "/seller/orders" },
  { who: "seller", path: `/seller/orders/${orderNo}` },
  { who: "seller", path: `/parcels/${trackingNo}` },
];

const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.ceil((p / 100) * values.length) - 1];
const within = (values: number[]) => values.filter((ms) => ms <= LIMIT_MS).length;
const row = (label: string, values: number[]) =>
  `| ${label} | ${values.length} | ${Math.round(percentile(values, 50))} | ${Math.round(percentile(values, 95))} | ${Math.round(percentile(values, 100))} | ${within(values)}/${values.length} |`;

console.log(`ขั้น 1: เปิดหน้าละ ${loads} ครั้งใน Chrome ที่ ${base} (มิลลิวินาที)\n`);
console.log("| หน้า | ครั้ง | p50 | p95 | ช้าสุด | ภายใน 2 วินาที |\n|---|---|---|---|---|---|");
const browser = await chromium.launch({ channel: process.env.E2E_BROWSER === "chromium" ? undefined : "chrome" });
const contexts = {
  guest: await browser.newContext(),
  buyer: await browser.newContext(),
  seller: await browser.newContext(),
};
for (const who of ["buyer", "seller"] as const) {
  await contexts[who].addCookies([{ name: SESSION_COOKIE, value: sessions[who], url: base }]);
}
let failed = false;
for (const { who, path } of pages) {
  const page = await contexts[who].newPage();
  const times: number[] = [];
  for (let i = 0; i < loads; i++) {
    const response = await page.goto(base + path, { waitUntil: "load" });
    if (response?.status() !== 200 || new URL(page.url()).pathname !== new URL(base + path).pathname) {
      throw new Error(`${path} ได้ ${response?.status()} ที่ ${page.url()} ไม่ใช่หน้าที่ขอ`);
    }
    times.push(await page.evaluate(() => (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).loadEventEnd));
  }
  await page.close();
  console.log(row(decodeURIComponent(path), times));
  if (within(times) < loads * 0.95) failed = true;
}
await browser.close();

console.log(`\nขั้น 2: ผู้ใช้จำลอง ${USERS} คนพร้อมกัน นาน ${loadSeconds} วินาที ขอหน้าข้างบนสลับกันจนได้หน้าครบ (มิลลิวินาที)\n`);
const headers = { guest: {}, buyer: { cookie: `${SESSION_COOKIE}=${sessions.buyer}` }, seller: { cookie: `${SESSION_COOKIE}=${sessions.seller}` } };
const stopAt = Date.now() + loadSeconds * 1000;
const times: number[] = [];
let errors = 0;
await Promise.all(
  Array.from({ length: USERS }, async (_, user) => {
    for (let i = user; Date.now() < stopAt; i++) {
      const { who, path } = pages[i % pages.length];
      const start = performance.now();
      try {
        const response = await fetch(base + path, { headers: headers[who], redirect: "manual" });
        await response.text();
        if (response.status !== 200) errors += 1;
      } catch {
        errors += 1;
      }
      times.push(performance.now() - start);
    }
  }),
);
console.log("| ช่วง | คำขอ | p50 | p95 | ช้าสุด | ภายใน 2 วินาที |\n|---|---|---|---|---|---|");
console.log(row(`${USERS} คนพร้อมกัน`, times));
console.log(`\nคำขอที่ผิดพลาด ${errors} ครั้ง ได้หน้าเฉลี่ย ${(times.length / loadSeconds).toFixed(1)} หน้าต่อวินาที`);
if (within(times) < times.length * 0.95 || errors > 0) failed = true;
console.log(failed ? "\nไม่ผ่านเกณฑ์ 95 จาก 100 ครั้งภายใน 2 วินาที" : "\nผ่านเกณฑ์ 95 จาก 100 ครั้งภายใน 2 วินาที");
process.exitCode = failed ? 1 : 0;
