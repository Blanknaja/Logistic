// test ระดับหน้าและ server action ของ shop-orders
// ส่วน vi.mock ลอกจาก src/features/account/account-pages.test.tsx

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import OrderNotFound from "@/app/seller/orders/[orderNo]/not-found";
import SellerOrderPage from "@/app/seller/orders/[orderNo]/page";
import OrdersError from "@/app/seller/orders/error";
import OrdersLoading from "@/app/seller/orders/loading";
import SellerOrdersPage from "@/app/seller/orders/page";
import { createSession } from "@/features/account/server/sessions";
import * as actions from "@/features/shop-orders/actions";
import { OrderDetailView } from "@/features/shop-orders/components/order-detail";
import { LOADING_TIMEOUT_MS } from "@/shared/ui/loading-timeout";
import { checkForUpdates, POLL_INTERVAL_MS, StaleNotice } from "@/features/shop-orders/components/live-updates";
import { getShopOrder, shopOrdersVersion } from "@/features/shop-orders/server/orders";
import type { Db } from "@/shared/db";
import { addAccount, addOrder, addParcel, addPayment, addProduct, addShop, type Address } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { SellerMenu } from "@/shared/layout/seller-menu";
import { SESSION_COOKIE } from "@/shared/session";
import { ORDER_STATUS, PARCEL_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, type OrderStatus } from "@/shared/statuses";
import { formatThaiDateTime } from "@/shared/format";

const request = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  cookies: new Map<string, string>(),
  Redirected: class Redirected extends Error {
    constructor(readonly url: string) {
      super(`redirect ${url}`);
    }
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (request.cookies.has(name) ? { name, value: request.cookies.get(name) } : undefined),
    set: (name: string, value: string) => void request.cookies.set(name, value),
    delete: (name: string) => void request.cookies.delete(name),
  }),
  headers: async () => new Headers(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: (url: string) => {
    throw new request.Redirected(url);
  },
  notFound: () => {
    throw new request.Redirected("not-found");
  },
  useRouter: () => ({ refresh: () => {} }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {}, refresh: () => {} }));

vi.mock("@/shared/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/db")>()),
  getDb: () => request.db,
}));

let db: Db;
let buyerId: number;

const SOMYING: Address = {
  name: "สมหญิง ใจดี",
  phone: "081-234-5678",
  address: "99/1 ถนนสุขุมวิท",
  subdistrict: "แขวงคลองเตย",
  district: "เขตคลองเตย",
  province: "กรุงเทพฯ",
  postcode: "10110",
};

beforeEach(() => {
  db = createTestDb();
  request.db = db;
  request.cookies.clear();
  buyerId = addAccount(db, { email: "somying@example.com", displayName: "สมหญิง" }).id;
  minute = 0;
});

async function open(page: Promise<React.ReactNode>): Promise<{ redirect?: string; html?: string }> {
  try {
    return { html: renderToStaticMarkup(await page) };
  } catch (error) {
    if (error instanceof request.Redirected) return { redirect: error.url };
    throw error;
  }
}

async function submit<T>(action: Promise<T>): Promise<{ redirect?: string; state?: T }> {
  try {
    return { state: await action };
  } catch (error) {
    if (error instanceof request.Redirected) return { redirect: error.url };
    throw error;
  }
}

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
};

function signInAs(accountId: number) {
  request.cookies.set(SESSION_COOKIE, createSession(db, accountId));
}

function newShop(name: string) {
  const owner = addAccount(db, { displayName: name });
  const shop = addShop(db, { ownerAccountId: owner.id, name });
  const product = addProduct(db, { shopId: shop.id, name: "เสื้อยืดคอกลม", price: 250 });
  return { id: shop.id, ownerId: owner.id, variantId: product.variantIds[0] };
}

type Shop = ReturnType<typeof newShop>;

let minute = 0;
function order(shop: Shop, status: OrderStatus = ORDER_STATUS.awaitingPayment, quantity = 1) {
  minute++;
  const orderedAt = new Date(Date.UTC(2026, 10, 23, 0, minute)).toISOString();
  return addOrder(db, { buyerAccountId: buyerId, items: [{ variantId: shop.variantId, quantity }], status, orderedAt, address: SOMYING });
}

