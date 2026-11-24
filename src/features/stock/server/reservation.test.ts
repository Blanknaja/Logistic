import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { getCheckout, placeOrder } from "@/features/checkout/server/checkout";
import {
  CANCEL_REASON,
  cancelAwaitingPaymentGroup,
  checkOrderGroupPayable,
  expireOverdueOrderGroups,
} from "@/features/checkout/server/order-groups";
import {
  releaseCancelledOrderStock,
  reservedQuantity,
} from "@/features/stock/server/reservation";
import { openDb, type Db } from "@/shared/db";
import { addAccount, addAddress, addCartItem, addOrder, addProduct } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { ORDER_STATUS, STOCK_CHANGE_REASON } from "@/shared/statuses";

let db: Db;
beforeEach(() => {
  db = createTestDb();
});

const at = (time: string) => new Date(`2026-11-25T${time}+07:00`);
const stock = (variantId: number) => Number(db.prepare("SELECT stock FROM variants WHERE id = ?").get(variantId)?.stock);
const returnLines = (orderId: number) =>
  db.prepare("SELECT change, stock_after, created_at FROM stock_history WHERE order_id = ? AND reason = ?").all(orderId, STOCK_CHANGE_REASON.returned);

function order(variantId: number, quantity: number, now: Date) {
  const buyer = addAccount(db);
  addAddress(db, { accountId: buyer.id, isDefault: true });
  addCartItem(db, { accountId: buyer.id, variantId, quantity });
  const checkout = getCheckout(db, buyer.id);
  const line = checkout.shops[0].lines[0];
  const result = placeOrder(
    db,
    {
      buyerAccountId: buyer.id,
      addressId: checkout.addresses[0].id,
      orderKey: checkout.orderKey,
      lines: [{ cartItemId: line.cartItemId, quantity, unitPrice: line.unitPrice ?? 0 }],
    },
    now,
  );
  if (!result.ok) throw new Error(JSON.stringify(result));
  const orderId = Number(db.prepare("SELECT id FROM orders WHERE group_id = ?").get(result.groupId)?.id);
  return { groupId: result.groupId, orderId, buyerId: buyer.id };
}

/** สต็อกปัจจุบันของทุกแบบย่อยที่มีประวัติ ต้องเท่ากับ "สต็อกหลังเปลี่ยน" ของบรรทัดล่าสุด */
function stockMismatches(database: Db) {
  return database
    .prepare(
      `SELECT v.id, v.stock, h.stock_after FROM variants v
       JOIN stock_history h ON h.id = (SELECT max(id) FROM stock_history WHERE variant_id = v.id)
       WHERE v.stock != h.stock_after`,
    )
    .all();
}

describe("INV-013 คืนสต็อกเมื่อคำสั่งซื้อถูกยกเลิก", () => {
  test("INV-013 มานียกเลิกคำสั่งซื้อลูกฟุตบอล 2 ชิ้น สต็อกเป็น 10 จองอยู่ 0 ประวัติ +2 เหลือ 10 และคนอื่นสั่งได้ทันที", () => {
    const ball = addProduct(db, { stock: 10 }).variantIds[0];
    const mani = order(ball, 2, at("09:10:00"));
    expect([stock(ball), reservedQuantity(db, ball)]).toEqual([8, 2]);

    expect(cancelAwaitingPaymentGroup(db, mani.groupId, CANCEL_REASON.buyer, at("09:15:00"))).toBe(1);
    expect([stock(ball), reservedQuantity(db, ball)]).toEqual([10, 0]);
    expect(returnLines(mani.orderId)).toEqual([{ change: 2, stock_after: 10, created_at: at("09:15:00").toISOString() }]);
    expect(() => order(ball, 10, at("09:16:00"))).not.toThrow();
  });

  test("INV-013 พัสดุส่งไม่สำเร็จ คำสั่งซื้อที่จ่ายแล้วเป็น ยกเลิก แล้วคืนสต็อก +1 เหลือ 10", () => {
    const ball = addProduct(db, { stock: 9 }).variantIds[0];
    const piti = addOrder(db, { buyerAccountId: addAccount(db).id, items: [{ variantId: ball }], status: ORDER_STATUS.shipping });
    db.prepare("UPDATE orders SET status = ?, cancel_reason = ? WHERE id = ?").run(ORDER_STATUS.cancelled, CANCEL_REASON.deliveryFailed, piti.id);

    expect(releaseCancelledOrderStock(db, piti.id, at("15:30:00"))).toBe(true);
    expect(stock(ball)).toBe(10);
    expect(returnLines(piti.id)).toEqual([{ change: 1, stock_after: 10, created_at: at("15:30:00").toISOString() }]);
  });

  test("INV-013 ยกเลิกสองทางในวินาทีเดียวกับที่ครบ 30 นาที สต็อกคืนครั้งเดียว เป็น 10 ไม่ใช่ 12", () => {
    const ball = addProduct(db, { stock: 10 }).variantIds[0];
    const mani = order(ball, 2, at("10:00:00"));

    expect(cancelAwaitingPaymentGroup(db, mani.groupId, CANCEL_REASON.buyer, at("10:30:00"))).toBe(1);
    expect(expireOverdueOrderGroups(db, at("10:30:00"))).toBe(0);
    expect(cancelAwaitingPaymentGroup(db, mani.groupId, CANCEL_REASON.paymentTimeout, at("10:30:00"))).toBe(0);
    expect(releaseCancelledOrderStock(db, mani.orderId, at("10:30:00"))).toBe(false);

    expect(stock(ball)).toBe(10);
    expect(returnLines(mani.orderId)).toHaveLength(1);
    expect(db.prepare("SELECT cancel_reason FROM orders WHERE id = ?").get(mani.orderId)).toEqual({ cancel_reason: "ผู้ซื้อยกเลิก" });
  });

  test("INV-013 ผลการจ่ายเงินมาถึงหลังยกเลิก กลุ่มจ่ายไม่ได้แล้ว และสต็อกไม่ถูกจองกลับ", () => {
    const ball = addProduct(db, { stock: 10 }).variantIds[0];
    const mani = order(ball, 2, at("10:00:00"));
    expireOverdueOrderGroups(db, at("10:30:00"));

    expect(checkOrderGroupPayable(db, mani.groupId, mani.buyerId, at("10:31:00"))).toMatchObject({ payable: false, reason: "expired" });
    expect(stock(ball)).toBe(10);
  });

  test("INV-013 คืนสต็อกของคำสั่งซื้อที่ยังไม่ถูกยกเลิกไม่ได้", () => {
    const ball = addProduct(db, { stock: 10 }).variantIds[0];
    const mani = order(ball, 2, at("10:00:00"));

    expect(() => releaseCancelledOrderStock(db, mani.orderId)).toThrow(/ยกเลิก/);
    expect(() => releaseCancelledOrderStock(db, 999)).toThrow();
    expect(stock(ball)).toBe(8);
  });

});

