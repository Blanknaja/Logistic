import { beforeEach, describe, expect, test } from "vitest";
import {
  countShopOrders,
  findOrderParcel,
  getShopOrder,
  listShopOrders,
  PAGE_SIZE,
  shippingTarget,
  shopOrdersVersion,
  type ListQuery,
} from "@/features/shop-orders/server/orders";
import type { Db } from "@/shared/db";
import { addAccount, addOrder, addParcel, addPayment, addProduct, addShop, type Address } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { ORDER_STATUS, PARCEL_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, type OrderStatus } from "@/shared/statuses";

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
  buyerId = addAccount(db, { email: "somying@example.com", displayName: "สมหญิง" }).id;
  minute = 0;
});

function newShop(name: string) {
  const shop = addShop(db, { name });
  const product = addProduct(db, { shopId: shop.id, name: "เสื้อยืดคอกลม", price: 250 });
  return { id: shop.id, variantId: product.variantIds[0] };
}

type Shop = ReturnType<typeof newShop>;

let minute = 0;
/** คำสั่งซื้อใหม่ของร้าน เวลาสั่งเดินหน้าทีละนาทีตามลำดับที่สร้าง */
function order(shop: Shop, status: OrderStatus = ORDER_STATUS.awaitingPayment, quantity = 1) {
  minute++;
  const orderedAt = new Date(Date.UTC(2026, 10, 23, 0, minute)).toISOString();
  return addOrder(db, { buyerAccountId: buyerId, items: [{ variantId: shop.variantId, quantity }], status, orderedAt, address: SOMYING });
}

const query = (input: Partial<ListQuery> = {}): ListQuery => ({ status: null, q: "", page: 1, asOf: null, ...input });

function setOrderNo(orderId: number, orderNo: string) {
  db.prepare("UPDATE orders SET order_no = ? WHERE id = ?").run(orderNo, orderId);
}

describe("ORD-001 รายการคำสั่งซื้อของร้านตัวเอง", () => {
  test("ORD-001 เห็น 20 รายการใหม่สุดของร้านตัวเอง มี 3 หน้า ไม่เห็นของร้านอื่น", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const wichai = newShop("วิชัยรองเท้า");
    for (let i = 0; i < 12; i++) order(wichai);
    for (let i = 0; i < 44; i++) order(somchai);
    const top = order(somchai, ORDER_STATUS.paid, 2);
    for (let i = 0; i < 12; i++) order(wichai);
    db.prepare("UPDATE orders SET ordered_at = '2026-11-24T01:52:00.000Z' WHERE id = ?").run(top.id);

    const list = listShopOrders(db, somchai.id, query());

    expect(list.items).toHaveLength(PAGE_SIZE);
    expect(list.total).toBe(45);
    expect(list.totalPages).toBe(3);
    expect(list.items[0]).toEqual({
      orderNo: top.orderNo,
      orderedAt: "2026-11-24T01:52:00.000Z",
      recipientName: "สมหญิง ใจดี",
      itemCount: 2,
      total: 540,
      status: ORDER_STATUS.paid,
      trackingNo: null,
    });
    const allNos = [1, 2, 3].flatMap((page) => listShopOrders(db, somchai.id, query({ page })).items.map((row) => row.orderNo));
    const wichaiNos = listShopOrders(db, wichai.id, query({ page: 1 })).items.map((row) => row.orderNo);
    expect(allNos).toHaveLength(45);
    expect(allNos.filter((no) => wichaiNos.includes(no))).toEqual([]);
  });

  test("ORD-001 ร้านที่ยังไม่มีคำสั่งซื้อได้รายการว่าง และทุกสถานะนับ 0", () => {
    const somchai = newShop("สมชายเสื้อผ้า");

    const list = listShopOrders(db, somchai.id, query());

    expect(list.items).toEqual([]);
    expect(list.total).toBe(0);
    expect(countShopOrders(db, somchai.id)).toEqual({ all: 0, รอจ่ายเงิน: 0, จ่ายแล้ว: 0, กำลังจัดส่ง: 0, สำเร็จ: 0, ยกเลิก: 0 });
  });

  test("ORD-001 คำสั่งซื้อใหม่ที่เข้ามาระหว่างเปลี่ยนหน้าไม่ทำให้หน้า 2 ซ้ำกับหน้า 1 และ 45 รายการเดิมดูได้ครบ", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const original = Array.from({ length: 45 }, () => order(somchai).orderNo);
    const page1 = listShopOrders(db, somchai.id, query());

    order(somchai);
    const page2 = listShopOrders(db, somchai.id, query({ page: 2, asOf: page1.asOf }));
    const page3 = listShopOrders(db, somchai.id, query({ page: 3, asOf: page1.asOf }));

    const seen = [...page1.items, ...page2.items, ...page3.items].map((row) => row.orderNo);
    expect(new Set(seen).size).toBe(45);
    expect(seen.sort()).toEqual([...original].sort());
  });
});