/** คำสั่งซื้อเลข 2611240045 ของตัวอย่างใน requirement สั่ง 08:52 จ่ายด้วย PromptPay 08:55 */
function example045(shop: Shop, status: OrderStatus = ORDER_STATUS.paid) {
  const created = order(shop, status, 2);
  db.prepare("UPDATE orders SET order_no = '2611240045', ordered_at = '2026-11-24T01:52:00.000Z' WHERE id = ?").run(created.id);
  db.prepare("UPDATE order_items SET variant_label = 'สีดำ ขนาด L' WHERE order_id = ?").run(created.id);
  if (status !== ORDER_STATUS.awaitingPayment && status !== ORDER_STATUS.cancelled) {
    const payment = addPayment(db, { groupId: created.groupId, method: PAYMENT_METHOD.promptPay, status: PAYMENT_STATUS.succeeded });
    db.prepare("UPDATE payments SET resolved_at = '2026-11-24T01:55:00.000Z' WHERE id = ?").run(payment.id);
  }
  return { ...created, orderNo: "2611240045" };
}

const list = (query: Record<string, string> = {}) =>
  open(SellerOrdersPage({ params: Promise.resolve({}), searchParams: Promise.resolve(query) } as PageProps<"/seller/orders">));

const detail = (orderNo: string, query: Record<string, string> = {}) =>
  open(
    SellerOrderPage({
      params: Promise.resolve({ orderNo }),
      searchParams: Promise.resolve(query),
    } as PageProps<"/seller/orders/[orderNo]">),
  );

const rowsIn = (html = "") => [...html.matchAll(/href="\/seller\/orders\/(\d+)/g)].map((match) => match[1]);
const text = (html = "") => html.replace(/<!-- -->/g, "");
/** ข้อความที่ตาเห็น ไม่สนแท็ก */
const plain = (html = "") => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("ORD-001 หน้ารายการคำสั่งซื้อ", () => {
  test("ORD-001 เห็น 20 รายการของร้านตัวเอง ข้อมูลครบ และรู้ว่ามี 3 หน้า", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const wichai = newShop("วิชัยรองเท้า");
    const theirs = Array.from({ length: 12 }, () => order(wichai).orderNo);
    for (let i = 0; i < 44; i++) order(somchai);
    example045(somchai);
    signInAs(somchai.ownerId);

    const { html } = await list();

    expect(rowsIn(html)).toHaveLength(20);
    expect(rowsIn(html)[0]).toBe("2611240045");
    expect(plain(html)).toContain(`สั่งซื้อเมื่อ ${formatThaiDateTime("2026-11-24T08:52+07:00")}`);
    expect(plain(html)).toContain("ผู้รับ สมหญิง ใจดี");
    expect(plain(html)).toContain("2 ชิ้น · ยอดรวม ฿540");
    expect(text(html)).toContain("หน้า 1 จาก 3");
    expect(theirs.some((no) => html?.includes(no))).toBe(false);
  });

  test("ORD-001 ร้านที่ยังไม่มีคำสั่งซื้อเห็นข้อความแทนตารางเปล่า และทุกตัวกรองเป็น 0", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    signInAs(somchai.ownerId);

    const html = text((await list()).html);

    expect(html).toContain("ร้านยังไม่มีคำสั่งซื้อ");
    expect(html.match(/\(0\)/g)).toHaveLength(6);
    expect(html).not.toContain('role="alert"');
  });

  test("ORD-001 ลิงก์หน้าถัดไปจำรายการตอนเปิดไว้ หน้า 2 จึงไม่ซ้ำหน้า 1 เมื่อมีคำสั่งซื้อใหม่", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    for (let i = 0; i < 45; i++) order(somchai);
    signInAs(somchai.ownerId);
    const page1 = (await list()).html ?? "";
    const next = page1.match(/href="\/seller\/orders\?page=2&amp;asOf=(\d+)"/);

    order(somchai);
    const page2 = (await list({ page: "2", asOf: next?.[1] ?? "" })).html;

    expect(next).not.toBeNull();
    expect(rowsIn(page2).filter((no) => rowsIn(page1).includes(no))).toEqual([]);
    expect(rowsIn(page2)).toHaveLength(20);
  });
});

