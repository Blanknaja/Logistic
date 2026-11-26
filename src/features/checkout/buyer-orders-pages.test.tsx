// test ระดับหน้าและ server action ของคำสั่งซื้อผู้ซื้อ ส่วน vi.mock ลอกจาก src/features/account/account-pages.test.tsx

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import OrderNotFound from "@/app/orders/[orderNo]/not-found";
import OrderPage from "@/app/orders/[orderNo]/page";
import OrdersError from "@/app/orders/error";
import OrdersPage from "@/app/orders/page";
import Loading from "@/app/loading";
import { createSession } from "@/features/account/server/sessions";
import { cancelOrderAction, goToPaymentAction, loadMoreOrdersAction } from "@/features/checkout/buyer-order-actions";
import { cancelConfirmMessage } from "@/features/checkout/components/order-detail";
import { loadMore, OrderList } from "@/features/checkout/components/order-list";
import { nav } from "@/features/checkout/nav";
import { listBuyerOrders } from "@/features/checkout/server/buyer-orders";
import type { Db } from "@/shared/db";
import { addAccount, addOrder, addParcel, addPayment, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { headerLinks } from "@/shared/nav/registry";
import { SESSION_COOKIE } from "@/shared/session";
import { ORDER_STATUS, PAYMENT_STATUS } from "@/shared/statuses";

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

// บาง test ตรึงวันที่ไว้ในปี 2026 เพราะวันที่ของปีนี้แสดงโดยไม่มีปี
afterEach(() => void vi.useRealTimers());

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

function signInAs(accountId: number): void {
  request.cookies.set(SESSION_COOKIE, createSession(db, accountId));
}

const ordersPage = (searchParams: Record<string, string> = {}) =>
  open(OrdersPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }));

const orderPage = (orderNo: string, searchParams: Record<string, string> = {}) =>
  open(OrderPage({ params: Promise.resolve({ orderNo }), searchParams: Promise.resolve(searchParams) }));

const cancel = (orderNo: string) => {
  const form = new FormData();
  form.set("orderNo", orderNo);
  return submit(cancelOrderAction(form));
};

const goToPayment = (orderNo: string, groupId: number) => {
  const form = new FormData();
  form.set("orderNo", orderNo);
  form.set("groupId", String(groupId));
  return submit(goToPaymentAction(form));
};

const count = (html: string | undefined, text: string) => html?.split(text).length ?? 0;
/** ปุ่ม "จ่ายเงิน" เป็นฟอร์มที่ส่งเลขกลุ่มคำสั่งซื้อ ไม่ใช่ลิงก์ไปหน้าจ่ายเงินตรงๆ (CHK-008) */
const payButton = (groupId: number) => `<input type="hidden" name="groupId" value="${groupId}"/>`;
const PAY_BUTTON = ">จ่ายเงิน</button>";
const cards = (html: string | undefined) => html?.match(/<li class="_order_\w+">/g)?.length ?? 0;
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const statusOf = (orderNo: string) =>
  (db.prepare("SELECT status FROM orders WHERE order_no = ?").get(orderNo) as { status: string }).status;

/** สมชายกดสั่งซื้อเมื่อ 5 นาทีก่อน ได้คำสั่งซื้อร้าน "ผ้าดี" 440 บาท และ "บ้านแก้ว" 190 บาท ในกลุ่มเดียวกัน */
function somchaiOrdersTwoShops(orderedMinutesAgo = 5) {
  const somchai = addAccount(db, { displayName: "สมชาย" });
  const shirt = addProduct(db, { shopId: addShop(db, { name: "ผ้าดี" }).id, name: "เสื้อยืด", price: 200 });
  const glass = addProduct(db, { shopId: addShop(db, { name: "บ้านแก้ว" }).id, name: "แก้วน้ำ", price: 150 });
  const orderedAt = minutesAgo(orderedMinutesAgo);
  const first = addOrder(db, { buyerAccountId: somchai.id, items: [{ variantId: shirt.variantIds[0], quantity: 2 }], orderedAt });
  const second = addOrder(db, {
    buyerAccountId: somchai.id,
    items: [{ variantId: glass.variantIds[0] }],
    orderedAt,
    groupId: first.groupId,
  });
  signInAs(somchai.id);
  return { somchai, first, second, shirt };
}

