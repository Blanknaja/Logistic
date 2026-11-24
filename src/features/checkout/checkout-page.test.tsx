// test ระดับหน้าและ server action ของหน้าสั่งซื้อ ส่วน vi.mock ลอกมาจาก src/features/account/account-pages.test.tsx

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import CheckoutError from "@/app/checkout/error";
import Loading from "@/app/checkout/loading";
import CheckoutPage from "@/app/checkout/page";
import { createSession } from "@/features/account/server/sessions";
import { PLACE_ORDER_FAILED, withTimeout } from "@/features/checkout/components/checkout-form";
import { placeOrderAction } from "@/features/checkout/place-order-actions";
import { getCheckout } from "@/features/checkout/server/checkout";
import type { Db } from "@/shared/db";
import { addAccount, addAddress, addCartItem, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { SESSION_COOKIE } from "@/shared/session";

const request = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  cookies: new Map<string, string>(),
  refreshed: 0,
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

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  refresh: () => void request.refreshed++,
}));

vi.mock("@/shared/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/db")>()),
  getDb: () => request.db,
}));

let db: Db;

beforeEach(() => {
  db = createTestDb();
  request.db = db;
  request.cookies.clear();
  request.refreshed = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

async function open(page: Promise<React.ReactNode>): Promise<{ redirect?: string; html?: string }> {
  try {
    return { html: renderToStaticMarkup(await page) };
  } catch (error) {
    if (error instanceof request.Redirected) return { redirect: error.url };
    throw error;
  }
}

function signInAs(accountId: number) {
  request.cookies.set(SESSION_COOKIE, createSession(db, accountId));
}

/** สมชายเลือกเสื้อยืด 2 ตัวจากร้าน "ผ้าดี" และแก้วน้ำ 1 ใบจากร้าน "บ้านแก้ว" */
function somchai({ withAddress = true } = {}) {
  const buyer = addAccount(db, { displayName: "สมชาย" });
  if (withAddress) addAddress(db, { accountId: buyer.id, isDefault: true });
  const shirt = addProduct(db, { shopId: addShop(db, { name: "ผ้าดี" }).id, name: "เสื้อยืด", price: 200, stock: 5 }).variantIds[0];
  const glass = addProduct(db, { shopId: addShop(db, { name: "บ้านแก้ว" }).id, name: "แก้วน้ำ", price: 150, stock: 3 }).variantIds[0];
  addCartItem(db, { accountId: buyer.id, variantId: shirt, quantity: 2 });
  addCartItem(db, { accountId: buyer.id, variantId: glass });
  signInAs(buyer.id);
  return { buyer, shirt, glass };
}

const enabledOrderButton = '<button type="submit" class="button">สั่งซื้อ</button>';
const disabledOrderButton = '<button type="submit" class="button" disabled="">สั่งซื้อ</button>';

function orderForm(buyerId: number) {
  const checkout = getCheckout(db, buyerId);
  const data = new FormData();
  data.set("orderKey", checkout.orderKey);
  data.set("addressId", String(checkout.addresses[0]?.id ?? ""));
  data.set(
    "lines",
    JSON.stringify(checkout.shops.flatMap((shop) => shop.lines.map((l) => ({ cartItemId: l.cartItemId, quantity: l.quantity, unitPrice: l.unitPrice })))),
  );
  return data;
}

describe("CHK-004 หน้าสั่งซื้อผ่านหน้าเว็บ", () => {
  test("CHK-004 เห็นที่อยู่หลักถูกเลือก ยอดของแต่ละร้าน ค่าส่ง และยอดรวม 630 บาท", async () => {
    somchai();
    const { html } = await open(CheckoutPage());

    expect(html).toContain("สมชาย ใจดี");
    expect(html).toMatch(/type="radio" name="addressId" checked="" value="\d+"/);
    expect(html).toContain("ที่อยู่หลัก");
    for (const text of ["ผ้าดี", "บ้านแก้ว", "ค่าส่ง", "฿40", "฿440", "฿190", "ยอดรวมที่ต้องจ่าย", "฿630"]) expect(html).toContain(text);
    expect(html).toContain(enabledOrderButton);
  });

  test("CHK-004 ยังไม่มีที่อยู่ เห็น ยังไม่มีที่อยู่จัดส่ง ปุ่มเพิ่มที่อยู่ และกดสั่งซื้อไม่ได้", async () => {
    somchai({ withAddress: false });
    const { html } = await open(CheckoutPage());

    expect(html).toContain("ยังไม่มีที่อยู่จัดส่ง");
    expect(html).toContain('<a class="button button-secondary" href="/addresses">เพิ่มที่อยู่</a>');
    expect(html).toContain(disabledOrderButton);
  });

  test("CHK-004 ไม่ได้เลือกสินค้า เห็น ยังไม่ได้เลือกสินค้า และปุ่มกลับไปตะกร้า", async () => {
    signInAs(addAccount(db).id);
    const { html } = await open(CheckoutPage());

    expect(html).toContain("ยังไม่ได้เลือกสินค้า");
    expect(html).toContain('<a class="button" href="/cart">กลับไปตะกร้า</a>');
  });

  test("CHK-004 สินค้าหมดก่อนเปิดหน้า เห็น สินค้าหมด กดสั่งซื้อไม่ได้ และมีทางกลับไปตะกร้า", async () => {
    const s = somchai();
    db.prepare("UPDATE variants SET stock = 0 WHERE id = ?").run(s.glass);
    const { html } = await open(CheckoutPage());

    expect(html).toContain("สินค้าหมด");
    expect(html).toContain(disabledOrderButton);
    expect(html).toContain('href="/cart"');
  });

  test("CHK-004 หน้ากำลังโหลดและหน้าโหลดไม่สำเร็จที่มีปุ่มลองใหม่", () => {
    expect(renderToStaticMarkup(<Loading />)).toContain("กำลังโหลดหน้าสั่งซื้อ");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToStaticMarkup(<CheckoutError error={new Error("เน็ตหลุด")} retry={() => {}} />);
    expect(html).toContain("โหลดหน้าสั่งซื้อไม่สำเร็จ");
    expect(html).toContain("ลองใหม่");
  });

  test("CHK-004 ยังไม่เข้าสู่ระบบ ถูกพาไปหน้าเข้าสู่ระบบแล้วกลับมาหน้าสั่งซื้อ", async () => {
    expect(await open(CheckoutPage())).toEqual({ redirect: "/login?next=%2Fcheckout" });
  });
});

describe("CHK-005 กดสั่งซื้อผ่านหน้าเว็บ", () => {
  test("CHK-005 กดสั่งซื้อสำเร็จ ถูกพาไปหน้าจ่ายเงินของกลุ่มคำสั่งซื้อ", async () => {
    const s = somchai();
    const form = orderForm(s.buyer.id);

    await expect(placeOrderAction(form)).rejects.toMatchObject({ url: expect.stringMatching(/^\/pay\/\d+$/) });
    const groupId = Number(db.prepare("SELECT id FROM order_groups").get()?.id);
    await expect(placeOrderAction(form)).rejects.toMatchObject({ url: `/pay/${groupId}` });
    expect(Number(db.prepare("SELECT count(*) AS n FROM orders").get()?.n)).toBe(2);
  });

  test("CHK-005 สั่งไม่ได้ ได้ข้อความกลับมาและหน้าโหลดราคาล่าสุด", async () => {
    const s = somchai();
    const form = orderForm(s.buyer.id);
    db.prepare("UPDATE variants SET price = 180 WHERE id = ?").run(s.glass);

    const result = await placeOrderAction(form);
    expect(Object.values(result.problems)).toEqual(["ราคาเปลี่ยนจาก ฿150 เป็น ฿180"]);
    expect(request.refreshed).toBe(1);
    expect((await open(CheckoutPage())).html).toContain("฿660");
  });

  test("CHK-005 ระบบพังหรือข้อมูลผิดรูปแบบ ผู้ซื้อเห็น สั่งซื้อไม่สำเร็จ กรุณาลองใหม่", async () => {
    const s = somchai();
    const form = orderForm(s.buyer.id);
    form.set("lines", "ไม่ใช่ JSON");

    const result = await withTimeout(placeOrderAction)(null, form);
    expect(result).toEqual({ failed: true });
    expect(PLACE_ORDER_FAILED).toBe("สั่งซื้อไม่สำเร็จ กรุณาลองใหม่");
    expect(Number(db.prepare("SELECT count(*) AS n FROM orders").get()?.n)).toBe(0);
  });

  test("CHK-005 ยังไม่เข้าสู่ระบบ กดสั่งซื้อไม่ได้", async () => {
    const s = somchai();
    const form = orderForm(s.buyer.id);
    request.cookies.clear();

    await expect(placeOrderAction(form)).rejects.toMatchObject({ url: "/login?next=%2Fcheckout" });
    expect(Number(db.prepare("SELECT count(*) AS n FROM orders").get()?.n)).toBe(0);
  });
});

describe("CHK-Q01 ความเร็วของการกดสั่งซื้อ", () => {
  test("CHK-Q01 ได้ผลเร็ว ส่งผลนั้นกลับไป และการพาไปหน้าจ่ายเงินไม่ถูกกลืน", async () => {
    const failure = { ok: false as const, problems: {}, addressProblem: "กรุณาเลือกที่อยู่จัดส่ง" };
    expect(await withTimeout(async () => failure)(null, new FormData())).toBe(failure);
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/pay/1;307;" });
    await expect(withTimeout(async () => Promise.reject(redirect))(null, new FormData())).rejects.toBe(redirect);
  });

  test("CHK-Q01 รอเกิน 10 วินาที เห็น สั่งซื้อไม่สำเร็จ กรุณาลองใหม่", async () => {
    vi.useFakeTimers();
    const result = withTimeout(() => new Promise(() => {}))(null, new FormData());
    await vi.advanceTimersByTimeAsync(9_999);
    let settled = false;
    void result.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({ failed: true });
  });
});