describe("ORD-001 ORD-009 กลุ่มรอจัดของ", () => {
  test("ORD-001 ORD-009 ตัวกรองทั้งหมดแสดงคำสั่งซื้อที่รอจัดของเป็นกลุ่มแรกพร้อมปุ่มจัดส่ง และไม่ซ้ำในกลุ่มอื่น", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const waiting = order(somchai, ORDER_STATUS.paid);
    for (let i = 0; i < 3; i++) order(somchai);
    const shipping = order(somchai, ORDER_STATUS.shipping);
    addParcel(db, { orderId: shipping.id, trackingNo: "BS0000001240", status: PARCEL_STATUS.handedOver });
    signInAs(somchai.ownerId);

    const html = (await list()).html ?? "";
    const [work, rest] = html.split("คำสั่งซื้ออื่น");

    expect(plain(work)).toContain("รอจัดของ 1 รายการ");
    expect(rowsIn(work)).toEqual([waiting.orderNo]);
    expect(work).toContain("จัดส่ง</button>");
    expect(rowsIn(rest)).toHaveLength(4);
    expect(rowsIn(rest)).not.toContain(waiting.orderNo);
    expect(rest).not.toContain("จัดส่ง</button>");
    expect(rest).toMatch(/class="link-action" href="\/track\/BS0000001240">ดูการจัดส่ง</);
  });

  test("ORD-002 ORD-003 ตัวกรองสถานะอื่นและการค้นหาไม่มีกลุ่มรอจัดของ", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const waiting = order(somchai, ORDER_STATUS.paid);
    order(somchai);
    signInAs(somchai.ownerId);

    for (const query of [{ status: "paid" }, { status: "awaitingPayment" }, { q: waiting.orderNo }] as Record<string, string>[]) {
      const html = (await list(query)).html ?? "";
      expect(html).not.toContain("รอจัดของ");
      expect(html).not.toContain("คำสั่งซื้ออื่น");
    }
    expect(rowsIn((await list({ status: "paid" })).html)).toEqual([waiting.orderNo]);
  });
});

describe("ORD-002 ตัวกรองสถานะ", () => {
  test("ORD-002 กดจ่ายแล้วเห็น 5 รายการ ตัวกรองบอกจำนวนทุกสถานะ และจำตัวกรองไว้ในที่อยู่หน้าเว็บ", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const plan: [OrderStatus, number][] = [
      [ORDER_STATUS.awaitingPayment, 3],
      [ORDER_STATUS.paid, 5],
      [ORDER_STATUS.shipping, 7],
      [ORDER_STATUS.completed, 26],
      [ORDER_STATUS.cancelled, 4],
    ];
    for (const [status, n] of plan) for (let i = 0; i < n; i++) order(somchai, status);
    signInAs(somchai.ownerId);

    const html = text((await list({ status: "paid" })).html);

    expect(rowsIn(html)).toHaveLength(5);
    expect(html.match(/(ทั้งหมด|รอจ่ายเงิน|จ่ายแล้ว|กำลังจัดส่ง|สำเร็จ|ยกเลิก) \(\d+\)/g)).toEqual([
      "ทั้งหมด (45)",
      "รอจ่ายเงิน (3)",
      "จ่ายแล้ว (5)",
      "กำลังจัดส่ง (7)",
      "สำเร็จ (26)",
      "ยกเลิก (4)",
    ]);
    expect(html).toContain('aria-current="page" href="/seller/orders?status=paid"');
  });

  test("ORD-002 สถานะที่ไม่มีคำสั่งซื้อขึ้นข้อความ และตัวกรองอื่นยังกดได้", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    for (let i = 0; i < 10; i++) order(somchai, ORDER_STATUS.paid);
    signInAs(somchai.ownerId);

    const html = text((await list({ status: "cancelled" })).html);

    expect(html).toContain("ไม่มีคำสั่งซื้อในสถานะ ยกเลิก");
    expect(html).toContain("ยกเลิก (0)");
    expect(html).toContain('href="/seller/orders?status=paid"');
    expect(html).toContain('href="/seller/orders"');
  });
});

describe("ORD-003 ค้นหาด้วยเลขคำสั่งซื้อ", () => {
  test("ORD-003 ค้นด้วยเลขบางส่วนที่มีช่องว่าง เจอแม้อยู่สถานะอื่น และล้างคำค้นกลับตัวกรองเดิม", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    example045(somchai);
    for (let i = 0; i < 3; i++) order(somchai, ORDER_STATUS.completed);
    signInAs(somchai.ownerId);

    const html = text((await list({ status: "completed", q: " 0045 " })).html);

    expect(rowsIn(html)).toEqual(["2611240045"]);
    expect(html).toMatch(/href="\/seller\/orders\?status=completed"[^>]*>ล้างคำค้น/);
  });

  test("ORD-003 ค้นเลขของร้านอื่นเห็นข้อความเดียวกับเลขที่ไม่มีอยู่จริงทุกตัวอักษร", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const wichai = newShop("วิชัยรองเท้า");
    order(somchai);
    const theirs = order(wichai, ORDER_STATUS.paid);
    db.prepare("UPDATE orders SET order_no = '2611240099' WHERE id = ?").run(theirs.id);
    signInAs(somchai.ownerId);

    const whileTheirs = text((await list({ q: "2611240099" })).html);
    db.prepare("UPDATE orders SET order_no = '2611249999' WHERE id = ?").run(theirs.id);
    const whileMissing = text((await list({ q: "2611240099" })).html);

    expect(whileTheirs).toContain("ไม่พบคำสั่งซื้อเลข 2611240099 ในร้านของคุณ");
    expect(whileTheirs).toBe(whileMissing);
  });

  test("ORD-003 คำค้นสั้นกว่า 3 ตัวอักษรขึ้นข้อความ และรายการเป็นแบบเดิม", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    for (let i = 0; i < 3; i++) order(somchai);
    signInAs(somchai.ownerId);

    const before = (await list()).html;
    const after = text((await list({ q: "45" })).html);

    expect(after).toContain("พิมพ์อย่างน้อย 3 ตัวอักษร");
    expect(rowsIn(after)).toEqual(rowsIn(before));
  });
});

