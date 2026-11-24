import { beforeEach, describe, expect, test } from "vitest";
import type { Db } from "@/shared/db";
import { addAccount, addOrder, addParcel, addPayment, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { ORDER_STATUS, PAYMENT_STATUS } from "@/shared/statuses";
import {
  BUYER_CANCEL_REASON,
  CANCEL_REFUSED,
  cancelOrderGroup,
  getBuyerOrder,
  listBuyerOrders,
  ORDERS_PAGE_SIZE,
  parseOrderStatus,
} from "./buyer-orders";

let db: Db;
beforeEach(() => {
  db = createTestDb();
});

// 14:10 เวลาประเทศไทย
const AT_1410 = "2026-11-24T07:10:00.000Z";
const at = (hhmm: string) => new Date(`2026-11-24T${hhmm}:00.000+07:00`);

/** สมชายกดสั่งซื้อเวลา 14:10 ได้คำสั่งซื้อจากร้าน "ผ้าดี" 440 บาท และร้าน "บ้านแก้ว" 190 บาท ในกลุ่มเดียวกัน */
function somchaiOrdersTwoShops() {
  const somchai = addAccount(db, { displayName: "สมชาย" });
  const pradee = addShop(db, { name: "ผ้าดี" });
  const bankaew = addShop(db, { name: "บ้านแก้ว" });
  const shirt = addProduct(db, { shopId: pradee.id, name: "เสื้อยืด", price: 200, stock: 3 });
  const glass = addProduct(db, { shopId: bankaew.id, name: "แก้วน้ำ", price: 150, stock: 2 });
  const first = addOrder(db, {
    buyerAccountId: somchai.id,
    items: [{ variantId: shirt.variantIds[0], quantity: 2 }],
    orderedAt: AT_1410,
  });
  const second = addOrder(db, {
    buyerAccountId: somchai.id,
    items: [{ variantId: glass.variantIds[0], quantity: 1 }],
    orderedAt: AT_1410,
    groupId: first.groupId,
  });
  return { somchai, first, second, shirt, glass };
}

const stockOf = (variantId: number) => Number(db.prepare("SELECT stock FROM variants WHERE id = ?").get(variantId)?.stock);

const status = (orderNo: string) =>
  (db.prepare("SELECT status, cancel_reason, cancelled_at FROM orders WHERE order_no = ?").get(orderNo) as {
    status: string;
    cancel_reason: string | null;
    cancelled_at: string | null;
  });

describe("CHK-009 รายการคำสั่งซื้อของผู้ซื้อ", () => {
  test("CHK-009 เห็นเฉพาะของตัวเอง เรียงจากล่าสุด ครั้งละ 20 รายการ แล้วดูเพิ่มได้อีก 5", () => {
    const somchai = addAccount(db);
    const other = addAccount(db);
    const product = addProduct(db, { price: 150 });
    for (let i = 0; i < 25; i++) {
      addOrder(db, {
        buyerAccountId: somchai.id,
        items: [{ variantId: product.variantIds[0] }],
        orderedAt: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(),
      });
    }
    addOrder(db, { buyerAccountId: other.id, items: [{ variantId: product.variantIds[0] }] });

    const first = listBuyerOrders(db, somchai.id);
    expect(first.orders).toHaveLength(ORDERS_PAGE_SIZE);
    expect(first.orders[0].orderedAt).toBe(new Date(Date.UTC(2026, 10, 1, 0, 24)).toISOString());
    expect(first.next).not.toBeNull();

    const more = listBuyerOrders(db, somchai.id, { after: first.next });
    expect(more.orders).toHaveLength(5);
    expect(more.next).toBeNull();
    const all = [...first.orders, ...more.orders].map((order) => order.orderNo);
    expect(new Set(all).size).toBe(25);
  });

  test("CHK-009 กรองรอจ่ายเงิน เห็นเฉพาะ 2 รายการ พร้อมเวลาหมดเขตและจ่ายได้", () => {
    const { somchai, first, second } = somchaiOrdersTwoShops();
    const paidProduct = addProduct(db);
    addOrder(db, { buyerAccountId: somchai.id, items: [{ variantId: paidProduct.variantIds[0] }], status: ORDER_STATUS.paid });

    const page = listBuyerOrders(db, somchai.id, { status: ORDER_STATUS.awaitingPayment }, at("14:15"));

    expect(page.orders.map((order) => order.orderNo).sort()).toEqual([first.orderNo, second.orderNo].sort());
    const pradee = page.orders.find((order) => order.orderNo === first.orderNo)!;
    expect(pradee).toMatchObject({
      shopName: "ผ้าดี",
      firstItemName: "เสื้อยืด",
      itemCount: 2,
      total: 440,
      status: ORDER_STATUS.awaitingPayment,
      paymentDeadline: at("14:40").toISOString(),
      groupId: first.groupId,
      payable: true,
    });
  });

  test("CHK-009 ยังไม่เคยสั่งซื้อ ได้รายการว่าง", () => {
    const somying = addAccount(db);
    expect(listBuyerOrders(db, somying.id)).toEqual({ orders: [], next: null });
  });

  test("CHK-009 ตัวกรองรับเฉพาะคำสถานะของคำสั่งซื้อ ค่าอื่นถือเป็นทั้งหมด", () => {
    expect(parseOrderStatus("รอจ่ายเงิน")).toBe(ORDER_STATUS.awaitingPayment);
    expect(parseOrderStatus("อะไรก็ได้")).toBeNull();
    expect(parseOrderStatus(undefined)).toBeNull();
    expect(parseOrderStatus(["ยกเลิก"])).toBeNull();
  });
});

describe("CHK-010 รายละเอียดคำสั่งซื้อ", () => {
  test("CHK-010 แสดงสินค้า ราคา และที่อยู่ตามตอนสั่ง แม้ร้านแก้ราคาทีหลัง พร้อมเลขติดตามพัสดุ", () => {
    const { somchai, first, shirt } = somchaiOrdersTwoShops();
    db.prepare("UPDATE orders SET status = ? WHERE order_no = ?").run(ORDER_STATUS.paid, first.orderNo);
    db.prepare("UPDATE variants SET price = 250 WHERE id = ?").run(shirt.variantIds[0]);
    const parcel = addParcel(db, { orderId: first.id });

    const order = getBuyerOrder(db, somchai.id, first.orderNo, at("15:05"))!;

    expect(order).toMatchObject({
      orderNo: first.orderNo,
      shopName: "ผ้าดี",
      status: ORDER_STATUS.paid,
      orderedAt: AT_1410,
      shippingFee: 40,
      total: 440,
      trackingNo: parcel.trackingNo,
      payable: false,
    });
    expect(order.items).toEqual([
      expect.objectContaining({ productName: "เสื้อยืด", unitPrice: 200, quantity: 2 }),
    ]);
    expect(order.shipTo).toMatchObject({ recipientName: "สมชาย ใจดี", phone: "0100000000" });
  });

  test("CHK-010 รอจ่ายเงิน มีคำสั่งซื้ออื่นในกลุ่มเดียวกัน", () => {
    const { somchai, first, second } = somchaiOrdersTwoShops();

    const order = getBuyerOrder(db, somchai.id, first.orderNo, at("14:20"))!;

    expect(order.payable).toBe(true);
    expect(order.group.map((o) => [o.orderNo, o.shopName])).toEqual([
      [first.orderNo, "ผ้าดี"],
      [second.orderNo, "บ้านแก้ว"],
    ]);
  });

  test("CHK-010 คำสั่งซื้อของคนอื่นหรือไม่มีอยู่ ได้ null เหมือนกัน", () => {
    const { first } = somchaiOrdersTwoShops();
    const somying = addAccount(db);

    expect(getBuyerOrder(db, somying.id, first.orderNo)).toBeNull();
    expect(getBuyerOrder(db, somying.id, "0000000000")).toBeNull();
  });

  test("CHK-010 เลยเวลาหมดเขตแล้วจ่ายไม่ได้ แม้สถานะยังไม่ถูกเปลี่ยน", () => {
    const { somchai, first } = somchaiOrdersTwoShops();
    expect(getBuyerOrder(db, somchai.id, first.orderNo, at("14:40"))!.payable).toBe(false);
  });
});

describe("CHK-011 ผู้ซื้อยกเลิกคำสั่งซื้อตอนรอจ่ายเงิน", () => {
  test("CHK-011 INV-013 ยกเลิกทั้งกลุ่ม เหตุผลผู้ซื้อยกเลิก และคืนสต็อกทีละคำสั่งซื้อ", () => {
    const { somchai, first, second, shirt, glass } = somchaiOrdersTwoShops();

    const result = cancelOrderGroup(db, { buyerAccountId: somchai.id, orderNo: first.orderNo }, at("14:20"));

    expect(result).toEqual({ ok: true });
    for (const order of [first, second]) {
      expect(status(order.orderNo)).toEqual({
        status: ORDER_STATUS.cancelled,
        cancel_reason: BUYER_CANCEL_REASON,
        cancelled_at: at("14:20").toISOString(),
      });
    }
    expect(BUYER_CANCEL_REASON).toBe("ผู้ซื้อยกเลิก");
    expect(stockOf(shirt.variantIds[0])).toBe(3 + 2);
    expect(stockOf(glass.variantIds[0])).toBe(2 + 1);
  });

  test("CHK-011 มีการจ่ายเงินที่รอผล ยกเลิกไม่ได้ ทุกอย่างคงเดิม", () => {
    const { somchai, first, second, shirt } = somchaiOrdersTwoShops();
    addPayment(db, { groupId: first.groupId, status: PAYMENT_STATUS.pending });

    const result = cancelOrderGroup(db, { buyerAccountId: somchai.id, orderNo: second.orderNo }, at("14:18"));

    expect(result).toEqual({ ok: false, reason: "paymentPending" });
    expect(CANCEL_REFUSED.paymentPending).toBe("มีการจ่ายเงินที่กำลังรอผลอยู่ กดเปลี่ยนวิธีจ่ายก่อนจึงยกเลิกได้");
    expect(status(first.orderNo).status).toBe(ORDER_STATUS.awaitingPayment);
    expect(status(second.orderNo).status).toBe(ORDER_STATUS.awaitingPayment);
    expect(stockOf(shirt.variantIds[0])).toBe(3);
  });

  test("CHK-011 การจ่ายเงินที่ไม่สำเร็จหรือเลิกรอแล้ว ไม่กันการยกเลิก", () => {
    const { somchai, first } = somchaiOrdersTwoShops();
    addPayment(db, { groupId: first.groupId, status: PAYMENT_STATUS.failed });
    addPayment(db, { groupId: first.groupId, status: PAYMENT_STATUS.abandoned });

    const result = cancelOrderGroup(db, { buyerAccountId: somchai.id, orderNo: first.orderNo }, at("14:20"));

    expect(result).toEqual({ ok: true });
  });

  test("CHK-011 ระบบรับการจ่ายเงินก่อน ยกเลิกไม่ได้และคำสั่งซื้อยังจ่ายแล้ว", () => {
    const { somchai, first, second, shirt } = somchaiOrdersTwoShops();
    db.prepare("UPDATE orders SET status = ? WHERE group_id = ?").run(ORDER_STATUS.paid, first.groupId);

    const result = cancelOrderGroup(db, { buyerAccountId: somchai.id, orderNo: first.orderNo }, at("14:22"));

    expect(result).toEqual({ ok: false, reason: "alreadyPaid" });
    expect(CANCEL_REFUSED.alreadyPaid).toBe("คำสั่งซื้อนี้จ่ายเงินแล้ว ยกเลิกจากหน้านี้ไม่ได้");
    expect(status(second.orderNo).status).toBe(ORDER_STATUS.paid);
    expect(stockOf(shirt.variantIds[0])).toBe(3);
  });

  test("CHK-011 ยกเลิกซ้ำหลังหมดเวลา เหตุผลเดิมคงอยู่และไม่คืนสต็อกซ้ำ", () => {
    const { somchai, first, shirt } = somchaiOrdersTwoShops();
    db.prepare("UPDATE orders SET status = ?, cancel_reason = 'หมดเวลาจ่ายเงิน', cancelled_at = ? WHERE group_id = ?").run(
      ORDER_STATUS.cancelled,
      at("14:40").toISOString(),
      first.groupId,
    );

    const result = cancelOrderGroup(db, { buyerAccountId: somchai.id, orderNo: first.orderNo }, at("14:43"));

    expect(result).toEqual({ ok: false, reason: "alreadyCancelled" });
    expect(CANCEL_REFUSED.alreadyCancelled).toBe("คำสั่งซื้อนี้ถูกยกเลิกไปแล้ว");
    expect(status(first.orderNo).cancel_reason).toBe("หมดเวลาจ่ายเงิน");
    expect(stockOf(shirt.variantIds[0])).toBe(3);
  });

  test("CHK-011 CHK-008 กดยกเลิกตรงเวลาหมดเขต ได้เหตุผลหมดเวลาจ่ายเงิน และคืนสต็อกครั้งเดียว", () => {
    const { somchai, first, shirt } = somchaiOrdersTwoShops();

    const result = cancelOrderGroup(db, { buyerAccountId: somchai.id, orderNo: first.orderNo }, at("14:40"));

    expect(result).toEqual({ ok: false, reason: "expired" });
    expect(status(first.orderNo)).toMatchObject({ status: ORDER_STATUS.cancelled, cancel_reason: "หมดเวลาจ่ายเงิน" });
    expect(stockOf(shirt.variantIds[0])).toBe(3 + 2);
    cancelOrderGroup(db, { buyerAccountId: somchai.id, orderNo: first.orderNo }, at("14:41"));
    expect(stockOf(shirt.variantIds[0])).toBe(3 + 2);
  });

  test("CHK-011 ยกเลิกคำสั่งซื้อของคนอื่นไม่ได้", () => {
    const { first } = somchaiOrdersTwoShops();
    const somying = addAccount(db);

    const result = cancelOrderGroup(db, { buyerAccountId: somying.id, orderNo: first.orderNo }, at("14:20"));

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(status(first.orderNo).status).toBe(ORDER_STATUS.awaitingPayment);
  });
});
