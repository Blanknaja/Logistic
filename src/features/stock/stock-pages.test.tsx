// test ระดับหน้าและ server action ของหน้าสต็อก ส่วน vi.mock ลอกมาจาก src/features/account/account-pages.test.tsx

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import StockHistoryError from "@/app/seller/stock/[variantId]/error";
import StockHistoryLoading from "@/app/seller/stock/[variantId]/loading";
import StockHistoryPage from "@/app/seller/stock/[variantId]/page";
import StockError from "@/app/seller/stock/error";
import StockLoading from "@/app/seller/stock/loading";
import StockNotFound from "@/app/seller/stock/not-found";
import StockPage from "@/app/seller/stock/page";
import { createSession } from "@/features/account/server/sessions";
import { saveStockAction } from "@/features/stock/actions";
import { SaveFeedback, StockRowItem } from "@/features/stock/components/stock-row";
import { INVALID_STOCK_MESSAGE } from "@/features/stock/server/labels";
import type { Db } from "@/shared/db";
import { addAccount, addOrder, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { sellerMenuLinks } from "@/shared/nav/registry";
import { SESSION_COOKIE } from "@/shared/session";
import { STOCK_CHANGE_REASON } from "@/shared/statuses";

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

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/shared/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/db")>()),
  getDb: () => request.db,
}));

let db: Db;

beforeEach(() => {
  db = createTestDb();
  request.db = db;
  request.cookies.clear();
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

const stockPage = (searchParams: Record<string, string> = {}) =>
  open(StockPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }));

const historyPage = (variantId: number, searchParams: Record<string, string> = {}) =>
  open(
    StockHistoryPage({ params: Promise.resolve({ variantId: String(variantId) }), searchParams: Promise.resolve(searchParams) }),
  );

const saveForm = (variantId: number, expected: number, stock: string) => {
  const data = new FormData();
  data.set("variantId", String(variantId));
  data.set("expected", String(expected));
  data.set("stock", stock);
  return data;
};

const stockOf = (variantId: number) =>
  (db.prepare("SELECT stock FROM variants WHERE id = ?").get(variantId) as { stock: number }).stock;