describe("ORD-004 ตัวเลขรอจัดของในเมนูหลังบ้าน", () => {
  test("ORD-004 เมนูหลังบ้านแสดงรอจัดของ 5 ที่กดแล้วไปรายการที่กรองจ่ายแล้ว", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    for (let i = 0; i < 5; i++) order(somchai, ORDER_STATUS.paid);
    order(somchai, ORDER_STATUS.shipping);
    signInAs(somchai.ownerId);

    const menu = renderToStaticMarkup(<SellerMenu shopId={somchai.id} />);
    const href = menu.match(/href="([^"]+)"[^>]*>รอจัดของ 5</)?.[1];

    expect(href).toBe("/seller/orders?status=paid");
    expect(rowsIn((await list({ status: "paid" })).html)).toHaveLength(5);
  });

  test("ORD-004 ไม่มีคำสั่งซื้อรอจัดของเห็น 0 และถ้านับไม่ได้เห็น – โดยเมนูส่วนอื่นยังอยู่", () => {
    const somchai = newShop("สมชายเสื้อผ้า");

    expect(renderToStaticMarkup(<SellerMenu shopId={somchai.id} />)).toContain("รอจัดของ 0");

    request.db = undefined;
    const broken = renderToStaticMarkup(<SellerMenu shopId={somchai.id} />);
    expect(broken).toContain("รอจัดของ –");
    expect(broken).toContain('href="/seller/orders"');
  });
});

describe("ORD-005 ถึง ORD-008 หน้ารายละเอียด", () => {
  test("ORD-005 ORD-006 ORD-007 เห็นสินค้า ยอดเงิน ผู้รับ และผลการจ่ายเงิน โดยไม่เห็นอีเมลของผู้ซื้อ", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    example045(somchai);
    signInAs(somchai.ownerId);

    const html = text((await detail("2611240045")).html);

    expect(plain(html)).toContain("เสื้อยืดคอกลม สีดำ ขนาด L ฿250 × 2 ฿500");
    expect(html).toMatch(/ยอดรวมสินค้า<\/dt><dd>฿500.*ค่าส่ง<\/dt><dd>฿40.*ยอดรวมทั้งหมด<\/dt><dd[^>]*>฿540/);
    expect(plain(html)).toContain(`สั่งซื้อเมื่อ ${formatThaiDateTime("2026-11-24T08:52+07:00")}`);
    expect(html).toContain("สมหญิง ใจดี<br/>081-234-5678<br/>99/1 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110");
    expect(html).toContain(`จ่ายแล้ว PromptPay ${formatThaiDateTime("2026-11-24T08:55+07:00")}`);
    expect(html).not.toContain("somying@example.com");
  });

  test("ORD-005 ORD-006 แก้สินค้าและที่อยู่ในบัญชีทีหลัง หน้ายังแสดงตามตอนสั่ง", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    example045(somchai);
    db.prepare("UPDATE variants SET price = 300, removed_at = ?").run(new Date().toISOString());
    addProduct(db, { shopId: somchai.id, name: "เสื้อยืดคอกลม", price: 300 });
    signInAs(somchai.ownerId);

    const html = text((await detail("2611240045")).html);

    expect(plain(html)).toContain("เสื้อยืดคอกลม สีดำ ขนาด L ฿250 × 2 ฿500");
    expect(html).toContain("กรุงเทพฯ 10110");
  });

  test("ORD-007 ORD-008 คำสั่งซื้อที่ผลการจ่ายเงินยังไม่มาเห็นยังไม่จ่าย ยังไม่มีพัสดุ และไม่มีปุ่มไปหน้าจัดส่ง", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const pending = order(somchai);
    addPayment(db, { groupId: pending.groupId, status: PAYMENT_STATUS.pending });
    signInAs(somchai.ownerId);

    const html = text((await detail(pending.orderNo)).html);

    expect(html).toContain("ยังไม่จ่าย");
    expect(html).toContain("รอจ่ายเงิน");
    expect(html).toContain("ยังไม่มีพัสดุ จะมีเมื่อผู้ซื้อจ่ายเงินแล้ว");
    expect(html).not.toContain("จัดส่ง</button>");
    expect(html).not.toContain("ดูการจัดส่ง");
  });

  test("ORD-008 เห็นเลขติดตามพัสดุ สถานะการจัดส่งล่าสุด และเวลาที่เปลี่ยน", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const shipping = order(somchai, ORDER_STATUS.shipping);
    const parcel = addParcel(db, { orderId: shipping.id, trackingNo: "BS0000001234", status: PARCEL_STATUS.inTransit });
    db.prepare("UPDATE parcel_history SET created_at = '2026-11-24T00:30:00.000Z' WHERE parcel_id = ?").run(parcel.id);
    signInAs(somchai.ownerId);

    const html = text((await detail(shipping.orderNo)).html);

    expect(html).toContain("BS0000001234");
    expect(html).toContain("อยู่ระหว่างขนส่ง");
    expect(html).toContain(formatThaiDateTime("2026-11-24T07:30+07:00"));
    expect(html).toContain("กำลังจัดส่ง");
  });

  test("ORD-008 อ่านข้อมูลพัสดุไม่ได้ ส่วนอื่นยังครบ และส่วนการจัดส่งมีปุ่มลองใหม่", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    example045(somchai, ORDER_STATUS.shipping);
    const order045 = getShopOrder(db, somchai.id, "2611240045");
    if (!order045) throw new Error("ต้องมีคำสั่งซื้อ");

    const html = text(renderToStaticMarkup(<OrderDetailView order={order045} parcel="unavailable" backHref="/seller/orders" version="" />));

    expect(html).toContain("โหลดข้อมูลการจัดส่งไม่ได้");
    expect(html).toContain("ลองใหม่");
    expect(html).toContain("฿540");
    expect(html).toContain("99/1 ถนนสุขุมวิท");
    expect(html).toContain("จ่ายแล้ว PromptPay");
    expect(html).not.toContain(PARCEL_STATUS.awaitingPacking);
    expect(html).not.toContain("ดูการจัดส่ง");
  });
});