/** สมชายมีคำสั่งซื้อที่จ่ายแล้ว 25 รายการ */
function somchaiHas25Orders() {
  const somchai = addAccount(db);
  const product = addProduct(db, { price: 150 });
  for (let i = 0; i < 25; i++) {
    addOrder(db, {
      buyerAccountId: somchai.id,
      items: [{ variantId: product.variantIds[0] }],
      status: ORDER_STATUS.paid,
      orderedAt: minutesAgo(100 - i),
    });
  }
  signInAs(somchai.id);
  return somchai;
}

describe("CHK-009 หน้ารายการคำสั่งซื้อของผู้ซื้อ", () => {
  test("CHK-009 เห็น 20 รายการล่าสุดพร้อมปุ่มดูเพิ่ม แล้วดูเพิ่มได้อีก 5 รายการ", async () => {
    const somchai = somchaiHas25Orders();

    const { html } = await ordersPage();
    expect(cards(html)).toBe(20);
    expect(html).toContain("ดูเพิ่ม");

    const first = listBuyerOrders(db, somchai.id);
    const more = await loadMoreOrdersAction(null, first.next!);
    expect(more.orders).toHaveLength(5);
    expect(more.next).toBeNull();
  });

  test("CHK-009 กรองรอจ่ายเงิน เห็นเฉพาะ 2 รายการ พร้อมเวลาหมดเขตและปุ่มจ่ายเงินของกลุ่ม", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-26T12:00:00+07:00") });
    const { somchai, first } = somchaiOrdersTwoShops();
    const paid = addProduct(db);
    addOrder(db, { buyerAccountId: somchai.id, items: [{ variantId: paid.variantIds[0] }], status: ORDER_STATUS.paid });

    const { html } = await ordersPage({ status: ORDER_STATUS.awaitingPayment });

    expect(cards(html)).toBe(2);
    // สั่งซื้อ 11:55 จ่ายได้ถึง 30 นาทีหลังจากนั้น
    expect(count(html, "จ่ายภายใน 26 พ.ย. 12:25") - 1).toBe(2);
    expect(count(html, payButton(first.groupId)) - 1).toBe(2);
    expect(count(html, PAY_BUTTON) - 1).toBe(2);
    expect(html).toContain("ผ้าดี");
    expect(html).toContain("เสื้อยืด · รวม 2 ชิ้น");
    expect(html).toContain("฿440");
  });

  test("CHK-009 ยังไม่เคยสั่งซื้อ เห็นหน้าว่างพร้อมปุ่มไปเลือกซื้อสินค้า", async () => {
    signInAs(addAccount(db).id);

    const { html } = await ordersPage();
    expect(html).toContain("ยังไม่มีคำสั่งซื้อ");
    expect(html).toContain("ไปเลือกซื้อสินค้า");

    const filtered = await ordersPage({ status: ORDER_STATUS.shipping });
    expect(filtered.html).toContain("ไม่มีคำสั่งซื้อในสถานะนี้");
  });

  test("CHK-009 กดดูเพิ่มตอนเน็ตหลุด เห็นข้อความและปุ่มลองใหม่ โดย 20 รายการเดิมยังอยู่", async () => {
    const somchai = somchaiHas25Orders();
    const initial = { ...listBuyerOrders(db, somchai.id), failed: false };

    const state = await loadMore(initial, async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(state.failed).toBe(true);
    expect(state.orders).toHaveLength(20);
    const html = renderToStaticMarkup(<OrderList initial={state} status={null} />);
    expect(html).toContain("โหลดคำสั่งซื้อไม่สำเร็จ");
    expect(html).toContain("ลองใหม่");
    expect(cards(html)).toBe(20);
  });

  test("CHK-009 แต่ละแถวขึ้นต้นด้วยสถานะ มีรูปสินค้าชิ้นแรก และแถวที่กำลังจัดส่งมีลิงก์ติดตามพัสดุ", async () => {
    const { first, second } = somchaiOrdersTwoShops();
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(ORDER_STATUS.shipping, first.id);
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(ORDER_STATUS.paid, second.id);
    db.prepare("UPDATE order_items SET cover_image_url = '/sample-images/shirt.svg' WHERE order_id = ?").run(first.id);
    const shipping = addParcel(db, { orderId: first.id });
    const paid = addParcel(db, { orderId: second.id });

    const { html = "" } = await ordersPage();

    const row = html.split('<li class="_order_').find((part) => part.includes("ผ้าดี")) ?? "";
    expect(row).toMatch(/<img src="\/sample-images\/shirt.svg"[^>]*>(<span[^>]*>){2}กำลังจัดส่ง<\/span>/);
    expect(html).toContain(`<a class="link-action" href="/track/${shipping.trackingNo}">ติดตามพัสดุ</a>`);
    expect(html).not.toContain(`/track/${paid.trackingNo}`);
  });

  test("CHK-009 ตัวกรองเป็นแถวเดียวเหนือรายการ ตัวที่เลือกอยู่ได้ขอบของตัวเลือกที่เลือกอยู่", async () => {
    somchaiOrdersTwoShops();
    const { html = "" } = await ordersPage({ status: ORDER_STATUS.awaitingPayment });

    expect(html.indexOf('aria-label="กรองตามสถานะ"')).toBeLessThan(html.indexOf('<li class="_order_'));
    expect(html).toMatch(/class="chip _chipLink_\w+" aria-current="page"[^>]*>รอจ่ายเงิน</);
  });

  test("CHK-009 REV-005 ตัวกรองมี 7 ตัว คือทั้งหมด สถานะทั้ง 5 และรอรีวิวพร้อมจำนวน", async () => {
    somchaiOrdersTwoShops();
    const { html = "" } = await ordersPage();
    const filters = html.match(/aria-label="กรองตามสถานะ".*?<\/nav>/)?.[0] ?? "";
    expect([...filters.matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map((match) => match[1])).toEqual([
      "ทั้งหมด",
      "รอจ่ายเงิน",
      "จ่ายแล้ว",
      "กำลังจัดส่ง",
      "สำเร็จ",
      "ยกเลิก",
      "รอรีวิว 0",
    ]);
  });

  test("CHK-009 ยังไม่เข้าสู่ระบบ ถูกพาไปหน้าเข้าสู่ระบบ", async () => {
    expect((await ordersPage()).redirect).toBe("/login?next=%2Forders");
  });

  test("CHK-009 ระหว่างรอเห็นตัวบอกว่ากำลังโหลด", () => {
    expect(renderToStaticMarkup(<Loading />)).toContain("กำลังโหลด");
  });

  test("CHK-009 แถบด้านบนมีลิงก์คำสั่งซื้อเฉพาะคนที่เข้าสู่ระบบ", () => {
    const viewer = { id: 1, email: "a@example.com", displayName: "ก", isAdmin: false, shopId: null };
    expect(headerLinks(viewer, [nav])).toContainEqual({ label: "คำสั่งซื้อ", href: "/orders" });
    expect(headerLinks(null, [nav])).not.toContainEqual({ label: "คำสั่งซื้อ", href: "/orders" });
  });
});

describe("CHK-010 หน้ารายละเอียดคำสั่งซื้อ", () => {
  test("CHK-010 จ่ายแล้ว เห็นราคาตามตอนสั่ง ค่าส่ง ยอดรวม ที่อยู่ และลิงก์ติดตามพัสดุ ไม่มีปุ่มยกเลิก", async () => {
    const { first, shirt } = somchaiOrdersTwoShops();
    db.prepare("UPDATE orders SET status = ? WHERE group_id = ?").run(ORDER_STATUS.paid, first.groupId);
    db.prepare("UPDATE variants SET price = 250 WHERE id = ?").run(shirt.variantIds[0]);
    const parcel = addParcel(db, { orderId: first.id });

    const { html } = await orderPage(first.orderNo);

    expect(html).toContain(first.orderNo);
    expect(html).toContain("จ่ายแล้ว");
    expect(html).toContain("฿200 × 2");
    expect(html).not.toContain("฿250");
    expect(html).toContain("฿40");
    expect(html).toContain("฿440");
    expect(html).toContain("สมชาย ใจดี 0100000000");
    expect(html).toContain(`href="/track/${parcel.trackingNo}"`);
    expect(html).toContain("ติดตามพัสดุ");
    expect(html).not.toContain("ยกเลิกคำสั่งซื้อ");
    expect(html).not.toContain(PAY_BUTTON);
  });

  test("CHK-010 รายการที่สั่งชิ้นเดียวแสดงจำนวน 1 ชิ้น และไม่ซ้ำราคาต่อชิ้น", async () => {
    const { second } = somchaiOrdersTwoShops();

    const html = ((await orderPage(second.orderNo)).html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    expect(html).toContain("แก้วน้ำ 1 ชิ้น ฿150");
    expect(html).not.toContain("×");
  });

  test("CHK-010 หัวเรื่องคือสถานะ เลขคำสั่งซื้อเป็นข้อมูลรองใต้หัวเรื่อง", async () => {
    const { first } = somchaiOrdersTwoShops();
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(ORDER_STATUS.shipping, first.id);

    const { html = "" } = await orderPage(first.orderNo);

    expect(html).toMatch(new RegExp(`<h1>กำลังจัดส่ง</h1><p class="_meta_\\w+">คำสั่งซื้อ ${first.orderNo} · ผ้าดี · สั่งเมื่อ `));
  });

  test("CHK-010 รอจ่ายเงิน เห็นเวลาหมดเขต ปุ่มจ่ายเงิน ปุ่มยกเลิก และเลขคำสั่งซื้ออื่นในกลุ่ม", async () => {
    const { first, second } = somchaiOrdersTwoShops();

    const { html } = await orderPage(first.orderNo);

    expect(html).toContain("จ่ายภายใน");
    expect(html).toContain(payButton(first.groupId));
    expect(html).toContain(PAY_BUTTON);
    expect(html).toContain("ยกเลิกคำสั่งซื้อ");
    expect(html).toContain(`href="/orders/${second.orderNo}"`);
    expect(html).toContain("บ้านแก้ว");
  });

  test("CHK-010 ยกเลิกแล้ว เห็นเหตุผลและเวลาที่ยกเลิก และลิงก์ติดตามพัสดุถ้ามีพัสดุ", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-26T12:00:00+07:00") });
    const { first } = somchaiOrdersTwoShops();
    const cancelledAt = minutesAgo(1);
    db.prepare("UPDATE orders SET status = ?, cancel_reason = 'ส่งไม่สำเร็จ', cancelled_at = ? WHERE id = ?").run(
      ORDER_STATUS.cancelled,
      cancelledAt,
      first.id,
    );
    const parcel = addParcel(db, { orderId: first.id });

    const { html } = await orderPage(first.orderNo);

    expect(html).toContain("ยกเลิกเมื่อ 26 พ.ย. 11:59 เหตุผล: ส่งไม่สำเร็จ");
    expect(html).toContain(`href="/track/${parcel.trackingNo}"`);
    expect(html).not.toContain("จ่ายภายใน");
  });

  test("CHK-010 เปิดคำสั่งซื้อของคนอื่นหรือที่ไม่มีอยู่ เห็นไม่พบคำสั่งซื้อ", async () => {
    const { first } = somchaiOrdersTwoShops();
    signInAs(addAccount(db, { displayName: "สมหญิง" }).id);

    expect((await orderPage(first.orderNo)).redirect).toBe("not-found");
    expect((await orderPage("9999999999")).redirect).toBe("not-found");
    const html = renderToStaticMarkup(<OrderNotFound />);
    expect(html).toContain("ไม่พบคำสั่งซื้อ");
    expect(html).toContain('href="/orders"');
    expect(html).toContain("กลับไปรายการคำสั่งซื้อ");
  });

  test("CHK-010 โหลดไม่ได้ เห็นข้อความและปุ่มลองใหม่", () => {
    const html = renderToStaticMarkup(<OrdersError error={new Error("offline")} retry={() => {}} />);
    expect(html).toContain("โหลดคำสั่งซื้อไม่สำเร็จ");
    expect(html).toContain("ลองใหม่");
  });
});

describe("CHK-008 กดจ่ายเงินหลังหมดเวลา", () => {
  test("CHK-008 ก่อนหมดเขต กดจ่ายเงินแล้วไปหน้าจ่ายเงินของกลุ่มคำสั่งซื้อ", async () => {
    const { first } = somchaiOrdersTwoShops();

    expect((await goToPayment(first.orderNo, first.groupId)).redirect).toBe(`/pay/${first.groupId}`);
    expect(statusOf(first.orderNo)).toBe(ORDER_STATUS.awaitingPayment);
  });

  test("CHK-008 เปิดหน้าค้างไว้จนเลยเวลาแล้วกดจ่ายเงิน เห็นข้อความหมดเวลา หน้าเป็นยกเลิก และไม่ถูกพาไปหน้าจ่ายเงิน", async () => {
    const { first, second } = somchaiOrdersTwoShops(32);

    const result = await goToPayment(first.orderNo, first.groupId);

    expect(result.redirect).toBe(`/orders/${first.orderNo}?notice=expired`);
    expect(statusOf(first.orderNo)).toBe(ORDER_STATUS.cancelled);
    expect(statusOf(second.orderNo)).toBe(ORDER_STATUS.cancelled);
    const { html } = await orderPage(first.orderNo, { notice: "expired" });
    expect(html).toContain("คำสั่งซื้อนี้หมดเวลาจ่ายเงินแล้ว");
    expect(html).toContain("เหตุผล: หมดเวลาจ่ายเงิน");
    expect(html).not.toContain(PAY_BUTTON);
  });

  test("CHK-008 กดจ่ายเงินจากหน้ารายการหลังหมดเวลา ได้ผลเดียวกัน", async () => {
    const { first, second } = somchaiOrdersTwoShops(29);
    const { html } = await ordersPage();
    expect(html).toContain(payButton(first.groupId));
    db.prepare("UPDATE order_groups SET payment_deadline = ? WHERE id = ?").run(minutesAgo(1), first.groupId);

    expect((await goToPayment(second.orderNo, first.groupId)).redirect).toBe(`/orders/${second.orderNo}?notice=expired`);
  });
});

describe("CHK-011 ผู้ซื้อยกเลิกคำสั่งซื้อตอนรอจ่ายเงิน", () => {
  test("CHK-011 ก่อนยืนยันบอกว่าจะยกเลิกกี่คำสั่งซื้อจากร้านไหน แล้วยืนยันได้ทั้งกลุ่ม", async () => {
    const { first, second } = somchaiOrdersTwoShops();

    const confirm = await orderPage(first.orderNo, { cancel: "1" });
    expect(confirm.html).toContain("จะยกเลิก 2 คำสั่งซื้อที่จ่ายรวมกัน: ผ้าดี และ บ้านแก้ว");
    expect(confirm.html).toMatch(/class="button button-secondary"[^>]*>ยืนยันยกเลิก/);

    expect((await cancel(first.orderNo)).redirect).toBe(`/orders/${first.orderNo}`);
    expect(statusOf(first.orderNo)).toBe(ORDER_STATUS.cancelled);
    expect(statusOf(second.orderNo)).toBe(ORDER_STATUS.cancelled);

    const { html } = await orderPage(first.orderNo);
    expect(html).toContain("เหตุผล: ผู้ซื้อยกเลิก");
    expect(html).not.toContain(PAY_BUTTON);
    expect(html).not.toContain("ยกเลิกคำสั่งซื้อ");
  });

  test("CHK-011 กดไม่ยกเลิก กลับไปหน้าเดิมและคำสั่งซื้อยังรอจ่ายเงิน", async () => {
    const { first, second } = somchaiOrdersTwoShops();

    const confirm = await orderPage(first.orderNo, { cancel: "1" });
    expect(confirm.html).toMatch(new RegExp(`href="/orders/${first.orderNo}"[^>]*>ไม่ยกเลิก`));

    const back = await orderPage(first.orderNo);
    expect(back.html).toContain(payButton(first.groupId));
    expect(statusOf(first.orderNo)).toBe(ORDER_STATUS.awaitingPayment);
    expect(statusOf(second.orderNo)).toBe(ORDER_STATUS.awaitingPayment);
  });

  test("CHK-011 มีการจ่ายเงินที่รอผล ยกเลิกไม่ได้และเห็นข้อความให้เปลี่ยนวิธีจ่ายก่อน", async () => {
    const { first } = somchaiOrdersTwoShops();
    addPayment(db, { groupId: first.groupId, status: PAYMENT_STATUS.pending });

    const result = await cancel(first.orderNo);

    expect(result.state).toEqual({ error: "มีการจ่ายเงินที่กำลังรอผลอยู่ กดเปลี่ยนวิธีจ่ายก่อนจึงยกเลิกได้" });
    expect(statusOf(first.orderNo)).toBe(ORDER_STATUS.awaitingPayment);
  });

  test("CHK-011 ระบบรับการจ่ายเงินก่อน เห็นว่าจ่ายเงินแล้วยกเลิกไม่ได้", async () => {
    const { first } = somchaiOrdersTwoShops();
    db.prepare("UPDATE orders SET status = ? WHERE group_id = ?").run(ORDER_STATUS.paid, first.groupId);

    const result = await cancel(first.orderNo);
    expect(result.redirect).toBe(`/orders/${first.orderNo}?notice=alreadyPaid`);

    const { html } = await orderPage(first.orderNo, { notice: "alreadyPaid" });
    expect(html).toContain("คำสั่งซื้อนี้จ่ายเงินแล้ว ยกเลิกจากหน้านี้ไม่ได้");
    expect(html).toContain("จ่ายแล้ว");
  });

  test("CHK-011 ยกเลิกหลังหมดเวลาไปแล้ว เห็นว่าถูกยกเลิกไปแล้วและเหตุผลยังเป็นหมดเวลาจ่ายเงิน", async () => {
    const { first } = somchaiOrdersTwoShops();
    db.prepare("UPDATE orders SET status = ?, cancel_reason = 'หมดเวลาจ่ายเงิน', cancelled_at = ? WHERE group_id = ?").run(
      ORDER_STATUS.cancelled,
      minutesAgo(3),
      first.groupId,
    );

    const result = await cancel(first.orderNo);
    expect(result.redirect).toBe(`/orders/${first.orderNo}?notice=alreadyCancelled`);

    const { html } = await orderPage(first.orderNo, { notice: "alreadyCancelled" });
    expect(html).toContain("คำสั่งซื้อนี้ถูกยกเลิกไปแล้ว");
    expect(html).toContain("เหตุผล: หมดเวลาจ่ายเงิน");
  });

  test("CHK-011 ข้อความยืนยันของกลุ่มที่มีร้านเดียวหรือหลายร้าน", () => {
    expect(cancelConfirmMessage([{ shopName: "ผ้าดี" }])).toBe("จะยกเลิก 1 คำสั่งซื้อ: ผ้าดี");
    expect(cancelConfirmMessage([{ shopName: "ก" }, { shopName: "ข" }, { shopName: "ค" }])).toBe(
      "จะยกเลิก 3 คำสั่งซื้อที่จ่ายรวมกัน: ก, ข และ ค",
    );
  });
});