describe("INV-Q05 สต็อกตรงกับประวัติ", () => {
  test("INV-Q05 หลังจอง ยกเลิก หมดเวลา และจองใหม่ สต็อกของทุกแถวเท่ากับบรรทัดล่าสุดในประวัติ", () => {
    const ball = addProduct(db, { stock: 10, recordStockHistory: true }).variantIds[0];
    const bread = addProduct(db, { stock: 6, recordStockHistory: true }).variantIds[0];
    const a = order(ball, 2, at("09:00:00"));
    order(bread, 1, at("09:00:00"));
    cancelAwaitingPaymentGroup(db, a.groupId, CANCEL_REASON.buyer, at("09:05:00"));
    expireOverdueOrderGroups(db, at("09:31:00"));
    order(ball, 10, at("09:32:00"));

    expect(stockMismatches(db)).toEqual([]);
    expect([stock(ball), stock(bread)]).toEqual([0, 6]);
  });

  test("INV-Q05 การสั่งซื้อที่ไม่สำเร็จและการสร้างที่พังกลางทาง ไม่ทิ้งบรรทัดประวัติหรือสต็อกที่ไม่ตรงกัน", () => {
    const ball = addProduct(db, { stock: 1, recordStockHistory: true }).variantIds[0];
    order(ball, 1, at("09:00:00"));
    expect(() => order(ball, 1, at("09:01:00"))).toThrow(/สินค้าหมด/);
    db.exec("CREATE TEMP TRIGGER boom BEFORE INSERT ON order_items BEGIN SELECT RAISE(ABORT, 'พัง'); END");
    db.prepare("UPDATE variants SET stock = 5 WHERE id = ?").run(ball);
    db.prepare("INSERT INTO stock_history (variant_id, reason, change, stock_after, created_at) VALUES (?, ?, 5, 5, ?)").run(
      ball,
      STOCK_CHANGE_REASON.sellerEdit,
      at("09:02:00").toISOString(),
    );
    expect(() => order(ball, 1, at("09:03:00"))).toThrow("พัง");

    expect(stockMismatches(db)).toEqual([]);
    expect(stock(ball)).toBe(5);
  });
});

describe("INV-Q07 การเก็บข้อมูล", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "blanksong-inv-q07-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const snapshot = (database: Db) => ({
    stock: database.prepare("SELECT id, stock FROM variants ORDER BY id").all(),
    history: Number(database.prepare("SELECT count(*) AS n FROM stock_history").get()?.n),
  });

  test("INV-Q07 ปิดและเปิดระบบใหม่ สต็อกและประวัติสต็อกอยู่ครบ", () => {
    const path = join(dir, "blanksong.db");
    db = openDb(path);
    const ball = addProduct(db, { stock: 10, recordStockHistory: true }).variantIds[0];
    const mani = order(ball, 2, at("09:00:00"));
    cancelAwaitingPaymentGroup(db, mani.groupId, CANCEL_REASON.buyer, at("09:05:00"));
    order(ball, 3, at("09:06:00"));
    const before = snapshot(db);
    db.close();

    db = openDb(path);
    expect(snapshot(db)).toEqual(before);
    expect(before.history).toBe(4);
    db.close();
  });

  test("INV-Q07 ระบบปิดระหว่างกำลังสั่งซื้อ เปิดใหม่แล้วไม่มีการจองค้างครึ่งทาง", () => {
    const path = join(dir, "blanksong.db");
    db = openDb(path);
    const ball = addProduct(db, { stock: 10 }).variantIds[0];
    const before = snapshot(db);
    db.exec("BEGIN IMMEDIATE");
    order(ball, 2, at("09:00:00"));
    db.close();

    db = openDb(path);
    expect(snapshot(db)).toEqual(before);
    expect(Number(db.prepare("SELECT count(*) AS n FROM orders").get()?.n)).toBe(0);
    db.close();
  });
});