describe("ORD-009 ปุ่มจัดส่ง", () => {
  test("ORD-009 คำสั่งซื้อจ่ายแล้วมีปุ่มจัดส่งทั้งในรายการและรายละเอียด กดแล้วไปหน้าติดตามพัสดุโดยสถานะไม่เปลี่ยน", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const paid = example045(somchai);
    addParcel(db, { orderId: paid.id, trackingNo: "BS0000001250" });
    signInAs(somchai.ownerId);

    expect((await list()).html).toContain("จัดส่ง</button>");
    expect((await detail("2611240045")).html).toContain("จัดส่ง</button>");
    const result = await submit(actions.openShippingAction(null, form({ orderNo: "2611240045" })));

    expect(result.redirect).toBe("/track/BS0000001250");
    expect(getShopOrder(db, somchai.id, "2611240045")?.status).toBe(ORDER_STATUS.paid);
    expect(text((await detail("2611240045")).html)).toContain(PARCEL_STATUS.awaitingPacking);
  });

  test("ORD-009 กดจัดส่งหลังคำสั่งซื้อถูกยกเลิก ไม่ไปหน้าจัดส่ง เห็นข้อความ และหน้าแสดงยกเลิกโดยไม่มีปุ่ม", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const paid = example045(somchai);
    addParcel(db, { orderId: paid.id });
    signInAs(somchai.ownerId);
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(ORDER_STATUS.cancelled, paid.id);

    const result = await submit(actions.openShippingAction(null, form({ orderNo: "2611240045" })));
    const html = text((await detail("2611240045")).html);

    expect(result).toEqual({ state: { error: "คำสั่งซื้อนี้ถูกยกเลิกแล้ว จัดส่งไม่ได้" } });
    expect(html).toContain("<h1>ยกเลิก</h1>");
    expect(html).not.toContain("จัดส่ง</button>");
  });

  test("ORD-009 กำลังจัดส่งมีลิงก์ดูการจัดส่งแทนปุ่ม ส่วนรอจ่ายเงินไม่มีทั้งสองอย่าง", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const shipping = order(somchai, ORDER_STATUS.shipping);
    addParcel(db, { orderId: shipping.id, trackingNo: "BS0000001240", status: PARCEL_STATUS.handedOver });
    const pending = order(somchai);
    signInAs(somchai.ownerId);

    const shippingHtml = (await detail(shipping.orderNo)).html;
    const pendingHtml = (await detail(pending.orderNo)).html;

    expect(shippingHtml).toMatch(/href="\/track\/BS0000001240"[^>]*>ดูการจัดส่ง/);
    expect(shippingHtml).not.toContain("จัดส่ง</button>");
    expect(pendingHtml).not.toContain("จัดส่ง</button>");
    expect(pendingHtml).not.toContain("ดูการจัดส่ง");
  });
});