describe("ORD-002 กรองตามสถานะ", () => {
  test("ORD-002 กรองจ่ายแล้วเห็น 5 รายการ และนับแต่ละสถานะถูก", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const plan: [OrderStatus, number][] = [
      [ORDER_STATUS.awaitingPayment, 3],
      [ORDER_STATUS.paid, 5],
      [ORDER_STATUS.shipping, 7],
      [ORDER_STATUS.completed, 26],
      [ORDER_STATUS.cancelled, 4],
    ];
    for (const [status, n] of plan) for (let i = 0; i < n; i++) order(somchai, status);

    const list = listShopOrders(db, somchai.id, query({ status: ORDER_STATUS.paid }));

    expect(list.items.map((row) => row.status)).toEqual(Array(5).fill(ORDER_STATUS.paid));
    expect(countShopOrders(db, somchai.id)).toEqual({ all: 45, รอจ่ายเงิน: 3, จ่ายแล้ว: 5, กำลังจัดส่ง: 7, สำเร็จ: 26, ยกเลิก: 4 });
  });

  test("ORD-002 กรองสถานะที่ไม่มีคำสั่งซื้อได้รายการว่าง และนับ 0", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    for (let i = 0; i < 10; i++) order(somchai, ORDER_STATUS.paid);

    const list = listShopOrders(db, somchai.id, query({ status: ORDER_STATUS.cancelled }));

    expect(list.total).toBe(0);
    expect(countShopOrders(db, somchai.id)[ORDER_STATUS.cancelled]).toBe(0);
  });
});

describe("ORD-003 ค้นหาด้วยเลขคำสั่งซื้อ", () => {
  test("ORD-003 ค้นบางส่วนเจอคำสั่งซื้อทุกสถานะ แม้ตัวกรองที่เลือกอยู่เป็นสถานะอื่น", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    setOrderNo(order(somchai, ORDER_STATUS.paid).id, "2611240045");
    setOrderNo(order(somchai, ORDER_STATUS.completed).id, "2611240046");

    const list = listShopOrders(db, somchai.id, query({ status: ORDER_STATUS.completed, q: "0045" }));

    expect(list.items.map((row) => row.orderNo)).toEqual(["2611240045"]);
  });

  test("ORD-003 ค้นเลขของร้านอื่นได้ผลว่างเหมือนเลขที่ไม่มีอยู่จริง", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const wichai = newShop("วิชัยรองเท้า");
    order(somchai);
    setOrderNo(order(wichai).id, "2611240099");

    expect(listShopOrders(db, somchai.id, query({ q: "2611240099" })).items).toEqual([]);
    expect(listShopOrders(db, somchai.id, query({ q: "9999999999" })).items).toEqual([]);
  });
});

function paidOrder(shop: Shop) {
  const created = order(shop, ORDER_STATUS.paid, 2);
  db.prepare("UPDATE orders SET ordered_at = '2026-11-24T01:52:00.000Z' WHERE id = ?").run(created.id);
  db.prepare("UPDATE order_items SET product_name = 'เสื้อยืดคอกลม', variant_label = 'สีดำ ขนาด L' WHERE order_id = ?").run(created.id);
  return created;
}

