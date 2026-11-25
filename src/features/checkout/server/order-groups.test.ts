import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getCheckout, placeOrder } from "@/features/checkout/server/checkout";
import {
  CANCEL_REASON,
  checkOrderGroupPayable,
  expireOverdueOrderGroups,
  getOrderGroup,
  startPaymentDeadlineTimer,
} from "@/features/checkout/server/order-groups";
import { reservedQuantity } from "@/features/stock/server/reservation";
import type { Db } from "@/shared/db";
import { addAccount, addAddress, addCartItem, addPayment, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { ORDER_STATUS, PAYMENT_STATUS, STOCK_CHANGE_REASON } from "@/shared/statuses";

let db: Db;
beforeEach(() => {
  db = createTestDb();
});
afterEach(() => {
  vi.useRealTimers();
});

const at = (time: string) => new Date(`2026-11-24T${time}+07:00`);
const stock = (variantId: number) => Number(db.prepare("SELECT stock FROM variants WHERE id = ?").get(variantId)?.stock);
const statuses = (groupId: number) => db.prepare("SELECT status, cancel_reason FROM orders WHERE group_id = ? ORDER BY id").all(groupId);

/** ผู้ซื้อคนใหม่กดสั่งซื้อแบบย่อยเหล่านี้ คืนเลขกลุ่มคำสั่งซื้อ */
function order(items: { variantId: number; quantity?: number }[], now: Date, buyerId = addAccount(db).id): { groupId: number; buyerId: number } {
  if (!db.prepare("SELECT 1 FROM shipping_addresses WHERE account_id = ?").get(buyerId)) addAddress(db, { accountId: buyerId, isDefault: true });
  for (const item of items) addCartItem(db, { accountId: buyerId, ...item });
  const checkout = getCheckout(db, buyerId);
  const lines = checkout.shops.flatMap((shop) => shop.lines.map((l) => ({ cartItemId: l.cartItemId, quantity: l.quantity, unitPrice: l.unitPrice ?? 0 })));
  const result = placeOrder(db, { buyerAccountId: buyerId, addressId: checkout.addresses[0].id, orderKey: checkout.orderKey, lines }, now);
  if (!result.ok) throw new Error(`สั่งซื้อไม่สำเร็จ ${JSON.stringify(result)}`);
  return { groupId: result.groupId, buyerId };
}

/** เสื้อยืด 2 ตัวจากร้านหนึ่ง และแก้วน้ำ 1 ใบจากอีกร้าน สั่งเวลา 14:10 */
function twoShopOrder() {
  const shirt = addProduct(db, { shopId: addShop(db).id, price: 200, stock: 5 }).variantIds[0];
  const glass = addProduct(db, { shopId: addShop(db).id, price: 150, stock: 3 }).variantIds[0];
  return { shirt, glass, ...order([{ variantId: shirt, quantity: 2 }, { variantId: glass }], at("14:10:00")) };
}

describe("getOrderGroup อ่านกลุ่มคำสั่งซื้อให้หน้าจ่ายเงิน", () => {
  test("ได้ยอดรวม เวลาหมดเขต และยอดของแต่ละร้าน เฉพาะเจ้าของกลุ่ม", () => {
    const o = twoShopOrder();
    const group = getOrderGroup(db, o.groupId, o.buyerId);

    expect(group).toMatchObject({ total: 630, paymentDeadline: at("14:40:00").toISOString(), createdAt: at("14:10:00").toISOString() });
    expect(group?.orders.map((x) => [x.total, x.status])).toEqual([
      [440, ORDER_STATUS.awaitingPayment],
      [190, ORDER_STATUS.awaitingPayment],
    ]);
    expect(getOrderGroup(db, o.groupId, addAccount(db).id)).toBeNull();
    expect(getOrderGroup(db, 999, o.buyerId)).toBeNull();
  });
});

describe("CHK-008 หมดเวลาจ่ายเงิน", () => {
  test("CHK-008 ถึง 14:40 คำสั่งซื้อทั้ง 2 รายการเป็น ยกเลิก เหตุผล หมดเวลาจ่ายเงิน และสต็อกกลับมา", () => {
    const o = twoShopOrder();
    expect(expireOverdueOrderGroups(db, at("14:39:59"))).toBe(0);
    expect(expireOverdueOrderGroups(db, at("14:40:00"))).toBe(1);

    expect(statuses(o.groupId)).toEqual([
      { status: ORDER_STATUS.cancelled, cancel_reason: "หมดเวลาจ่ายเงิน" },
      { status: ORDER_STATUS.cancelled, cancel_reason: "หมดเวลาจ่ายเงิน" },
    ]);
    expect([stock(o.shirt), stock(o.glass)]).toEqual([5, 3]);
    expect(checkOrderGroupPayable(db, o.groupId, o.buyerId, at("14:40:30"))).toMatchObject({ payable: false, reason: "expired" });
  });

  test("CHK-008 จ่ายทันก่อน 14:40 คำสั่งซื้อยังเป็น จ่ายแล้ว", () => {
    const o = twoShopOrder();
    db.prepare("UPDATE orders SET status = ?, paid_at = ? WHERE group_id = ?").run(ORDER_STATUS.paid, at("14:25:00").toISOString(), o.groupId);
    expireOverdueOrderGroups(db, at("14:40:00"));

    expect(statuses(o.groupId).map((x) => x.status)).toEqual([ORDER_STATUS.paid, ORDER_STATUS.paid]);
    expect([stock(o.shirt), stock(o.glass)]).toEqual([3, 2]);
  });

  test("CHK-008 จ่ายไม่ผ่านตอน 14:20 ยังรอจ่ายเงิน หมดเขต 14:40 เหมือนเดิม แล้ว 14:45 เป็น ยกเลิก และจ่ายไม่ได้", () => {
    const o = twoShopOrder();
    addPayment(db, { groupId: o.groupId, status: PAYMENT_STATUS.failed });
    expireOverdueOrderGroups(db, at("14:21:00"));

    expect(checkOrderGroupPayable(db, o.groupId, o.buyerId, at("14:21:00"))).toMatchObject({
      payable: true,
      group: { paymentDeadline: at("14:40:00").toISOString() },
    });
    expireOverdueOrderGroups(db, at("14:45:00"));
    expect(statuses(o.groupId).map((x) => x.status)).toEqual([ORDER_STATUS.cancelled, ORDER_STATUS.cancelled]);
    expect(checkOrderGroupPayable(db, o.groupId, o.buyerId, at("14:45:00"))).toMatchObject({ payable: false, reason: "expired" });
  });

  test("CHK-008 เปิดหน้าค้างไว้แล้วกดจ่ายเงิน 14:42 ก่อนรอบตรวจมาถึง ได้ หมดเวลา และคำสั่งซื้อเป็น ยกเลิก ทันที", () => {
    const o = twoShopOrder();
    const check = checkOrderGroupPayable(db, o.groupId, o.buyerId, at("14:42:00"));

    expect(check).toMatchObject({ payable: false, reason: "expired" });
    expect(check.group?.orders.map((x) => x.status)).toEqual([ORDER_STATUS.cancelled, ORDER_STATUS.cancelled]);
    expect([stock(o.shirt), stock(o.glass)]).toEqual([5, 3]);
  });

  test("CHK-008 กลุ่มที่ผู้ซื้อยกเลิกเองหรือจ่ายแล้ว ไม่ใช่ หมดเวลา และกลุ่มของคนอื่นไม่พบ", () => {
    const o = twoShopOrder();
    db.prepare("UPDATE orders SET status = ? WHERE group_id = ?").run(ORDER_STATUS.paid, o.groupId);
    expect(checkOrderGroupPayable(db, o.groupId, o.buyerId, at("14:45:00"))).toMatchObject({ payable: false, reason: "not-awaiting-payment" });
    expect(checkOrderGroupPayable(db, o.groupId, addAccount(db).id, at("14:15:00"))).toEqual({ payable: false, reason: "not-found", group: null });
  });
});

describe("INV-014 คืนสต็อกเมื่อไม่จ่ายเงินภายใน 30 นาที", () => {
  test("INV-014 สั่งรองเท้าชิ้นสุดท้าย 14:00 ไม่จ่าย ถึง 14:30 สต็อกคืนเป็น 1 จองอยู่ 0 และปิติสั่งชิ้นนั้นได้", () => {
    const shoe = addProduct(db, { name: "รองเท้าวิ่ง", stock: 1 }).variantIds[0];
    const mani = order([{ variantId: shoe }], at("14:00:00"));
    expect([stock(shoe), reservedQuantity(db, shoe)]).toEqual([0, 1]);

    expireOverdueOrderGroups(db, at("14:30:00"));
    expect(statuses(mani.groupId)).toEqual([{ status: ORDER_STATUS.cancelled, cancel_reason: CANCEL_REASON.paymentTimeout }]);
    expect([stock(shoe), reservedQuantity(db, shoe)]).toEqual([1, 0]);
    expect(() => order([{ variantId: shoe }], at("14:30:30"))).not.toThrow();
  });

  test("INV-014 จ่ายไม่ผ่านตอน 14:10 ถึง 14:20 ยังรอจ่ายเงิน และสต็อกยังถูกจอง", () => {
    const shoe = addProduct(db, { stock: 1 }).variantIds[0];
    const mani = order([{ variantId: shoe }], at("14:00:00"));
    addPayment(db, { groupId: mani.groupId, status: PAYMENT_STATUS.failed });

    expireOverdueOrderGroups(db, at("14:20:00"));
    expect(statuses(mani.groupId)[0].status).toBe(ORDER_STATUS.awaitingPayment);
    expect([stock(shoe), reservedQuantity(db, shoe)]).toEqual([0, 1]);
  });
});

describe("รอบตรวจหมดเวลาจ่ายเงินที่ทำงานเองโดยไม่ต้องมีคนเปิดหน้าเว็บ", () => {
  const returnedAt = () =>
    db
      .prepare("SELECT created_at FROM stock_history WHERE reason = ?")
      .all(STOCK_CHANGE_REASON.returned)
      .map((row) => new Date(String(row.created_at)).getTime());

  test("CHK-Q03 INV-Q04 คำสั่งซื้อ 100 รายการสั่ง 14:10 ไม่จ่าย ตรวจตอน 14:41 เป็น ยกเลิก ทั้งหมด และสต็อกคืนภายใน 1 นาทีหลังหมดเขต", () => {
    vi.useFakeTimers({ now: at("14:10:00") });
    const glass = addProduct(db, { price: 150, stock: 100 }).variantIds[0];
    for (let i = 0; i < 100; i++) order([{ variantId: glass }], new Date());
    expect(stock(glass)).toBe(0);

    const stop = startPaymentDeadlineTimer(() => db);
    vi.advanceTimersByTime(31 * 60 * 1000);
    stop();

    const rows = db.prepare("SELECT status, cancel_reason FROM orders").all();
    expect(rows).toHaveLength(100);
    expect(rows.every((row) => row.status === ORDER_STATUS.cancelled && row.cancel_reason === "หมดเวลาจ่ายเงิน")).toBe(true);
    expect(stock(glass)).toBe(100);
    const deadline = at("14:40:00").getTime();
    expect(returnedAt()).toHaveLength(100);
    expect(returnedAt().every((time) => time >= deadline && time < deadline + 60 * 1000)).toBe(true);
  });

  test("CHK-Q03 INV-Q04 ระบบปิดตั้งแต่ 14:30 ถึง 15:00 เปิดกลับมาแล้วยกเลิกและคืนสต็อกทันที ไม่เกิน 15:01", () => {
    const glass = addProduct(db, { price: 150, stock: 1 }).variantIds[0];
    const o = order([{ variantId: glass }], at("14:10:00"));
    vi.useFakeTimers({ now: at("15:00:00") });

    const stop = startPaymentDeadlineTimer(() => db);
    stop();

    expect(statuses(o.groupId)).toEqual([{ status: ORDER_STATUS.cancelled, cancel_reason: "หมดเวลาจ่ายเงิน" }]);
    expect(stock(glass)).toBe(1);
    expect(returnedAt()).toEqual([at("15:00:00").getTime()]);
    expect(checkOrderGroupPayable(db, o.groupId, o.buyerId, at("15:00:00"))).toMatchObject({ payable: false });
  });

  test("รอบตรวจที่พังไม่ทำให้แอปล่ม และลองใหม่ในรอบถัดไป", () => {
    vi.useFakeTimers({ now: at("15:00:00") });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    const stop = startPaymentDeadlineTimer(() => {
      calls++;
      if (calls === 1) throw new Error("ฐานข้อมูลไม่ว่าง");
      return db;
    }, 1000);
    vi.advanceTimersByTime(1000);
    stop();

    expect(calls).toBe(2);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  test("เรียกเริ่มซ้ำไม่เปิดรอบตรวจซ้อน", () => {
    vi.useFakeTimers({ now: at("15:00:00") });
    let calls = 0;
    const getDb = () => (calls++, db);
    const stop = startPaymentDeadlineTimer(getDb, 1000);
    startPaymentDeadlineTimer(getDb, 1000);
    vi.advanceTimersByTime(1000);
    stop();

    expect(calls).toBe(2);
  });
});