describe("ORD-010 ORD-011 หน้าที่เปิดค้าง", () => {
  test("ORD-010 คำสั่งซื้อใหม่ขึ้นเป็นแถบให้กด ตัวเลขอัปเดต และรายการที่กำลังดูไม่ขยับ", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    for (let i = 0; i < 40; i++) order(somchai);
    for (let i = 0; i < 5; i++) order(somchai, ORDER_STATUS.paid);
    signInAs(somchai.ownerId);
    const opened = (await list()).html ?? "";
    const asOf = opened.match(/asOf=(\d+)/)?.[1] ?? "";
    const version = shopOrdersVersion(db, somchai.id);

    const fresh = order(somchai, ORDER_STATUS.paid);
    const polled = await submit(actions.shopOrdersVersionAction());
    const refreshed = text((await list({ asOf })).html);

    expect(polled.state).not.toBe(version);
    expect(refreshed).toContain("มีคำสั่งซื้อใหม่ 1 รายการ กดเพื่อแสดง");
    expect(refreshed).toContain("ทั้งหมด (46)");
    expect(renderToStaticMarkup(<SellerMenu shopId={somchai.id} />)).toContain("รอจัดของ 6");
    expect(rowsIn(refreshed)).toEqual(rowsIn(opened));
    expect(refreshed).toMatch(/href="\/seller\/orders"[^>]*>มีคำสั่งซื้อใหม่/);
    expect(rowsIn((await list()).html)[0]).toBe(fresh.orderNo);
  });

  test("ORD-010 เน็ตหลุดเห็นว่าข้อมูลเป็นของเวลาไหน และกลับมาแล้วนับคำสั่งซื้อใหม่ครั้งเดียว", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    order(somchai);
    signInAs(somchai.ownerId);
    const asOf = (await list()).html?.match(/asOf=(\d+)/)?.[1] ?? "";
    const version = shopOrdersVersion(db, somchai.id);
    order(somchai);
    order(somchai);

    const offline = await checkForUpdates(() => Promise.reject(new TypeError("Failed to fetch")), version);
    const back = await checkForUpdates(async () => shopOrdersVersion(db, somchai.id), version);
    const bars = [1, 2].map(async () => text((await list({ asOf })).html).match(/มีคำสั่งซื้อใหม่ \d+ รายการ/g));

    expect(offline).toBe("failed");
    expect(text(renderToStaticMarkup(<StaleNotice since={Date.UTC(2026, 10, 24, 2, 18)} />))).toContain(
      "อัปเดตข้อมูลไม่ได้ ข้อมูลที่เห็นเป็นของเวลา 09:18",
    );
    expect(back).toBe("changed");
    expect(await Promise.all(bars)).toEqual([["มีคำสั่งซื้อใหม่ 2 รายการ"], ["มีคำสั่งซื้อใหม่ 2 รายการ"]]);
  });

  test("ORD-011 ผลการจ่ายเงินมาถึงขณะเปิดดู หน้าเปลี่ยนเป็นจ่ายแล้ว มีพัสดุ และมีปุ่มจัดส่ง", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const pending = order(somchai);
    signInAs(somchai.ownerId);
    const version = shopOrdersVersion(db, somchai.id);

    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(ORDER_STATUS.paid, pending.id);
    addPayment(db, { groupId: pending.groupId, status: PAYMENT_STATUS.succeeded });
    addParcel(db, { orderId: pending.id });
    const html = text((await detail(pending.orderNo)).html);

    expect(await checkForUpdates(async () => shopOrdersVersion(db, somchai.id), version)).toBe("changed");
    expect(html).toContain("<h1>จ่ายแล้ว</h1>");
    expect(html).toContain("จ่ายแล้ว บัตร");
    expect(html).toContain(PARCEL_STATUS.awaitingPacking);
    expect(html).toContain("จัดส่ง</button>");
  });

  test("ORD-011 ถูกยกเลิกเพราะหมดเวลาขณะเปิดดู เห็นข้อความ ข้อมูลยังครบ ไม่มีปุ่มจัดส่ง และตัวกรองนับใหม่", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const pending = order(somchai);
    order(somchai);
    signInAs(somchai.ownerId);

    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(ORDER_STATUS.cancelled, pending.id);
    const html = text((await detail(pending.orderNo)).html);
    const counts = text((await list()).html);

    expect(html).toContain("คำสั่งซื้อนี้ถูกยกเลิกแล้ว");
    expect(html).toContain("<h1>ยกเลิก</h1>");
    expect(html).toContain("฿290");
    expect(html).toContain("99/1 ถนนสุขุมวิท");
    expect(html).not.toContain("จัดส่ง</button>");
    expect(counts).toContain("รอจ่ายเงิน (1)");
    expect(counts).toContain("ยกเลิก (1)");
  });
});