describe("ORD-005 สินค้าและยอดเงินในหน้ารายละเอียด", () => {
  test("ORD-005 เห็นสินค้า แบบย่อย ราคา จำนวน ยอด และเวลาสั่งซื้อ", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const created = paidOrder(somchai);

    const detail = getShopOrder(db, somchai.id, created.orderNo);

    expect(detail).toMatchObject({
      orderNo: created.orderNo,
      orderedAt: "2026-11-24T01:52:00.000Z",
      status: ORDER_STATUS.paid,
      itemsTotal: 500,
      shippingFee: 40,
      total: 540,
    });
    expect(detail?.items).toEqual([
      expect.objectContaining({ productName: "เสื้อยืดคอกลม", variantLabel: "สีดำ ขนาด L", unitPrice: 250, quantity: 2 }),
    ]);
  });

  test("ORD-005 แก้ราคาและลบแบบย่อยทีหลัง คำสั่งซื้อยังแสดงตามตอนสั่ง", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const created = paidOrder(somchai);
    db.prepare("UPDATE variants SET price = 300, removed_at = ? WHERE id = ?").run(new Date().toISOString(), somchai.variantId);
    db.prepare("UPDATE products SET name = 'เสื้อยืดรุ่นใหม่'").run();

    const detail = getShopOrder(db, somchai.id, created.orderNo);

    expect(detail?.items[0]).toMatchObject({ productName: "เสื้อยืดคอกลม", variantLabel: "สีดำ ขนาด L", unitPrice: 250 });
    expect(detail?.total).toBe(540);
  });
});

describe("ORD-006 ที่อยู่จัดส่งและผู้รับ", () => {
  test("ORD-006 เห็นชื่อผู้รับ เบอร์โทร และที่อยู่ ไม่มีอีเมลของผู้ซื้อ", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const created = paidOrder(somchai);

    const detail = getShopOrder(db, somchai.id, created.orderNo);

    expect(detail?.recipient).toEqual({
      name: "สมหญิง ใจดี",
      phone: "081-234-5678",
      address: "99/1 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110",
    });
    expect(JSON.stringify(detail)).not.toContain("somying@example.com");
  });

  test("ORD-006 ผู้ซื้อแก้ที่อยู่ในบัญชีทีหลัง คำสั่งซื้อยังเป็นที่อยู่ตอนสั่ง", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const created = paidOrder(somchai);
    db.prepare("UPDATE shipping_addresses SET province = 'เชียงใหม่'").run();

    expect(getShopOrder(db, somchai.id, created.orderNo)?.recipient.address).toContain("กรุงเทพฯ 10110");
  });
});

describe("ORD-007 ผลการจ่ายเงิน", () => {
  test("ORD-007 การจ่ายเงินสำเร็จแสดงวิธีจ่ายและเวลาที่จ่าย ไม่มีเลขบัตร", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const created = paidOrder(somchai);
    const payment = addPayment(db, { groupId: created.groupId, method: PAYMENT_METHOD.promptPay, status: PAYMENT_STATUS.succeeded });
    db.prepare("UPDATE payments SET resolved_at = '2026-11-24T01:55:00.000Z', card_last4 = '4242' WHERE id = ?").run(payment.id);

    const detail = getShopOrder(db, somchai.id, created.orderNo);

    expect(detail?.payment).toEqual({ method: PAYMENT_METHOD.promptPay, paidAt: "2026-11-24T01:55:00.000Z" });
    expect(JSON.stringify(detail)).not.toContain("4242");
  });

  test("ORD-007 การจ่ายเงินที่ยังรอผลหรือไม่สำเร็จถือว่ายังไม่จ่าย", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const created = order(somchai);
    addPayment(db, { groupId: created.groupId, status: PAYMENT_STATUS.failed });
    addPayment(db, { groupId: created.groupId, status: PAYMENT_STATUS.pending });

    expect(getShopOrder(db, somchai.id, created.orderNo)?.payment).toBeNull();
  });
});