const rowCount = (html = "") => html.match(/<li class="_row_/g)?.length ?? 0;
const html = (node: React.ReactNode) => renderToStaticMarkup(node);

/** สมชายเข้าสู่ระบบเป็นเจ้าของร้าน "สมชายสปอร์ต" */
function signInAsSomchai() {
  const somchai = addAccount(db, { displayName: "สมชาย" });
  const shop = addShop(db, { ownerAccountId: somchai.id, name: "สมชายสปอร์ต" });
  request.cookies.set(SESSION_COOKIE, createSession(db, somchai.id));
  return shop;
}

function signInAsNewSeller(name: string) {
  const account = addAccount(db);
  const shop = addShop(db, { ownerAccountId: account.id, name });
  request.cookies.set(SESSION_COOKIE, createSession(db, account.id));
  return shop;
}

function reserve(variantId: number, quantity: number) {
  return addOrder(db, { buyerAccountId: addAccount(db, { displayName: "มานี" }).id, items: [{ variantId, quantity }] });
}

describe("INV-001 แสดงหน้าสต็อก", () => {
  test("INV-001 เห็นทุกแบบย่อยพร้อมสต็อก จำนวนที่จองอยู่ และป้าย", async () => {
    const shop = signInAsSomchai();
    const shirt = addProduct(db, {
      shopId: shop.id,
      name: "เสื้อยืดคอกลม",
      options: [
        { name: "สี", values: ["แดง"] },
        { name: "ขนาด", values: ["M", "L"] },
      ],
      variants: [{ stock: 12 }, { stock: 3 }],
    });
    reserve(shirt.variantIds[0], 2);

    const page = (await stockPage()).html ?? "";
    expect(rowCount(page)).toBe(2);
    const [first, second] = page.split('<li class="_row_').slice(1);
    for (const text of ["เสื้อยืดคอกลม", "แดง M", "สต็อก 12", "จองอยู่ 2"]) expect(first).toContain(text);
    expect(first).not.toContain("ใกล้หมด");
    for (const text of ["แดง L", "สต็อก 3", "จองอยู่ 0", "ใกล้หมด"]) expect(second).toContain(text);
    expect(page).toContain(`href="/seller/stock/${shirt.variantIds[1]}"`);
  });

  test("INV-001 โหลดไม่สำเร็จ เห็นโหลดสต็อกไม่สำเร็จกับปุ่มลองใหม่ ไม่มีตัวเลขสต็อก", async () => {
    signInAsSomchai();
    db.close();
    await expect(stockPage()).rejects.toThrow();

    const page = html(<StockError error={new Error("ล่ม")} retry={() => {}} />);
    expect(page).toContain("โหลดสต็อกไม่สำเร็จ");
    expect(page).toContain("ลองใหม่");
    expect(page).not.toMatch(/สต็อก \d|<input/);
  });

  test("INV-001 ร้านที่ยังไม่มีสินค้า เห็นข้อความและลิงก์ไปหน้าลงสินค้า", async () => {
    signInAsNewSeller("สมหญิงเบเกอรี่");
    const page = (await stockPage()).html;
    expect(page).toContain("ยังไม่มีสินค้า ลงสินค้าก่อนจึงจะจัดการสต็อกได้");
    expect(page).toContain('href="/seller/products/new"');
  });

  test("INV-001 ระหว่างรอข้อมูล เห็นกำลังโหลดสต็อก และไม่มีช่องให้แก้ตัวเลข", () => {
    const page = html(<StockLoading />);
    expect(page).toContain("กำลังโหลดสต็อก");
    expect(page).not.toContain("<input");
  });
});

describe("INV-002 ป้ายใกล้หมดและหมด", () => {
  test("INV-002 สต็อก 5 เห็นป้ายใกล้หมด สต็อก 6 ไม่มีป้าย", async () => {
    const shop = signInAsSomchai();
    addProduct(db, { shopId: shop.id, name: "รองเท้าวิ่ง 41", stock: 6 });
    addProduct(db, { shopId: shop.id, name: "รองเท้าวิ่ง 42", stock: 5 });
    const [six, five] = ((await stockPage()).html ?? "").split('<li class="_row_').slice(1);
    expect(six).not.toMatch(/ใกล้หมด|หมด</);
    expect(five).toContain("ใกล้หมด");
  });

  test("INV-002 สต็อก 0 ที่จองอยู่ 2 เห็นป้ายหมด", async () => {
    const shop = signInAsSomchai();
    const shoes = addProduct(db, { shopId: shop.id, name: "รองเท้าวิ่ง 42", stock: 0 });
    reserve(shoes.variantIds[0], 2);
    const page = (await stockPage()).html;
    expect(page).toContain("จองอยู่ 2");
    expect(page).toMatch(/>หมด</);
  });
});

describe("INV-003 กรองตามป้ายสต็อก", () => {
  function fortyRows(lowCount: number, outCount: number) {
    const shop = signInAsSomchai();
    const stocks = [...Array(lowCount).fill(3), ...Array(outCount).fill(0)];
    for (let i = 0; i < 40; i++) addProduct(db, { shopId: shop.id, name: `สินค้า ${i}`, stock: stocks[i] ?? 20 });
  }

  test("INV-003 เลือกใกล้หมด เห็น 3 แถว และตัวเลขกำกับทุกตัวกรอง", async () => {
    fortyRows(3, 1);
    const page = (await stockPage({ filter: "low" })).html;
    expect(rowCount(page)).toBe(3);
    for (const text of ["ทั้งหมด 40", "ใกล้หมด 3", "หมด 1"]) expect(page).toContain(text);
    expect(page).toMatch(/aria-current="page"[^>]*>ใกล้หมด 3/);
  });

  test("INV-003 ไม่มีแถวที่หมด เลือกหมดเห็นข้อความ และตัวกรองอื่นยังกดได้", async () => {
    fortyRows(3, 0);
    const page = (await stockPage({ filter: "out" })).html;
    expect(page).toContain("ไม่มีสินค้าที่หมด");
    expect(rowCount(page)).toBe(0);
    expect(page).toContain('href="/seller/stock"');
    expect(page).toContain('href="/seller/stock?filter=low"');
  });

  test("INV-003 หน้าละ 20 แถว และลิงก์หน้าถัดไปคงตัวกรองไว้", async () => {
    const shop = signInAsSomchai();
    for (let i = 0; i < 25; i++) addProduct(db, { shopId: shop.id, name: `สินค้า ${String(i).padStart(2, "0")}`, stock: 2 });
    const first = (await stockPage({ filter: "low" })).html;
    expect(rowCount(first)).toBe(20);
    expect(first).toContain('href="/seller/stock?filter=low&amp;page=2"');
    expect(rowCount((await stockPage({ filter: "low", page: "2" })).html)).toBe(5);
  });
});

describe("INV-004 ผู้ขายตั้งสต็อก", () => {
  test("INV-004 กดบันทึก 20 ได้สต็อกใหม่ และแถวพร้อมให้บันทึกครั้งต่อไปจากจำนวนใหม่", async () => {
    const shop = signInAsSomchai();
    const shirt = addProduct(db, { shopId: shop.id, name: "เสื้อยืดคอกลม", stock: 3 });
    const variantId = shirt.variantIds[0];

    expect((await submit(saveStockAction(saveForm(variantId, 3, "20")))).state).toEqual({
      outcome: "saved",
      stock: 20,
      reserved: 0,
    });
    expect(html(<SaveFeedback outcome="saved" />)).toContain("บันทึกแล้ว");
    const [row] = ((await stockPage()).html ?? "").split('<li class="_row_').slice(1);
    expect(row).toContain("สต็อก 20");
    expect(row).not.toContain("ใกล้หมด");
    expect((await historyPage(variantId)).html).toContain("ผู้ขายแก้ +17 เหลือ 20");
  });

  test("INV-004 บันทึกไม่สำเร็จเพราะเน็ตหลุด เห็นข้อความให้ลองใหม่", () => {
    expect(html(<SaveFeedback outcome="failed" />)).toContain("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
  });

  test("INV-004 แต่ละแถวมีช่องกรอกที่เริ่มจากสต็อกปัจจุบัน ปุ่มบันทึก และปุ่มยกเลิกที่ไม่ส่งข้อมูล", () => {
    const row = { variantId: 7, productName: "เสื้อยืดคอกลม", variantLabel: "แดง L", stock: 3, reserved: 0, label: "ใกล้หมด" as const };
    const page = html(<StockRowItem row={row} />);
    expect(page).toMatch(/<input[^>]*name="stock"[^>]*value="3"/);
    expect(page).toMatch(/<input type="hidden" name="expected" value="3"/);
    expect(page).toMatch(/<button type="submit"[^>]*>บันทึก</);
    expect(page).toMatch(/<button type="button"[^>]*>ยกเลิก</);
  });
});

describe("INV-005 ปฏิเสธจำนวนที่ไม่ถูกต้อง", () => {
  test("INV-005 บันทึก 0 ได้ เห็นป้ายหมด", async () => {
    const shop = signInAsSomchai();
    const socks = addProduct(db, { shopId: shop.id, name: "ถุงเท้ากีฬา", stock: 8 });
    expect((await submit(saveStockAction(saveForm(socks.variantIds[0], 8, "0")))).state?.outcome).toBe("saved");
    expect((await stockPage()).html).toMatch(/>หมด</);
  });

  test("INV-005 กรอกผิดทั้งสี่แบบ ได้ผลกรอกไม่ถูกต้อง สต็อกยังเป็น 8 และข้อความตาม requirement", async () => {
    const shop = signInAsSomchai();
    const socks = addProduct(db, { shopId: shop.id, name: "ถุงเท้ากีฬา", stock: 8 });
    for (const value of ["-1", "2.5", "", "1000000"]) {
      expect((await submit(saveStockAction(saveForm(socks.variantIds[0], 8, value)))).state?.outcome).toBe("invalid");
    }
    expect(stockOf(socks.variantIds[0])).toBe(8);
    expect(INVALID_STOCK_MESSAGE).toBe("กรอกจำนวนเต็มตั้งแต่ 0 ถึง 999,999");
  });
});

describe("INV-006 สต็อกเปลี่ยนระหว่างที่ผู้ขายกำลังแก้", () => {
  test("INV-006 ไม่มีใครสั่งซื้อระหว่างนั้น บันทึกได้", async () => {
    const shop = signInAsSomchai();
    const ball = addProduct(db, { shopId: shop.id, name: "ลูกฟุตบอล", stock: 10 });
    expect((await submit(saveStockAction(saveForm(ball.variantIds[0], 10, "15")))).state?.outcome).toBe("saved");
    expect(stockOf(ball.variantIds[0])).toBe(15);
  });

  test("INV-006 มีคนสั่งซื้อก่อนกดบันทึก ได้ข้อความสต็อกเปลี่ยนไปแล้ว พร้อมจำนวนล่าสุด", async () => {
    const shop = signInAsSomchai();
    const ball = addProduct(db, { shopId: shop.id, name: "ลูกฟุตบอล", stock: 8 });
    reserve(ball.variantIds[0], 2);

    expect((await submit(saveStockAction(saveForm(ball.variantIds[0], 10, "15")))).state).toEqual({
      outcome: "changed",
      stock: 8,
      reserved: 2,
    });
    expect(html(<SaveFeedback outcome="changed" />)).toContain("สต็อกเปลี่ยนไปแล้ว ตรวจจำนวนล่าสุดแล้วบันทึกใหม่");
    expect(stockOf(ball.variantIds[0])).toBe(8);
  });
});

describe("INV-007 ผู้ขายตั้งสต็อกต่ำกว่าจำนวนที่จองอยู่", () => {
  test("INV-007 ตั้ง 0 ขณะจองอยู่ 3 เห็นสต็อก 0 ป้ายหมด จองอยู่ 3", async () => {
    const shop = signInAsSomchai();
    const water = addProduct(db, { shopId: shop.id, name: "ขวดน้ำ 1 ลิตร", stock: 2 });
    reserve(water.variantIds[0], 3);

    expect((await submit(saveStockAction(saveForm(water.variantIds[0], 2, "0")))).state?.outcome).toBe("saved");
    const page = (await stockPage()).html;
    for (const text of ["สต็อก 0", "จองอยู่ 3"]) expect(page).toContain(text);
    expect(page).toMatch(/>หมด</);
  });

  test("INV-007 คำสั่งซื้อถูกยกเลิกทีหลัง ประวัติเห็นคืนจากคำสั่งซื้อ +3 เหลือ 3", async () => {
    const shop = signInAsSomchai();
    const water = addProduct(db, { shopId: shop.id, name: "ขวดน้ำ 1 ลิตร", stock: 0 });
    const variantId = water.variantIds[0];
    const order = reserve(variantId, 3);
    db.prepare("UPDATE orders SET status = 'ยกเลิก' WHERE id = ?").run(order.id);
    db.prepare("UPDATE variants SET stock = 3 WHERE id = ?").run(variantId);
    db.prepare(
      "INSERT INTO stock_history (variant_id, reason, change, stock_after, order_id, created_at) VALUES (?, ?, 3, 3, ?, ?)",
    ).run(variantId, STOCK_CHANGE_REASON.returned, order.id, "2026-11-25T10:30:00.000Z");

    expect((await stockPage()).html).toContain("จองอยู่ 0");
    const page = (await historyPage(variantId)).html;
    for (const text of ["25/11/2026 17:30", "คืนจากคำสั่งซื้อ +3 เหลือ 3", `คำสั่งซื้อ ${order.orderNo}`]) {
      expect(page).toContain(text);
    }
  });
});

describe("INV-008 กันบัญชีอื่นดูและแก้สต็อก", () => {
  test("INV-008 สมชายเห็นเฉพาะสินค้าของร้านตัวเอง และเมนูหลังบ้านมีลิงก์หน้าสต็อก", async () => {
    const shop = signInAsSomchai();
    addProduct(db, { shopId: shop.id, name: "ลูกฟุตบอล" });
    addProduct(db, { shopId: addShop(db, { name: "สมหญิงเบเกอรี่" }).id, name: "ขนมปังเนยสด" });

    const page = (await stockPage()).html;
    expect(page).toContain("ลูกฟุตบอล");
    expect(page).not.toContain("ขนมปังเนยสด");
    expect(sellerMenuLinks(shop.id)).toContainEqual(expect.objectContaining({ label: "สต็อก", href: "/seller/stock" }));
  });

  test("INV-008 สมหญิงเปิดประวัติและบันทึกสต็อกของร้านสมชายไม่ได้ เห็นไม่พบหน้านี้", async () => {
    const somchai = addShop(db, { name: "สมชายสปอร์ต" });
    const ball = addProduct(db, { shopId: somchai.id, name: "ลูกฟุตบอล", stock: 12 });
    signInAsNewSeller("สมหญิงเบเกอรี่");

    expect(await historyPage(ball.variantIds[0])).toEqual({ redirect: "not-found" });
    expect((await submit(saveStockAction(saveForm(ball.variantIds[0], 12, "0")))).state).toEqual({ outcome: "not-found" });
    expect(html(<SaveFeedback outcome="not-found" />)).toContain("ไม่พบหน้านี้");
    expect(html(<StockNotFound />)).toContain("ไม่พบหน้านี้");
    expect(stockOf(ball.variantIds[0])).toBe(12);
  });

  test("SHP-001 INV-008 บัญชีที่ยังไม่มีร้านเปิดหน้าสต็อกหรือประวัติสต็อก ถูกพาไปหน้าเปิดร้าน และบันทึกไม่ได้", async () => {
    const ball = addProduct(db, { name: "ลูกฟุตบอล", stock: 12 });
    request.cookies.set(SESSION_COOKIE, createSession(db, addAccount(db).id));

    expect(await stockPage()).toEqual({ redirect: "/open-shop" });
    expect(await historyPage(ball.variantIds[0])).toEqual({ redirect: "/open-shop" });
    expect((await submit(saveStockAction(saveForm(ball.variantIds[0], 12, "0")))).redirect).toBe("/open-shop");
    expect(stockOf(ball.variantIds[0])).toBe(12);
  });

  test("INV-008 ยังไม่เข้าสู่ระบบ ถูกพาไปหน้าเข้าสู่ระบบ และบันทึกไม่ได้", async () => {
    const ball = addProduct(db, { name: "ลูกฟุตบอล", stock: 12 });

    expect(await stockPage()).toEqual({ redirect: "/login?next=%2Fseller%2Fstock" });
    expect(await historyPage(ball.variantIds[0])).toEqual({
      redirect: `/login?next=${encodeURIComponent(`/seller/stock/${ball.variantIds[0]}`)}`,
    });
    expect((await submit(saveStockAction(saveForm(ball.variantIds[0], 12, "0")))).redirect).toBe(
      "/login?next=%2Fseller%2Fstock&notice=relogin",
    );
    expect(stockOf(ball.variantIds[0])).toBe(12);
  });
});

describe("INV-015 แสดงประวัติสต็อก", () => {
  test("INV-015 เห็นวันเวลา เหตุ จำนวน สต็อกหลังเปลี่ยน และเลขคำสั่งซื้อ ไม่มีปุ่มแก้หรือลบ", async () => {
    const shop = signInAsSomchai();
    const ball = addProduct(db, { shopId: shop.id, name: "ลูกฟุตบอล", stock: 5 });
    const variantId = ball.variantIds[0];
    await submit(saveStockAction(saveForm(variantId, 5, "10")));
    db.prepare("UPDATE stock_history SET created_at = ? WHERE variant_id = ?").run("2026-11-25T02:00:00.000Z", variantId);
    const order = reserve(variantId, 2);
    db.prepare(
      "INSERT INTO stock_history (variant_id, reason, change, stock_after, order_id, created_at) VALUES (?, ?, -2, 8, ?, ?)",
    ).run(variantId, STOCK_CHANGE_REASON.reserved, order.id, "2026-11-25T02:10:00.000Z");

    const page = (await historyPage(variantId)).html ?? "";
    expect(page.indexOf("25/11/2026 09:10")).toBeLessThan(page.indexOf("25/11/2026 09:00"));
    for (const text of ["จองจากคำสั่งซื้อ -2 เหลือ 8", "ผู้ขายแก้ +5 เหลือ 10", `คำสั่งซื้อ ${order.orderNo}`, "สต็อกปัจจุบัน"]) {
      expect(page).toContain(text);
    }
    expect(page).not.toMatch(/<button|<form/);
  });

  test("INV-015 โหลดไม่สำเร็จ เห็นข้อความ ปุ่มลองใหม่ และปุ่มกลับไปหน้าสต็อก", () => {
    const page = html(<StockHistoryError error={new Error("ล่ม")} retry={() => {}} />);
    expect(page).toContain("โหลดประวัติสต็อกไม่สำเร็จ");
    expect(page).toContain("ลองใหม่");
    expect(page).toMatch(/<a [^>]*href="\/seller\/stock"[^>]*>กลับไปหน้าสต็อก<\/a>/);
  });

  test("INV-015 ยังไม่มีการเปลี่ยนสต็อก เห็นข้อความและสต็อกปัจจุบัน 0 ชิ้น", async () => {
    const shop = signInAsNewSeller("สมหญิงเบเกอรี่");
    const bread = addProduct(db, { shopId: shop.id, name: "ขนมปังเนยสด", stock: 0 });
    const page = (await historyPage(bread.variantIds[0])).html;
    expect(page).toContain("ยังไม่มีการเปลี่ยนสต็อก");
    expect(page).toContain("สต็อกปัจจุบัน 0 ชิ้น");
  });

  test("INV-015 ระหว่างรอข้อมูล เห็นกำลังโหลดประวัติสต็อก", () => {
    expect(html(<StockHistoryLoading />)).toContain("กำลังโหลดประวัติสต็อก");
  });
});

describe("INV-Q06 ใช้บนมือถือได้", () => {
  test("INV-Q06 สไตล์ของหน้าสต็อกไม่มีความกว้างตายตัวที่เกินจอ 360 จุด", () => {
    const css = readFileSync(join(process.cwd(), "src/features/stock/components/stock.module.css"), "utf8");
    const fixed = [...css.matchAll(/(?<!max-|\(min-)width:\s*(\d+)px/g)].map((match) => Number(match[1]));
    expect(fixed.filter((px) => px > 328)).toEqual([]);
    expect(css).not.toMatch(/white-space:\s*nowrap|<table/);
  });

  test("INV-Q06 ช่องกรอกใช้สไตล์ช่องกลาง และทุกปุ่มใช้สไตล์ปุ่มที่สูง 44 จุด", async () => {
    const shop = signInAsSomchai();
    addProduct(db, { shopId: shop.id, name: "ลูกฟุตบอล", stock: 3 });
    const page = (await stockPage()).html ?? "";

    expect(page).not.toContain("<table");
    for (const input of page.match(/<input [^>]*>/g) ?? []) {
      if (!input.includes('type="hidden"')) expect(input).toMatch(/class="input /);
    }
    for (const button of page.match(/<button [^>]*>/g) ?? []) expect(button).toMatch(/class="button/);
  });
});