describe("ORD-012 กันการเปิดคำสั่งซื้อของร้านอื่น", () => {
  test("ORD-012 เปิดลิงก์คำสั่งซื้อของร้านตัวเองได้ตามปกติ", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    example045(somchai);
    signInAs(somchai.ownerId);

    const html = (await detail("2611240045")).html;
    expect(html).toContain("<h1>จ่ายแล้ว</h1>");
    expect(plain(html)).toContain("คำสั่งซื้อ 2611240045");
  });

  test("ORD-012 คำสั่งซื้อของร้านอื่นกับเลขที่ไม่มีอยู่จริงได้หน้าไม่พบเดียวกัน ไม่เห็นข้อมูลใด", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const wichai = newShop("วิชัยรองเท้า");
    example045(somchai);
    signInAs(wichai.ownerId);

    const theirs = await detail("2611240045");
    const missing = await detail("9999999999");
    const page = text(renderToStaticMarkup(<OrderNotFound />));

    expect(theirs).toEqual({ redirect: "not-found" });
    expect(missing).toEqual(theirs);
    expect(page).toContain("ไม่พบคำสั่งซื้อ");
    expect(page).toContain('href="/seller/orders"');
    expect(page).not.toMatch(/2611240045|540|สมหญิง/);
  });
});

describe("ORD-013 คนที่ไม่ใช่ผู้ขาย", () => {
  test("ORD-013 ยังไม่เข้าสู่ระบบถูกพาไปเข้าสู่ระบบ แล้วกลับมาหน้ารายละเอียดเดิม", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    example045(somchai);

    const before = await detail("2611240045");
    signInAs(somchai.ownerId);
    const after = await detail("2611240045");

    expect(before).toEqual({ redirect: "/login?next=%2Fseller%2Forders%2F2611240045" });
    expect(after.html).toContain("2611240045");
  });

  test("ORD-013 บัญชีที่ยังไม่มีร้านถูกพาไปหน้าเปิดร้าน ไม่เห็นรายการ จำนวน หรือตัวกรอง", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    example045(somchai);
    signInAs(buyerId);

    expect(await list()).toEqual({ redirect: "/open-shop" });
    expect(await detail("2611240045")).toEqual({ redirect: "/open-shop" });
    expect(await submit(actions.shopOrdersVersionAction())).toEqual({ redirect: "/open-shop" });
    expect(await submit(actions.openShippingAction(null, form({ orderNo: "2611240045" })))).toEqual({ redirect: "/open-shop" });
  });
});

describe("ORD-014 กำลังโหลดและโหลดไม่สำเร็จ", () => {
  test("ORD-014 ระหว่างรอเห็นเครื่องหมายกำลังโหลด ไม่เห็นข้อความว่าไม่มีคำสั่งซื้อ และถือว่าไม่สำเร็จเมื่อเกิน 10 วินาที", () => {
    const html = renderToStaticMarkup(<OrdersLoading />);

    expect(html).toContain('role="status"');
    expect(html).toContain("กำลังโหลดคำสั่งซื้อ");
    expect(html).not.toContain("ร้านยังไม่มีคำสั่งซื้อ");
    expect(LOADING_TIMEOUT_MS).toBe(10_000);
  });

  test("ORD-014 โหลดไม่สำเร็จเห็นข้อความและปุ่มลองใหม่ ไม่ใช่หน้าว่าง", () => {
    const html = renderToStaticMarkup(<OrdersError error={new Error("ระบบตอบไม่ได้")} retry={() => {}} />);

    expect(html).toContain("โหลดคำสั่งซื้อไม่ได้ตอนนี้");
    expect(html).toContain("ลองใหม่");
    expect(html).not.toContain("ร้านยังไม่มีคำสั่งซื้อ");
  });
});