describe("ORD-008 เลขติดตามพัสดุและสถานะการจัดส่ง", () => {
  test("ORD-008 เห็นเลขติดตามพัสดุ สถานะล่าสุด และเวลาที่เปลี่ยนเป็นสถานะนั้น", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const created = order(somchai, ORDER_STATUS.shipping);
    const parcel = addParcel(db, { orderId: created.id, trackingNo: "BS0000001234", status: PARCEL_STATUS.handedOver });
    db.prepare("INSERT INTO parcel_history (parcel_id, status, location, created_at) VALUES (?, ?, 'กรุงเทพฯ', '2026-11-24T00:30:00.000Z')").run(
      parcel.id,
      PARCEL_STATUS.inTransit,
    );
    db.prepare("UPDATE parcels SET status = ? WHERE id = ?").run(PARCEL_STATUS.inTransit, parcel.id);

    expect(findOrderParcel(db, created.id)).toEqual({
      trackingNo: "BS0000001234",
      status: PARCEL_STATUS.inTransit,
      changedAt: "2026-11-24T00:30:00.000Z",
    });
  });

  test("ORD-008 คำสั่งซื้อที่ยังรอจ่ายเงินไม่มีพัสดุ", () => {
    const somchai = newShop("สมชายเสื้อผ้า");

    expect(findOrderParcel(db, order(somchai).id)).toBeNull();
  });
});

describe("ORD-009 ไปหน้าจัดส่งของพัสดุ", () => {
  test("ORD-009 คำสั่งซื้อจ่ายแล้วพาไปพัสดุของคำสั่งซื้อนั้น โดยไม่เปลี่ยนสถานะใด", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const created = order(somchai, ORDER_STATUS.paid);
    addParcel(db, { orderId: created.id, trackingNo: "BS0000001250" });

    expect(shippingTarget(db, somchai.id, created.orderNo)).toEqual({ ok: true, trackingNo: "BS0000001250" });
    expect(getShopOrder(db, somchai.id, created.orderNo)?.status).toBe(ORDER_STATUS.paid);
    expect(findOrderParcel(db, created.id)?.status).toBe(PARCEL_STATUS.awaitingPacking);
  });

  test("ORD-009 คำสั่งซื้อที่ถูกยกเลิกไปแล้วจัดส่งไม่ได้", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const created = order(somchai, ORDER_STATUS.paid);
    addParcel(db, { orderId: created.id });
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(ORDER_STATUS.cancelled, created.id);

    expect(shippingTarget(db, somchai.id, created.orderNo)).toEqual({ ok: false, error: "คำสั่งซื้อนี้ถูกยกเลิกแล้ว จัดส่งไม่ได้" });
  });

  test("ORD-009 คำสั่งซื้อของร้านอื่นจัดส่งไม่ได้", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const wichai = newShop("วิชัยรองเท้า");
    const theirs = order(wichai, ORDER_STATUS.paid);
    addParcel(db, { orderId: theirs.id });

    expect(shippingTarget(db, somchai.id, theirs.orderNo)).toEqual({ ok: false, error: "ไม่พบคำสั่งซื้อ" });
  });
});