describe("ORD-015 ผู้ขายเปลี่ยนสถานะคำสั่งซื้อเองไม่ได้", () => {
  test("ORD-015 หน้ารายละเอียดกดได้แค่ปุ่มจัดส่งกับปุ่มกลับไปหน้ารายการ ไม่มีช่องแก้ข้อมูล", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const paid = example045(somchai);
    addParcel(db, { orderId: paid.id });
    signInAs(somchai.ownerId);

    const html = (await detail("2611240045")).html ?? "";
    const controls = [...html.matchAll(/<(a|button)\b[^>]*>(.*?)<\/\1>/g)].map((match) => match[2]);

    expect(controls).toEqual(["กลับไปหน้ารายการ", "จัดส่ง"]);
    expect(html.match(/<input\b[^>]*>/g)).toEqual(['<input type="hidden" name="orderNo" value="2611240045"/>']);
  });

  test("ORD-015 ส่งคำขอเปลี่ยนสถานะตรงเข้าระบบถูกปฏิเสธ คำสั่งซื้อยังรอจ่ายเงิน ไม่มีการจ่ายเงินและพัสดุ", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const pending = order(somchai);
    signInAs(somchai.ownerId);
    const attempt = form({ orderNo: pending.orderNo, status: ORDER_STATUS.paid });

    expect(Object.keys(actions).sort()).toEqual(["openShippingAction", "shopOrdersVersionAction"]);
    await submit(actions.openShippingAction(null, attempt));
    await submit(actions.shopOrdersVersionAction());

    expect(getShopOrder(db, somchai.id, pending.orderNo)).toMatchObject({ status: ORDER_STATUS.awaitingPayment, payment: null });
    expect(db.prepare("SELECT COUNT(*) AS n FROM parcels").get()).toEqual({ n: 0 });
  });
});

describe("คุณภาพของหน้า", () => {
  test("ORD-Q02 คำสั่งซื้อใหม่ 10 ครั้งและเปลี่ยนสถานะ 10 ครั้ง หน้าที่เปิดค้างรู้ทุกครั้งในรอบถามถัดไป", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    let version = shopOrdersVersion(db, somchai.id);
    const results: string[] = [];
    for (let i = 0; i < 10; i++) {
      const created = order(somchai);
      results.push(await checkForUpdates(async () => shopOrdersVersion(db, somchai.id), version));
      version = shopOrdersVersion(db, somchai.id);
      db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(ORDER_STATUS.cancelled, created.id);
      results.push(await checkForUpdates(async () => shopOrdersVersion(db, somchai.id), version));
      version = shopOrdersVersion(db, somchai.id);
    }

    expect(results).toEqual(Array(20).fill("changed"));
    expect(POLL_INTERVAL_MS * 2).toBeLessThan(30_000);
  });

  test("ORD-Q02 ไม่มีอะไรเปลี่ยน หน้าไม่โหลดใหม่เอง", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    order(somchai);
    const version = shopOrdersVersion(db, somchai.id);

    expect(await checkForUpdates(async () => shopOrdersVersion(db, somchai.id), version)).toBe("same");
  });

  test("ORD-Q04 ทุกลิงก์และปุ่มในหน้ารายการและรายละเอียดใช้สไตล์ที่สูงอย่างน้อย 44 จุด และไม่มีตาราง", async () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    for (let i = 0; i < 25; i++) order(somchai, i % 2 ? ORDER_STATUS.paid : ORDER_STATUS.shipping);
    const paid = example045(somchai);
    addParcel(db, { orderId: paid.id });
    signInAs(somchai.ownerId);
    const css = readFileSync(join(process.cwd(), "src/features/shop-orders/components/shop-orders.module.css"), "utf8");
    const tall = (name: string) => css.match(new RegExp(`\\.${name} \\{[^}]*min-height: var\\(--tap\\)`));
    // ลิงก์ของแถวยืดพื้นที่กดเต็มแถว จึงสูงเท่าแถว
    const rowLinkFillsRow = tall("row") && css.match(/\.rowLink::after \{[^}]*inset: 0/);
    const tallClasses = ["button", "chip", "link-action", ...(rowLinkFillsRow ? ["rowLink"] : []), ...(tall("newOrders") ? ["newOrders"] : [])];

    for (const html of [(await list()).html ?? "", (await detail("2611240045")).html ?? ""]) {
      const controls = [...html.matchAll(/<(a|button)\b[^>]*class="([^"]*)"/g)].map((match) => match[2]);
      expect(html).not.toContain("<table");
      expect(controls.length).toBeGreaterThan(0);
      expect(controls.filter((names) => !tallClasses.some((name) => names.split(" ").some((c) => c === name || c.startsWith(`_${name}_`))))).toEqual([]);
    }
  });

  test("ORD-Q04 สไตล์ของหน้าไม่มีความกว้างตายตัวที่เกินจอ 360 จุด", () => {
    const css = readFileSync(join(process.cwd(), "src/features/shop-orders/components/shop-orders.module.css"), "utf8");
    const widths = [...css.matchAll(/(?:^|[\s;{])(?:min-)?width:\s*(\d+)px/g)].map((match) => Number(match[1]));

    expect(widths.filter((width) => width > 328)).toEqual([]);
  });
});