describe("ORD-010 และ ORD-011 หน้าที่เปิดค้างรู้ว่ามีอะไรเปลี่ยน", () => {
  test("ORD-010 คำสั่งซื้อใหม่ไม่แทรกในรายการที่เปิดอยู่ แต่นับเป็นคำสั่งซื้อใหม่", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    for (let i = 0; i < 45; i++) order(somchai);
    const opened = listShopOrders(db, somchai.id, query());
    const before = shopOrdersVersion(db, somchai.id);

    const fresh = order(somchai, ORDER_STATUS.paid);
    const refreshed = listShopOrders(db, somchai.id, query({ asOf: opened.asOf }));

    expect(shopOrdersVersion(db, somchai.id)).not.toBe(before);
    expect(refreshed.items).toEqual(opened.items);
    expect(refreshed.newCount).toBe(1);
    expect(countShopOrders(db, somchai.id).all).toBe(46);
    expect(listShopOrders(db, somchai.id, query()).items[0].orderNo).toBe(fresh.orderNo);
  });

  test("ORD-010 ถามซ้ำหลายครั้งระหว่างเน็ตหลุด นับคำสั่งซื้อใหม่ครั้งเดียว ไม่นับซ้ำ", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    order(somchai);
    const opened = listShopOrders(db, somchai.id, query());
    order(somchai);
    order(somchai);

    const counts = [1, 2, 3].map(() => listShopOrders(db, somchai.id, query({ asOf: opened.asOf })).newCount);

    expect(counts).toEqual([2, 2, 2]);
  });

  test("ORD-011 สถานะคำสั่งซื้อหรือการจัดส่งเปลี่ยน ทำให้หน้าที่เปิดค้างโหลดใหม่", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const created = order(somchai);
    const atOpen = shopOrdersVersion(db, somchai.id);

    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(ORDER_STATUS.paid, created.id);
    const afterPaid = shopOrdersVersion(db, somchai.id);
    const parcel = addParcel(db, { orderId: created.id });
    const afterParcel = shopOrdersVersion(db, somchai.id);
    db.prepare("INSERT INTO parcel_history (parcel_id, status, created_at) VALUES (?, ?, ?)").run(
      parcel.id,
      PARCEL_STATUS.handedOver,
      new Date().toISOString(),
    );

    expect(new Set([atOpen, afterPaid, afterParcel, shopOrdersVersion(db, somchai.id)]).size).toBe(4);
  });

  test("ORD-011 ไม่มีอะไรเปลี่ยน หน้าที่เปิดค้างไม่ต้องโหลดใหม่ และร้านอื่นเปลี่ยนก็ไม่กระทบ", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const wichai = newShop("วิชัยรองเท้า");
    order(somchai);
    const atOpen = shopOrdersVersion(db, somchai.id);

    addParcel(db, { orderId: order(wichai, ORDER_STATUS.paid).id });

    expect(shopOrdersVersion(db, somchai.id)).toBe(atOpen);
  });
});

describe("ORD-012 กันการเปิดคำสั่งซื้อของร้านอื่น", () => {
  test("ORD-012 เปิดคำสั่งซื้อของร้านตัวเองได้", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const created = order(somchai);

    expect(getShopOrder(db, somchai.id, created.orderNo)?.orderNo).toBe(created.orderNo);
  });

  test("ORD-012 คำสั่งซื้อของร้านอื่นได้ผลเหมือนเลขที่ไม่มีอยู่จริง", () => {
    const somchai = newShop("สมชายเสื้อผ้า");
    const wichai = newShop("วิชัยรองเท้า");
    const theirs = order(somchai);

    expect(getShopOrder(db, wichai.id, theirs.orderNo)).toBeNull();
    expect(getShopOrder(db, wichai.id, "9999999999")).toBeNull();
  });
});

describe("คุณภาพ", () => {
  function bigShop() {
    const statuses = Object.values(ORDER_STATUS);
    for (let s = 0; s < 49; s++) order(newShop(`ร้านอื่น ${s}`));
    const shop = newShop("ร้านที่ทดสอบ");
    for (let i = 0; i < 500; i++) {
      const created = order(shop, statuses[i % statuses.length]);
      if (i % statuses.length !== 0) addParcel(db, { orderId: created.id });
    }
    return shop;
  }

  function slowest(run: () => unknown): number {
    const times = Array.from({ length: 100 }, () => {
      const start = performance.now();
      run();
      return performance.now() - start;
    });
    return times.sort((a, b) => a - b)[94];
  }

  test("ORD-Q01 ร้านที่มี 500 คำสั่งซื้อ รายการ ตัวกรอง ค้นหา และรายละเอียด เร็วพอใน 95 จาก 100 ครั้ง", () => {
    const shop = bigShop();
    const someNo = listShopOrders(db, shop.id, query()).items[0].orderNo;
    // งานฝั่งฐานข้อมูลได้ไม่เกิน 5% ของงบ 2 วินาที ส่วนที่เหลือเผื่อการเรนเดอร์และเครือข่าย
    const budgetMs = 100;

    expect(slowest(() => listShopOrders(db, shop.id, query()))).toBeLessThan(budgetMs);
    expect(slowest(() => listShopOrders(db, shop.id, query({ status: ORDER_STATUS.paid, page: 3 })))).toBeLessThan(budgetMs);
    expect(slowest(() => listShopOrders(db, shop.id, query({ q: someNo.slice(-4) })))).toBeLessThan(budgetMs);
    expect(slowest(() => getShopOrder(db, shop.id, someNo))).toBeLessThan(budgetMs);
    expect(slowest(() => countShopOrders(db, shop.id))).toBeLessThan(budgetMs);
  });

  test("ORD-Q01 ค้นหาเลขที่ไม่มีอยู่ก็เร็วพอ", () => {
    const shop = bigShop();

    expect(slowest(() => listShopOrders(db, shop.id, query({ q: "no-such-order" })))).toBeLessThan(100);
  });

  test("ORD-Q03 เปิดและค้นหาคำสั่งซื้อของร้านอื่น 100 รายการ ไม่สำเร็จเลยสักครั้ง", () => {
    const mine = newShop("สมชายเสื้อผ้า");
    const other = newShop("วิชัยรองเท้า");
    order(mine);
    const theirs = Array.from({ length: 100 }, () => order(other, ORDER_STATUS.paid));
    theirs.forEach((created) => addParcel(db, { orderId: created.id }));

    const leaked = theirs.filter(
      (created) =>
        getShopOrder(db, mine.id, created.orderNo) !== null ||
        listShopOrders(db, mine.id, query({ q: created.orderNo })).total > 0 ||
        shippingTarget(db, mine.id, created.orderNo).ok,
    );

    expect(leaked).toEqual([]);
  });

  test("ORD-Q03 ร้านเจ้าของยังเปิดและค้นหาคำสั่งซื้อของตัวเองได้ทุกรายการ", () => {
    const mine = newShop("สมชายเสื้อผ้า");
    const own = Array.from({ length: 100 }, () => order(mine));

    const found = own.filter(
      (created) => getShopOrder(db, mine.id, created.orderNo) !== null && listShopOrders(db, mine.id, query({ q: created.orderNo })).total === 1,
    );

    expect(found).toHaveLength(100);
  });

  test("ORD-Q05 จำนวนที่ตัวกรองตรงกับจำนวนรายการที่ไล่นับทุกหน้า ใน 10 ร้าน", () => {
    const statuses = Object.values(ORDER_STATUS);
    const shops = Array.from({ length: 10 }, (_, s) => {
      const shop = newShop(`ร้าน ${s}`);
      for (let i = 0; i < 20 + s * 7; i++) order(shop, statuses[(i * (s + 3)) % statuses.length]);
      return shop;
    });

    for (const shop of shops) {
      const counts = countShopOrders(db, shop.id);
      for (const status of [null, ...statuses]) {
        const first = listShopOrders(db, shop.id, query({ status }));
        let listed = 0;
        for (let page = 1; page <= first.totalPages; page++) {
          listed += listShopOrders(db, shop.id, query({ status, page, asOf: first.asOf })).items.length;
        }
        expect(listed).toBe(status ? counts[status] : counts.all);
      }
    }
  });

  test("ORD-Q05 หลังสถานะเปลี่ยน จำนวนที่ตัวกรองยังตรงกับรายการ", () => {
    const shop = newShop("สมชายเสื้อผ้า");
    const orders = Array.from({ length: 6 }, () => order(shop));
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(ORDER_STATUS.cancelled, orders[0].id);

    const counts = countShopOrders(db, shop.id);

    expect(listShopOrders(db, shop.id, query({ status: ORDER_STATUS.cancelled })).total).toBe(counts[ORDER_STATUS.cancelled]);
    expect(listShopOrders(db, shop.id, query({ status: ORDER_STATUS.awaitingPayment })).total).toBe(5);
  });
});
